/**
 * AUD-006 (incident 2026-05-14): a single-use payment link must never end up
 * with two captured payments, even when the first payer's request outlives
 * the reservation timeout. Synchronisation is explicit (gated acquirer calls),
 * never a sleep. `PAYMENT_LINK_RESERVATION_TIMEOUT_SECONDS` is 0 here, so every
 * reservation is already "stale" the moment a second request arrives — the
 * worst case of a slow (3DS step-up) first attempt.
 *
 * The database rule (migration 0080) is "at most one non-voided transaction per
 * link"; the pay flow refuses to take over a link whose transaction is still
 * live. Neither guarantees exactly-once at the acquirer: a request that loses
 * at the database may leave an uncaptured authorization hold there.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { loadConfig } from "../config.js";
import { createAcquirerSimulator } from "../acquirer/simulator.js";
import type { AcquirerSimulator } from "../acquirer/types.js";
import { recordKycReview } from "../onboarding/review.js";
import { authorizeTransaction } from "../payments/authorize.js";
import { captureTransaction } from "../payments/capture.js";
import { createPaymentLink } from "./create.js";
import { payPaymentLink } from "./pay.js";
import { toFils } from "@filspay/money";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("payConcurrency.test.ts requires DATABASE_URL to point at a real, migrated Postgres");

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});
const pool = new Pool({ connectionString: databaseUrl, max: 10 });
const base = createAcquirerSimulator(config);
const stale = { paymentLinkReservationTimeoutSeconds: 0 };
test.after(async () => {
  await pool.end();
});

const CARD_A = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };
const CARD_B = { pan: "4242424242424242", expiryMonth: 11, expiryYear: 2031, cvv: "456" };

async function merchantWithLink(label: string) {
  const m = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Pay Concurrency ${label} ${randomUUID()}`],
  );
  const merchantId = m.rows[0]!.id;
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const link = await createPaymentLink(pool, config, {
    merchantId,
    amountFils: 5_000,
    reference: `inv-${label}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    createdByType: "merchant_api_key",
    createdById: randomUUID(),
  });
  return { merchantId, linkId: link.id, token: link.token };
}

/** Wraps the simulator so one call kind blocks until released. */
function gate(kind: "authorize" | "capture"): { acquirer: AcquirerSimulator; entered: Promise<void>; release: () => void } {
  let release!: () => void;
  let markEntered!: () => void;
  const opened = new Promise<void>((r) => (release = r));
  const entered = new Promise<void>((r) => (markEntered = r));
  const acquirer: AcquirerSimulator = {
    authorize: async (req) => {
      if (kind === "authorize") {
        markEntered();
        await opened;
      }
      return base.authorize(req);
    },
    capture: async (req) => {
      if (kind === "capture") {
        markEntered();
        await opened;
      }
      return base.capture(req);
    },
    refund: (req) => base.refund(req),
  };
  return { acquirer, entered, release };
}

async function linkState(linkId: string, merchantId: string) {
  const link = await pool.query<{ status: string; transaction_id: string | null }>(
    `SELECT status, transaction_id FROM payment_links WHERE id = $1`,
    [linkId],
  );
  const txns = await pool.query<{ id: string; status: string; captured_fils: string }>(
    `SELECT id, status, captured_fils::text FROM transactions WHERE merchant_id = $1 ORDER BY created_at`,
    [merchantId],
  );
  const captured = txns.rows.filter((t) => Number(t.captured_fils) > 0);
  return { link: link.rows[0]!, txns: txns.rows, captured };
}

const pay = (acquirer: AcquirerSimulator, token: string, card = CARD_A) =>
  payPaymentLink(pool, acquirer, stale, { token, card, idempotencyKey: randomUUID() });

test("AUD-006: a second payer cannot take over a link while the first capture is still in flight", async () => {
  const { merchantId, linkId, token } = await merchantWithLink("slow-capture");
  const slow = gate("capture");

  const first = pay(slow.acquirer, token, CARD_A);
  await slow.entered; // first request is inside the acquirer capture, holding the transaction row lock

  let second;
  try {
    second = await pay(base, token, CARD_B);
  } finally {
    slow.release(); // never leave the first request parked, even when an assertion fails
  }
  const firstResult = await first;
  assert.equal(second.statusCode, 409, JSON.stringify(second.body));
  assert.equal((second.body as { error: string }).error, "payment_link_processing");
  assert.equal(firstResult.statusCode, 200, JSON.stringify(firstResult.body));

  const s = await linkState(linkId, merchantId);
  assert.equal(s.captured.length, 1, `exactly one captured payment, got ${JSON.stringify(s.txns)}`);
  assert.equal(s.txns.length, 1, "the second payer never authorized");
  assert.equal(s.link.status, "paid");
  assert.equal(s.link.transaction_id, s.captured[0]!.id);
});

