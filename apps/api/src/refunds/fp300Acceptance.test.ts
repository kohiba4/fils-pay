/**
 * FP-300 acceptance ("done when", brief back page), end to end through the HTTP
 * API on a real Postgres. REFUNDS_ENABLED is turned on in THIS test's config
 * only (the deployed default stays off until decision Q13).
 *
 * Covers: works through the API; ledger right to the fils; fees right; the shop
 * gets the right webhook (refund.succeeded, AUD-030); timeline; the transaction
 * DTO; retries (Idempotency-Key) and a concurrent over-refund. Settlement payout
 * and reconciliation of refunds are Track A's FP-300 PR 2 tests (Go + routes).
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { recordKycReview } from "../onboarding/review.js";
import { createWebhookEndpoint } from "../webhooks/create.js";
import { runDispatchPass } from "../webhooks/dispatcher.js";
import type { WebhookTransport } from "../webhooks/transport.js";
import { WEBHOOK_SIGNATURE_HEADER } from "../webhooks/headers.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("fp300Acceptance.test.ts requires DATABASE_URL to point at a real, migrated Postgres");

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
  REFUNDS_ENABLED: "true",
});
const pool = new Pool({ connectionString: databaseUrl, max: 10 });
const app = buildApp(config, pool);
test.after(async () => {
  await app.close();
  await pool.end();
});

const CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };

test("FP-300: partial refunds through the API move the right fils, reverse the right fee, reach the timeline and the webhook", async () => {
  const m = await pool.query<{ id: string }>(`INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`, [
    `FP-300 acceptance ${randomUUID()}`,
  ]);
  const merchantId = m.rows[0]!.id;
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'owner', 'x') RETURNING id`,
    [merchantId, `owner-${randomUUID()}@example.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const key = await issueApiKey(pool, config, { merchantId, createdBy: owner.rows[0]!.id, label: "fp300" });
  const auth = { authorization: `Bearer ${key.rawKey}` };
  const hookUrl = `http://fp300-receiver.test/${randomUUID()}`;
  const endpoint = await createWebhookEndpoint(pool, config, { merchantId, url: hookUrl, createdByType: "merchant_api_key", createdById: randomUUID() });

  const authz = await app.inject({ method: "POST", url: "/v1/transactions", headers: { ...auth, "idempotency-key": randomUUID() },
    payload: { amountFils: 10_000, card: CARD, reference: "fp300" } });
  assert.equal(authz.statusCode, 201, authz.body);
  const txnId = (authz.json() as { id: string }).id;
  const cap = await app.inject({ method: "POST", url: `/v1/transactions/${txnId}/capture`, headers: { ...auth, "idempotency-key": randomUUID() }, payload: {} });
  assert.equal(cap.statusCode, 200, cap.body);
  const fee = await pool.query<{ fee: string }>(
    `SELECT COALESCE(SUM(amount_fils), 0)::text AS fee FROM ledger_entries WHERE transaction_id = $1 AND account_id = 'platform_fee_revenue' AND direction = 'credit'`,
    [txnId],
  );
  const feeCharged = Number(fee.rows[0]!.fee);
  assert.equal(feeCharged, 250, "250 bps on 10.000 BD");

  const refund = (amountFils: number, idem = randomUUID()) =>
    app.inject({ method: "POST", url: "/v1/refunds", headers: { ...auth, "idempotency-key": idem }, payload: { transactionId: txnId, amountFils } });

  // Partial refund + a client retry with the same key: one refund.
  const idem = randomUUID();
  const r1 = await refund(3_000, idem);
  assert.equal(r1.statusCode, 200, r1.body);
  const r1again = await refund(3_000, idem);
  assert.equal(r1again.statusCode, 200);
  assert.equal(r1again.json().id, r1.json().id, "a retry replays the same refund");
  const r2 = await refund(2_000);
  assert.equal(r2.statusCode, 200, r2.body);

  // Two concurrent refunds that together exceed what is left (5,000): at most one succeeds.
  const [c1, c2] = await Promise.all([refund(3_000), refund(3_000)]);
  const ok = [c1, c2].filter((r) => r.statusCode === 200).length;
  assert.equal(ok, 1, `exactly one of two over-refunding requests succeeds (${c1.statusCode}/${c2.statusCode})`);
  const over = await refund(2_001);
  assert.ok(over.statusCode >= 400 && over.statusCode < 500, "more than what is left is refused");

  const refunds = await pool.query<{ amount_fils: string; fee_reversed_fils: string }>(
    `SELECT amount_fils, fee_reversed_fils FROM refunds WHERE transaction_id = $1 AND status = 'succeeded'`,
    [txnId],
  );
  const refunded = refunds.rows.reduce((a, r) => a + Number(r.amount_fils), 0);
  const reversed = refunds.rows.reduce((a, r) => a + Number(r.fee_reversed_fils), 0);
  assert.equal(refunded, 8_000);
  assert.equal(reversed, 200, "fee reversed in proportion: 8,000 of 10,000 refunded → 200 of 250 fils");

  // Ledger: every refund group balances; merchant payable falls by refunds minus the fee given back.
  const groups = await pool.query<{ unbalanced: number }>(
    `SELECT count(*)::int AS unbalanced FROM (
       SELECT entry_group_id FROM ledger_entries WHERE transaction_id = $1
        GROUP BY entry_group_id
       HAVING SUM(CASE direction WHEN 'debit' THEN amount_fils ELSE -amount_fils END) <> 0) x`,
    [txnId],
  );
  assert.equal(groups.rows[0]!.unbalanced, 0);
  const payable = await pool.query<{ net: string }>(
    `SELECT SUM(CASE direction WHEN 'credit' THEN amount_fils ELSE -amount_fils END)::text AS net
       FROM ledger_entries WHERE transaction_id = $1 AND account_id = 'merchant_payable'`,
    [txnId],
  );
  assert.equal(Number(payable.rows[0]!.net), 10_000 - 250 - 8_000 + 200, "capture net minus refunds plus reversed fee");

  // Transaction DTO and timeline.
  const detail = await app.inject({ method: "GET", url: `/v1/transactions/${txnId}`, headers: auth });
  assert.equal(detail.statusCode, 200);
  const dto = detail.json() as { status: string; capturedFils: number; refundedFils: number };
  assert.deepEqual([dto.status, dto.capturedFils, dto.refundedFils], ["partially_refunded", 10_000, 8_000]);
  const events = await app.inject({ method: "GET", url: `/v1/transactions/${txnId}/events`, headers: auth });
  const list = (events.json() as Array<{ eventType: string; amountFils: number | null }>) ?? [];
  const refundEvents = (Array.isArray(list) ? list : (list as { events: typeof list }).events).filter((e) => e.eventType.startsWith("refund"));
  assert.equal(refundEvents.length, 3);
  assert.equal(refundEvents.reduce((a, e) => a + (e.amountFils ?? 0), 0), -8_000);

  // Webhook: one signed refund.succeeded per refund, to this merchant's endpoint.
  const seen: Array<{ body: string; sig: string }> = [];
  const transport: WebhookTransport = async (req) => {
    if (req.url === hookUrl) seen.push({ body: req.body, sig: req.headers[WEBHOOK_SIGNATURE_HEADER]! });
    return { statusCode: 200, body: "" };
  };
  for (let i = 0; i < 20; i++) {
    await runDispatchPass(pool, transport, config);
    const pending = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM webhook_deliveries WHERE endpoint_id = $1 AND status = 'pending'`, [endpoint.id]);
    if (pending.rows[0]!.n === 0) break;
  }
  const refundHooks = seen.map((s) => ({ ...s, json: JSON.parse(s.body) as { type: string; data: Record<string, unknown> } })).filter((s) => s.json.type === "refund.succeeded");
  assert.equal(refundHooks.length, 3, "one refund.succeeded webhook per refund");
  assert.deepEqual(refundHooks.map((h) => h.json.data.amountFils).sort(), [2_000, 3_000, 3_000]);
  for (const h of refundHooks) {
    assert.equal(h.json.data.transactionId, txnId);
    assert.equal(h.json.data.merchantId, merchantId);
    const t = /t=(\d+)/.exec(h.sig)?.[1];
    const v1 = /v1=([0-9a-f]+)/.exec(h.sig)?.[1];
    assert.equal(createHmac("sha256", endpoint.secret).update(`${t}.${h.body}`).digest("hex"), v1, "signed over the bytes sent");
  }
});
