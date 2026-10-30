/**
 * AUD-002: login binds the OTP challenge and the session to the user whose
 * password was checked, never to another merchant's user that shares the
 * email (0003 allows the same email at several merchants).
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

test("AUD-002: the session belongs to the password-verified user, not another tenant's user with the same email", async () => {
  const email = `shared-${randomUUID()}@example.test`;
  // The other tenant's row is created first, so an unordered lookup by email finds it first.
  const otherMerchant = await activeMerchant("other-tenant");
  await addUser(otherMerchant, email, "owner", "a different password entirely");
  const merchantId = await activeMerchant("own-tenant");
  const userId = await addUser(merchantId, email, "finance", PASSWORD);

  const { cookie, code } = await login(merchantId, email, PASSWORD);
  const pending = await pool.query<{ merchant_user_id: string }>(
    `SELECT s.merchant_user_id FROM sessions s JOIN otp_challenges c ON c.id = s.otp_challenge_id
      WHERE s.authenticated = false ORDER BY s.created_at DESC LIMIT 1`,
  );
  assert.equal(pending.rows[0]!.merchant_user_id, userId, "pending session bound to the verified user");

  const verify = await app.inject({ method: "POST", url: "/v1/auth/otp/verify", headers: { cookie }, payload: { code } });
  assert.equal(verify.statusCode, 200, verify.body);
  const body = verify.json() as { merchantId: string; role: string };
  assert.equal(body.merchantId, merchantId);
  assert.equal(body.role, "finance");

  // Wrong password for the own tenant still fails, even though another tenant has the email.
  const bad = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { merchantId, email, password: "a different password entirely" },
  });
  assert.equal(bad.statusCode, 401);
});