test("AUD-006: two payers racing through a slow authorization produce one payment; the loser gets 409", async () => {
  const { merchantId, linkId, token } = await merchantWithLink("slow-authorize");
  const slow = gate("authorize");

  const first = pay(slow.acquirer, token, CARD_A);
  await slow.entered; // first request is waiting on the acquirer, no transaction row yet

  let second;
  try {
    second = await pay(base, token, CARD_B);
  } finally {
    slow.release();
  }
  const firstResult = await first.catch((err: unknown) => ({ statusCode: -1, body: String(err) }));
  assert.equal(second.statusCode, 200, JSON.stringify(second.body));
  assert.equal(firstResult.statusCode, 409, JSON.stringify(firstResult.body));

  const s = await linkState(linkId, merchantId);
  assert.equal(s.captured.length, 1, `exactly one captured payment, got ${JSON.stringify(s.txns)}`);
  assert.equal(s.link.status, "paid");
  assert.equal(s.link.transaction_id, s.captured[0]!.id);
});

test("AUD-006 recovery: an abandoned authorization (crash before capture) is voided and the link can be paid", async () => {
  const { merchantId, linkId, token } = await merchantWithLink("abandoned-auth");
  const auth = await authorizeTransaction(pool, base, {
    merchantId,
    amountFils: toFils(5_000),
    card: CARD_A,
    idempotencyKey: `test:${randomUUID()}`,
    actor: { type: "system" },
    paymentLinkId: linkId,
  });
  assert.equal(auth.statusCode, 201);
  const abandonedId = (auth.body as { id: string }).id;
  await pool.query(`UPDATE payment_links SET status = 'reserved', reserved_at = now() - interval '1 hour' WHERE id = $1`, [linkId]);

  const res = await pay(base, token, CARD_B);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));

  const s = await linkState(linkId, merchantId);
  assert.equal(s.txns.find((t) => t.id === abandonedId)!.status, "voided");
  assert.equal(s.captured.length, 1);
  assert.equal(s.link.transaction_id, s.captured[0]!.id);
});

test("AUD-006 recovery: a capture that was never finalized (crash after capture) marks the link paid, no second charge", async () => {
  const { merchantId, linkId, token } = await merchantWithLink("unfinalized");
  const auth = await authorizeTransaction(pool, base, {
    merchantId,
    amountFils: toFils(5_000),
    card: CARD_A,
    idempotencyKey: `test:${randomUUID()}`,
    actor: { type: "system" },
    paymentLinkId: linkId,
  });
  const txnId = (auth.body as { id: string }).id;
  const cap = await captureTransaction(pool, base, {
    transactionId: txnId,
    merchantId,
    idempotencyKey: `test:${randomUUID()}`,
    actor: { type: "system", id: linkId },
  });
  assert.equal(cap.statusCode, 200);
  await pool.query(`UPDATE payment_links SET status = 'reserved', reserved_at = now() - interval '1 hour' WHERE id = $1`, [linkId]);

  const res = await pay(base, token, CARD_B);
  assert.equal(res.statusCode, 409, JSON.stringify(res.body));
  assert.equal((res.body as { error: string }).error, "payment_link_already_paid");

  const s = await linkState(linkId, merchantId);
  assert.equal(s.txns.length, 1, "no new authorization");
  assert.equal(s.link.status, "paid");
  assert.equal(s.link.transaction_id, txnId);
});

test("AUD-006 recovery: a declined capture voids its own authorization and frees the link", async () => {
  const { merchantId, linkId, token } = await merchantWithLink("declined-capture");
  const declining: AcquirerSimulator = {
    authorize: (req) => base.authorize(req),
    capture: async (req) => ({ outcome: "declined", acquirerReference: req.acquirerReference, latencyMs: 0 }),
    refund: (req) => base.refund(req),
  };
  const failed = await pay(declining, token, CARD_A);
  assert.notEqual(failed.statusCode, 200);

  let s = await linkState(linkId, merchantId);
  assert.equal(s.link.status, "active");
  assert.deepEqual(s.txns.map((t) => t.status), ["voided"]);

  const ok = await pay(base, token, CARD_B);
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  s = await linkState(linkId, merchantId);
  assert.equal(s.captured.length, 1);
});

test("AUD-007: an expired link cannot be paid by backdating submittedAt; the server clock decides", async () => {
  const { merchantId, linkId, token } = await merchantWithLink("expired-backdated");
  await pool.query(`UPDATE payment_links SET expires_at = now() - interval '1 minute' WHERE id = $1`, [linkId]);

  for (const submittedAt of [new Date(Date.now() - 3_600_000).toISOString(), "2020-01-01T00:00:00.000Z"]) {
    const res = await payPaymentLink(pool, base, stale, { token, card: CARD_A, idempotencyKey: randomUUID(), submittedAt });
    assert.equal(res.statusCode, 410, `submittedAt ${submittedAt}: ${JSON.stringify(res.body)}`);
    assert.equal((res.body as { error: string }).error, "payment_link_expired");
  }
  const s = await linkState(linkId, merchantId);
  assert.equal(s.txns.length, 0, "no authorization on an expired link");
  assert.equal(s.link.status, "active");
});

test("AUD-007: a link that has not expired pays even if the client sends a future or bogus submittedAt", async () => {
  const { merchantId, linkId, token } = await merchantWithLink("future-submitted");
  await pool.query(`UPDATE payment_links SET expires_at = now() + interval '2 minutes' WHERE id = $1`, [linkId]);
  const res = await payPaymentLink(pool, base, stale, {
    token,
    card: CARD_A,
    idempotencyKey: randomUUID(),
    submittedAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal((await linkState(linkId, merchantId)).link.status, "paid");
});
