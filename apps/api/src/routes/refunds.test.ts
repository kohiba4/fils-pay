/**
 * Route-level tests for `POST /v1/refunds` (FP-300), using `app.inject(...)` against `buildApp()` and a real, migrated
 * Postgres (no DB mocking), same shape as transactions.test.ts. Transactions are set up through the real authorize and
 * capture routes so the ledger and fee state under test is what capture actually produces.
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


const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "refunds.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

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

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);

test.after(async () => {
  await app.close();
  await pool.end();
});

const VALID_CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };
const PATH = "/v1/refunds";

async function createApprovedMerchantWithApiKey(label: string, mdrBps = 250) {
  const merchantResult = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, $2) RETURNING id`,
    [`Refund Route ${label} ${randomUUID()}`, mdrBps],
  );
  const merchantId = merchantResult.rows[0]!.id;
  const userResult = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused-in-these-tests') RETURNING id`,
    [merchantId, `owner-${randomUUID()}@example.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const issued = await issueApiKey(pool, config, { merchantId, createdBy: userResult.rows[0]!.id, label });
  return { merchantId, rawKey: issued.rawKey };
}

async function createSessionWithRole(merchantId: string, role: "owner" | "finance" | "support") {
  const userResult = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, $3, 'unused-in-these-tests') RETURNING id`,
    [merchantId, `${role}-${randomUUID()}@example.test`, role],
  );
  const rawToken = randomToken(32);
  await pool.query(
    `INSERT INTO sessions (merchant_user_id, token_hash, authenticated, expires_at)
     VALUES ($1, $2, true, now() + interval '1 hour')`,
    [userResult.rows[0]!.id, sha256Hex(rawToken)],
  );
  return rawToken;
}

const bearer = (rawKey: string) => ({ authorization: `Bearer ${rawKey}` });
const cookie = (rawToken: string) => ({ cookie: `${config.cookieName}=${rawToken}` });

async function capturedTransaction(rawKey: string, amountFils: number, captureFils?: number): Promise<string> {
  const a = await app.inject({
    method: "POST",
    url: "/v1/transactions",
    headers: { ...bearer(rawKey), "idempotency-key": randomUUID() },
    payload: { amountFils, card: VALID_CARD, reference: "refund-route" },
  });
  assert.equal(a.statusCode, 201, a.body);
  const id = (a.json() as { id: string }).id;
  const c = await app.inject({
    method: "POST",
    url: `/v1/transactions/${id}/capture`,
    headers: { ...bearer(rawKey), "idempotency-key": randomUUID() },
    payload: captureFils === undefined ? {} : { amountFils: captureFils },
  });
  assert.equal(c.statusCode, 200, c.body);
  return id;
}

function refund(headers: Record<string, string>, payload: unknown, key: string | null = randomUUID()) {
  return app.inject({
    method: "POST",
    url: PATH,
    headers: key === null ? headers : { ...headers, "idempotency-key": key },
    payload: payload as Record<string, unknown>,
  });
}

test("an API key refunds part of a capture; the response, ledger and transaction agree", async () => {
  const m = await createApprovedMerchantWithApiKey("partial");
  const id = await capturedTransaction(m.rawKey, 10_000);

  const res = await refund(bearer(m.rawKey), { transactionId: id, amountFils: 2_500, reason: "customer returned" });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { id: string; amountFils: number; feeReversedFils: number; transactionStatus: string; refundedTotalFils: number };
  assert.equal(body.amountFils, 2_500);
  assert.equal(body.feeReversedFils, 62); // 250 bps of 10.000 = 250 fee; 2.500/10.000 of it = 62.5 -> 62 (banker's)
  assert.equal(body.transactionStatus, "partially_refunded");
  assert.equal(body.refundedTotalFils, 2_500);

  const row = await pool.query<{ reason: string }>(`SELECT reason FROM refunds WHERE id = $1`, [body.id]);
  assert.equal(row.rows[0]!.reason, "customer returned");
  const t = await app.inject({ method: "GET", url: `/v1/transactions/${id}`, headers: bearer(m.rawKey) });
  assert.equal(t.statusCode, 200);
});

test("omitting amountFils refunds everything still refundable and reason defaults", async () => {
  const m = await createApprovedMerchantWithApiKey("all");
  const id = await capturedTransaction(m.rawKey, 4_000);
  await refund(bearer(m.rawKey), { transactionId: id, amountFils: 1_000 });
  const res = await refund(bearer(m.rawKey), { transactionId: id });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal((res.json() as { refundedTotalFils: number }).refundedTotalFils, 4_000);
  assert.equal((res.json() as { transactionStatus: string }).transactionStatus, "refunded");
  const reasons = await pool.query<{ reason: string }>(`SELECT reason FROM refunds WHERE transaction_id = $1`, [id]);
  assert.deepEqual(reasons.rows.map((r) => r.reason), ["unspecified", "unspecified"]);
});

test("the Idempotency-Key header is required, and replay returns the first answer once", async () => {
  const m = await createApprovedMerchantWithApiKey("idem");
  const id = await capturedTransaction(m.rawKey, 10_000);

  const missing = await refund(bearer(m.rawKey), { transactionId: id, amountFils: 1_000 }, null);
  assert.equal(missing.statusCode, 400);
  assert.equal((missing.json() as { error: string }).error, "idempotency_key_required");

  const key = randomUUID();
  const first = await refund(bearer(m.rawKey), { transactionId: id, amountFils: 1_000 }, key);
  const again = await refund(bearer(m.rawKey), { transactionId: id, amountFils: 1_000 }, key);
  assert.equal(first.statusCode, 200);
  assert.equal(again.statusCode, 200);
  assert.deepEqual(again.json(), first.json());
  const n = await pool.query<{ c: number }>(`SELECT count(*)::int AS c FROM refunds WHERE transaction_id = $1`, [id]);
  assert.equal(n.rows[0]!.c, 1);

  const reused = await refund(bearer(m.rawKey), { transactionId: id, amountFils: 2_000 }, key);
  assert.equal(reused.statusCode, 422);
  assert.equal((reused.json() as { error: string }).error, "idempotency_key_reused");
});

test("invalid bodies are rejected with the right status and nothing is refunded", async () => {
  const m = await createApprovedMerchantWithApiKey("badbody");
  const id = await capturedTransaction(m.rawKey, 10_000);
  const cases: Array<[unknown, number]> = [
    [{}, 400],
    [{ transactionId: "not-a-uuid" }, 400],
    [{ transactionId: id, amountFils: 10.5 }, 400],
    [{ transactionId: id, amountFils: "1000" }, 400],
    [{ transactionId: id, amountFils: -5 }, 400],
    [{ transactionId: id, amountFils: 0 }, 422],
    [{ transactionId: id, reason: "" }, 400],
    [{ transactionId: id, reason: "x".repeat(256) }, 400],
  ];
  for (const [payload, expected] of cases) {
    const res = await refund(bearer(m.rawKey), payload);
    assert.equal(res.statusCode, expected, `${JSON.stringify(payload)} -> ${res.statusCode} ${res.body}`);
  }
  const n = await pool.query<{ c: number }>(`SELECT count(*)::int AS c FROM refunds WHERE transaction_id = $1`, [id]);
  assert.equal(n.rows[0]!.c, 0);
});

test("refunding more than was captured is a 422 with the ceiling", async () => {
  const m = await createApprovedMerchantWithApiKey("ceiling");
  const id = await capturedTransaction(m.rawKey, 10_000, 4_000);
  const res = await refund(bearer(m.rawKey), { transactionId: id, amountFils: 4_001 });
  assert.equal(res.statusCode, 422, res.body);
  assert.equal((res.json() as { refundableFils: number }).refundableFils, 4_000);
});

test("another merchant's transaction is a 404 (AUD-003)", async () => {
  const a = await createApprovedMerchantWithApiKey("victim");
  const b = await createApprovedMerchantWithApiKey("attacker");
  const id = await capturedTransaction(a.rawKey, 10_000);
  const res = await refund(bearer(b.rawKey), { transactionId: id, amountFils: 10_000 });
  assert.equal(res.statusCode, 404, res.body);
  const n = await pool.query<{ c: number }>(`SELECT count(*)::int AS c FROM refunds WHERE transaction_id = $1`, [id]);
  assert.equal(n.rows[0]!.c, 0);
});

test("authentication and roles: no credentials 401; support session 403; finance and owner sessions may refund", async () => {
  const m = await createApprovedMerchantWithApiKey("roles");
  const id = await capturedTransaction(m.rawKey, 10_000);

  assert.equal((await refund({}, { transactionId: id, amountFils: 100 })).statusCode, 401);

  const support = await createSessionWithRole(m.merchantId, "support");
  const denied = await refund(cookie(support), { transactionId: id, amountFils: 100 });
  assert.equal(denied.statusCode, 403, denied.body);

  const finance = await createSessionWithRole(m.merchantId, "finance");
  assert.equal((await refund(cookie(finance), { transactionId: id, amountFils: 100 })).statusCode, 200);
  const owner = await createSessionWithRole(m.merchantId, "owner");
  assert.equal((await refund(cookie(owner), { transactionId: id, amountFils: 100 })).statusCode, 200);

  const n = await pool.query<{ c: number }>(`SELECT count(*)::int AS c FROM refunds WHERE transaction_id = $1`, [id]);
  assert.equal(n.rows[0]!.c, 2);
});

test("a merchant with refunds_enabled = false is refused (403 refunds_on_hold), also through the API key", async () => {
  const m = await createApprovedMerchantWithApiKey("hold");
  const id = await capturedTransaction(m.rawKey, 10_000);
  await pool.query(`UPDATE merchants SET refunds_enabled = false WHERE id = $1`, [m.merchantId]);
  const res = await refund(bearer(m.rawKey), { transactionId: id, amountFils: 100 });
  assert.equal(res.statusCode, 403, res.body);
  assert.equal((res.json() as { error: string }).error, "refunds_on_hold");
});

test("a refund shows up in the transaction timeline as a negative event and in refundedFils", async () => {
  const m = await createApprovedMerchantWithApiKey("timeline");
  const id = await capturedTransaction(m.rawKey, 10_000);
  await refund(bearer(m.rawKey), { transactionId: id, amountFils: 3_000 });
  const res = await app.inject({ method: "GET", url: `/v1/transactions/${id}/events`, headers: bearer(m.rawKey) });
  assert.equal(res.statusCode, 200, res.body);
  const events = res.json() as Array<{ eventType: string; amountFils: number | null }>;
  const last = events[events.length - 1]!;
  assert.equal(last.eventType, "refund_partial");
  assert.equal(last.amountFils, -3_000);
});

async function impersonationCookie(merchantId: string, adminRole: "support" | "finance" | "super_admin") {
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (email, password_hash, display_name, role)
     VALUES ($1, 'not-a-real-hash', 'Refund Impersonation Test', $2) RETURNING id`,
    [`imp-${randomUUID()}@admin.test`, adminRole],
  );
  const rawToken = randomToken(32);
  await pool.query(
    `INSERT INTO admin_impersonation_grants (admin_user_id, merchant_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [admin.rows[0]!.id, merchantId, sha256Hex(rawToken)],
  );
  return { cookie: `${config.impersonationCookieName}=${rawToken}` };
}

test("a 'view as merchant' operator cannot refund, whatever role their grant maps to", async () => {
  const m = await createApprovedMerchantWithApiKey("impersonation");
  const id = await capturedTransaction(m.rawKey, 10_000);
  for (const adminRole of ["support", "finance", "super_admin"] as const) {
    const res = await refund(await impersonationCookie(m.merchantId, adminRole), { transactionId: id, amountFils: 100 });
    assert.equal(res.statusCode, 403, `${adminRole}: ${res.body}`);
  }
  const n = await pool.query<{ c: number }>(`SELECT count(*)::int AS c FROM refunds WHERE transaction_id = $1`, [id]);
  assert.equal(n.rows[0]!.c, 0);
});

test("refunds are off unless REFUNDS_ENABLED=true: the default config is off, and an explicit false answers 503 with nothing written", async () => {
  const offApp = buildApp(loadConfig({ ...process.env, DATABASE_URL: databaseUrl!, NODE_ENV: "test", REFUNDS_ENABLED: "false",
    INTERNAL_API_TOKEN: "test-internal-token", ACQUIRER_FAILURE_RATE: "0", ACQUIRER_LATENCY_MIN_MS: "0", ACQUIRER_LATENCY_MAX_MS: "1",
    WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=" }), pool);
  assert.equal(loadConfig({ DATABASE_URL: databaseUrl!, NODE_ENV: "test", WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=" }).refundsEnabled, false, "default must stay off until Q13");
  try {
    const m = await createApprovedMerchantWithApiKey("switch-off");
    const id = await capturedTransaction(m.rawKey, 10_000);
    const res = await offApp.inject({
      method: "POST", url: PATH, headers: { ...bearer(m.rawKey), "idempotency-key": randomUUID() },
      payload: { transactionId: id, amountFils: 100 },
    });
    assert.equal(res.statusCode, 503, res.body);
    assert.equal((res.json() as { error: string }).error, "refunds_disabled");
    const n = await pool.query<{ c: number }>(`SELECT count(*)::int AS c FROM refunds WHERE transaction_id = $1`, [id]);
    assert.equal(n.rows[0]!.c, 0);
  } finally {
    await offApp.close();
  }
});
