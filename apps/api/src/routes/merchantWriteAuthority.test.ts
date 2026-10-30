/**
 * AUD-046 + AUD-024 (decision Q4): who may move money on a merchant's
 * transactions.
 *
 * - capture and void are owner/finance only for session actors; a
 *   merchant `support` user is refused (AUD-046).
 * - every admin impersonation grant resolves to read-only merchant `support`,
 *   whatever the admin's own role, and a grant can never perform a write
 *   (AUD-024). A disabled admin's grant stops working.
 * - API keys keep full merchant authority (the documented contract in
 *   requireMerchantRole), and another merchant's transaction stays out of reach.
 * - a refused request leaves no side effect: status, captured amount, events
 *   and ledger rows are unchanged.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { recordKycReview } from "../onboarding/review.js";
import { sha256Hex, randomToken } from "../lib/crypto.js";
import { requireMerchantWriterActor } from "../auth/requireMerchantAuth.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("merchantWriteAuthority.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);

test.after(async () => {
  await app.close();
  await pool.end();
});

const VALID_CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };
type MerchantRole = "owner" | "finance" | "support";
type AdminRole = "support" | "finance" | "super_admin";

async function createMerchant(label: string) {
  const m = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Write Authority ${label} ${randomUUID()}`],
  );
  const merchantId = m.rows[0]!.id;
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused-in-these-tests') RETURNING id`,
    [merchantId, `owner-${randomUUID()}@example.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const issued = await issueApiKey(pool, config, { merchantId, createdBy: owner.rows[0]!.id, label });
  return { merchantId, rawKey: issued.rawKey };
}

async function sessionHeaders(merchantId: string, role: MerchantRole) {
  const user = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, $3, 'unused-in-these-tests') RETURNING id`,
    [merchantId, `${role}-${randomUUID()}@example.test`, role],
  );
  const rawToken = randomToken(32);
  await pool.query(
    `INSERT INTO sessions (merchant_user_id, token_hash, authenticated, expires_at)
     VALUES ($1, $2, true, now() + interval '1 hour')`,
    [user.rows[0]!.id, sha256Hex(rawToken)],
  );
  return { cookie: `${config.cookieName}=${rawToken}` };
}

async function impersonationHeaders(merchantId: string, adminRole: AdminRole, adminStatus: "active" | "disabled" = "active") {
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (email, password_hash, display_name, role, status)
     VALUES ($1, 'not-a-real-hash', 'Write Authority Test', $2, $3) RETURNING id`,
    [`imp-${randomUUID()}@admin.test`, adminRole, adminStatus],
  );
  const rawToken = randomToken(32);
  await pool.query(
    `INSERT INTO admin_impersonation_grants (admin_user_id, merchant_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [admin.rows[0]!.id, merchantId, sha256Hex(rawToken)],
  );
  return { cookie: `${config.impersonationCookieName}=${rawToken}` };
}

async function authorizedTxn(rawKey: string, amountFils = 10_000): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/transactions",
    headers: { authorization: `Bearer ${rawKey}`, "idempotency-key": randomUUID() },
    payload: { amountFils, card: VALID_CARD, reference: "write-authority" },
  });
  assert.equal(res.statusCode, 201, res.body);
  return (res.json() as { id: string }).id;
}

function capture(id: string, headers: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: `/v1/transactions/${id}/capture`,
    headers: { ...headers, "idempotency-key": randomUUID() },
    payload: {},
  });
}

function voidTxn(id: string, headers: Record<string, string>) {
  return app.inject({ method: "POST", url: `/v1/transactions/${id}/void`, headers });
}

/** Everything a capture or void would change. */
async function snapshot(id: string) {
  const r = await pool.query<{ status: string; captured: string; events: number; ledger: number; outbox: number }>(
    `SELECT t.status, t.captured_fils::text AS captured,
            (SELECT count(*)::int FROM transaction_events WHERE transaction_id = t.id) AS events,
            (SELECT count(*)::int FROM ledger_entries WHERE transaction_id = t.id) AS ledger,
            (SELECT count(*)::int FROM outbox_events WHERE aggregate_id = t.id) AS outbox
       FROM transactions t WHERE t.id = $1`,
    [id],
  );
  return r.rows[0]!;
}

