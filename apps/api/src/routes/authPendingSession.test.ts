/**
 * AUD-001: a pending (password-only, pre-OTP) session authenticates nothing.
 * Only /v1/auth/otp/verify may use it; after a correct code the same cookie
 * becomes a full session.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../auth/passwords.js";
import { recordKycReview } from "../onboarding/review.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("this test requires DATABASE_URL to point at a real, migrated Postgres");

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  OTP_DEV_EXPOSE: "true",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});
const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);
test.after(async () => {
  await app.close();
  await pool.end();
});

const PASSWORD = "correct horse battery staple";

async function activeMerchant(label: string): Promise<string> {
  const m = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Login ${label} ${randomUUID()}`],
  );
  await recordKycReview(pool, { merchantId: m.rows[0]!.id, outcome: "approved", reviewerIdentifier: "test" });
  return m.rows[0]!.id;
}

async function addUser(merchantId: string, email: string, role: "owner" | "finance" | "support", password: string) {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
    [merchantId, email, role, await hashPassword(password, config)],
  );
  return r.rows[0]!.id;
}

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  const hit = list.find((c) => c.startsWith(`${config.cookieName}=`));
  assert.ok(hit, "login sets the session cookie");
  return hit.split(";")[0]!;
}

async function login(merchantId: string, email: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { merchantId, email, password } });
  assert.equal(res.statusCode, 200, res.body);
  return { cookie: cookieFrom(res), code: (res.json() as { devOtpCode: string }).devOtpCode };
}

test("AUD-001: a pending session is refused by merchant routes until the OTP is verified", async () => {
  const merchantId = await activeMerchant("pending");
  const email = `owner-${randomUUID()}@example.test`;
  await addUser(merchantId, email, "owner", PASSWORD);
  const { cookie, code } = await login(merchantId, email, PASSWORD);

  // requireMerchantAuth surface and the legacy requireSession surface.
  const txns = await app.inject({ method: "GET", url: "/v1/transactions", headers: { cookie } });
  assert.equal(txns.statusCode, 401, `pending session on /v1/transactions: ${txns.body}`);
  const keys = await app.inject({ method: "GET", url: `/v1/merchants/${merchantId}/api-keys`, headers: { cookie } });
  assert.equal(keys.statusCode, 401, `pending session on api-keys: ${keys.body}`);

  const verify = await app.inject({ method: "POST", url: "/v1/auth/otp/verify", headers: { cookie }, payload: { code } });
  assert.equal(verify.statusCode, 200, verify.body);

  const after = await app.inject({ method: "GET", url: "/v1/transactions", headers: { cookie } });
  assert.equal(after.statusCode, 200, `authenticated session: ${after.body}`);
});
