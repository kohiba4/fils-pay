/**
 * AUD-023: OTP codes come from a cryptographic source, and the attempt budget
 * and single use hold under concurrency, for merchant and admin login.
 * Also covers the sibling AUD-055: payment-link tokens share the same random
 * helper and must not come from Math.random either.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../auth/passwords.js";
import { hashPassword as hashAdminPassword } from "../adminAuth/passwords.js";
import { recordKycReview } from "../onboarding/review.js";
import { randomDigits, randomFromAlphabet } from "../lib/random.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("otpAttempts.test.ts requires DATABASE_URL to point at a real, migrated Postgres");

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  OTP_DEV_EXPOSE: "true",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});
const pool = new Pool({ connectionString: databaseUrl, max: 20 });
const app = buildApp(config, pool);
test.after(async () => {
  await app.close();
  await pool.end();
});

const PASSWORD = "correct horse battery staple";
const PARALLEL = 12; // > max_attempts (5)

function cookieFrom(res: { headers: Record<string, unknown> }, name: string): string {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  const hit = list.find((c) => c.startsWith(`${name}=`));
  assert.ok(hit, `response sets ${name}`);
  return hit.split(";")[0]!;
}

function wrongCode(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

type Flow = { cookie: string; code: string; verifyUrl: string; table: string; probeUrl: string };

async function merchantFlow(): Promise<Flow> {
  const m = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`OTP ${randomUUID()}`],
  );
  const merchantId = m.rows[0]!.id;
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const email = `otp-${randomUUID()}@example.test`;
  await pool.query(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'owner', $3)`,
    [merchantId, email, await hashPassword(PASSWORD, config)],
  );
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { merchantId, email, password: PASSWORD } });
  assert.equal(res.statusCode, 200, res.body);
  return {
    cookie: cookieFrom(res, config.cookieName),
    code: (res.json() as { devOtpCode: string }).devOtpCode,
    verifyUrl: "/v1/auth/otp/verify",
    table: "otp_challenges",
    probeUrl: "/v1/transactions",
  };
}

async function adminFlow(): Promise<Flow> {
  const email = `otp-admin-${randomUUID()}@admin.test`;
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, display_name, role) VALUES ($1, $2, 'OTP Test', 'support')`,
    [email, await hashAdminPassword(PASSWORD, config)],
  );
  const res = await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email, password: PASSWORD } });
  assert.equal(res.statusCode, 200, res.body);
  return {
    cookie: cookieFrom(res, config.adminCookieName),
    code: (res.json() as { devOtpCode: string }).devOtpCode,
    verifyUrl: "/v1/admin/auth/otp/verify",
    table: "admin_otp_challenges",
    probeUrl: "/v1/admin/auth/me",
  };
}

async function latestAttemptCount(table: string): Promise<number> {
  const r = await pool.query<{ attempt_count: number }>(
    `SELECT attempt_count FROM ${table} ORDER BY created_at DESC LIMIT 1`,
  );
  return r.rows[0]!.attempt_count;
}

for (const [label, start] of [["merchant", merchantFlow], ["admin", adminFlow]] as const) {
  test(`AUD-023 (${label}): ${PARALLEL} parallel wrong guesses share one budget of 5; the right code afterwards is refused`, async () => {
    const f = await start();
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        app.inject({ method: "POST", url: f.verifyUrl, headers: { cookie: f.cookie }, payload: { code: wrongCode(f.code) } }),
      ),
    );
    const judged = results.filter((r) => r.statusCode === 401 && r.json().error === "invalid_code").length;
    assert.ok(judged <= 5, `${judged} guesses were judged; the budget is 5`);
    assert.ok((await latestAttemptCount(f.table)) <= 5, "attempt_count never exceeds max_attempts");

    const late = await app.inject({ method: "POST", url: f.verifyUrl, headers: { cookie: f.cookie }, payload: { code: f.code } });
    assert.notEqual(late.statusCode, 200, "the correct code cannot succeed once the budget is spent");
    const probe = await app.inject({ method: "GET", url: f.probeUrl, headers: { cookie: f.cookie } });
    assert.equal(probe.statusCode, 401);
  });

  test(`AUD-023 (${label}): two concurrent correct submissions consume the challenge once; a replay is refused`, async () => {
    const f = await start();
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: f.verifyUrl, headers: { cookie: f.cookie }, payload: { code: f.code } }),
      app.inject({ method: "POST", url: f.verifyUrl, headers: { cookie: f.cookie }, payload: { code: f.code } }),
    ]);
    const ok = [a, b].filter((r) => r.statusCode === 200).length;
    assert.equal(ok, 1, `exactly one promotion, got ${a.statusCode}/${b.statusCode}`);

    const replay = await app.inject({ method: "POST", url: f.verifyUrl, headers: { cookie: f.cookie }, payload: { code: f.code } });
    assert.notEqual(replay.statusCode, 200);
    const probe = await app.inject({ method: "GET", url: f.probeUrl, headers: { cookie: f.cookie } });
    assert.equal(probe.statusCode, 200, "the winning promotion still yields a working session");
  });
}

test("AUD-023 / AUD-055: OTP codes and payment-link tokens do not come from Math.random", () => {
  const original = Math.random;
  Math.random = () => 0; // a predictable PRNG stand-in: any output that depends on it collapses
  try {
    const codes = new Set(Array.from({ length: 50 }, () => randomDigits(6)));
    const tokens = new Set(Array.from({ length: 50 }, () => randomFromAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 22)));
    assert.ok(codes.size > 1, "OTP codes must not depend on Math.random");
    assert.ok(tokens.size > 1, "payment-link tokens must not depend on Math.random");
  } finally {
    Math.random = original;
  }
  for (const c of Array.from({ length: 200 }, () => randomDigits(6))) assert.match(c, /^\d{6}$/);
});