test("AUD-046: owner and finance sessions can capture and void", async () => {
  const m = await createMerchant("allowed");
  for (const role of ["owner", "finance"] as const) {
    const headers = await sessionHeaders(m.merchantId, role);
    const toCapture = await authorizedTxn(m.rawKey);
    const c = await capture(toCapture, headers);
    assert.equal(c.statusCode, 200, `${role} capture: ${c.body}`);
    const toVoid = await authorizedTxn(m.rawKey);
    const v = await voidTxn(toVoid, headers);
    assert.equal(v.statusCode, 200, `${role} void: ${v.body}`);
  }
});

test("AUD-046: a merchant support user cannot capture or void, and nothing changes", async () => {
  const m = await createMerchant("support");
  const headers = await sessionHeaders(m.merchantId, "support");
  const id = await authorizedTxn(m.rawKey);
  const before = await snapshot(id);

  const c = await capture(id, headers);
  assert.equal(c.statusCode, 403, c.body);
  const v = await voidTxn(id, headers);
  assert.equal(v.statusCode, 403, v.body);

  assert.deepEqual(await snapshot(id), before);
  assert.equal(before.status, "authorized");

  const read = await app.inject({ method: "GET", url: `/v1/transactions/${id}`, headers });
  assert.equal(read.statusCode, 200, "support keeps read access");
});

test("AUD-024: an impersonation grant is read-only for every admin role", async () => {
  const m = await createMerchant("impersonation");
  for (const adminRole of ["support", "finance", "super_admin"] as const) {
    const headers = await impersonationHeaders(m.merchantId, adminRole);
    const id = await authorizedTxn(m.rawKey);
    const before = await snapshot(id);

    const read = await app.inject({ method: "GET", url: `/v1/transactions/${id}`, headers });
    assert.equal(read.statusCode, 200, `${adminRole} grant can view: ${read.body}`);

    const c = await capture(id, headers);
    assert.equal(c.statusCode, 403, `${adminRole} grant capture: ${c.body}`);
    const v = await voidTxn(id, headers);
    assert.equal(v.statusCode, 403, `${adminRole} grant void: ${v.body}`);

    // Other owner-gated writes stay closed too (super_admin used to map to owner).
    const key = await app.inject({ method: "POST", url: `/v1/merchants/${m.merchantId}/api-keys`, headers, payload: {} });
    assert.ok(key.statusCode === 401 || key.statusCode === 403, `${adminRole} grant api-key issue: ${key.statusCode}`);
    const link = await app.inject({
      method: "POST",
      url: `/v1/merchants/${m.merchantId}/payment-links`,
      headers,
      payload: { amountFils: 1000, expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    assert.equal(link.statusCode, 403, `${adminRole} grant payment link: ${link.body}`);

    assert.deepEqual(await snapshot(id), before);
  }
});

test("AUD-024: a disabled admin's impersonation grant no longer authenticates", async () => {
  const m = await createMerchant("disabled-admin");
  const headers = await impersonationHeaders(m.merchantId, "super_admin", "disabled");
  const res = await app.inject({ method: "GET", url: "/v1/transactions", headers });
  assert.equal(res.statusCode, 401, res.body);
});

test("AUD-024: the writer-actor helper refuses an impersonation actor even on an ungated route", () => {
  assert.throws(
    () =>
      requireMerchantWriterActor({
        merchantId: randomUUID(),
        actorType: "admin_impersonation",
        actorId: randomUUID(),
        role: "support",
        impersonatedByAdminUserId: randomUUID(),
      }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 403,
  );
});

test("AUD-046: API keys keep full merchant authority; another merchant's owner cannot touch the transaction", async () => {
  const a = await createMerchant("owner-a");
  const b = await createMerchant("owner-b");
  const id = await authorizedTxn(a.rawKey);
  const before = await snapshot(id);

  const bOwner = await sessionHeaders(b.merchantId, "owner");
  const cross = await capture(id, bOwner);
  assert.equal(cross.statusCode, 404, cross.body);
  const crossVoid = await voidTxn(id, bOwner);
  assert.equal(crossVoid.statusCode, 404, crossVoid.body);
  const crossKey = await capture(id, { authorization: `Bearer ${b.rawKey}` });
  assert.equal(crossKey.statusCode, 404, crossKey.body);
  assert.deepEqual(await snapshot(id), before);

  const viaKey = await capture(id, { authorization: `Bearer ${a.rawKey}` });
  assert.equal(viaKey.statusCode, 200, viaKey.body);
});
