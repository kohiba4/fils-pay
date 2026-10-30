/**
 * AUD-032: "Recompute transaction statuses" must not clear a merchant's
 * test_mode. The Go batch close selects only `test_mode = false` merchants
 * (apps/settlement/internal/settlement/batch.go), so clearing the flag turned
 * sandbox captures into real settlement and payouts.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../adminAuth/passwords.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("adminMerchantsRecompute.test.ts requires DATABASE_URL to point at a real, migrated Postgres");

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  OTP_DEV_EXPOSE: "true",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});
const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);
test.after(async () => {
  await app.close();
  await pool.end();
});

const PASSWORD = "admin-test-password-9000!";

async function financeAdminCookie(): Promise<string> {
  const email = `recompute-${randomUUID()}@admin.test`;
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, display_name, role) VALUES ($1, $2, 'Recompute Test', 'finance')`,
    [email, await hashPassword(PASSWORD, config)],
  );
  const login = await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email, password: PASSWORD } });
  assert.equal(login.statusCode, 200, login.body);
  const raw = login.headers["set-cookie"];
  const cookie = (Array.isArray(raw) ? raw : [String(raw)]).find((c) => c.startsWith(`${config.adminCookieName}=`))!.split(";")[0]!;
  const verify = await app.inject({
    method: "POST",
    url: "/v1/admin/auth/otp/verify",
    headers: { cookie },
    payload: { code: (login.json() as { devOtpCode: string }).devOtpCode },
  });
  assert.equal(verify.statusCode, 200, verify.body);
  return cookie;
}

test("AUD-032: recomputing statuses keeps a test-mode merchant in test mode (no open authorizations left)", async () => {
  const m = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps, status, test_mode) VALUES ($1, 250, 'active', true) RETURNING id`,
    [`Sandbox ${randomUUID()}`],
  );
  const merchantId = m.rows[0]!.id;
  await pool.query(
    `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference)
     VALUES ($1, 'captured', 5000, 5000, $2)`,
    [merchantId, `acqref_${randomUUID()}`],
  );
  const cookie = await financeAdminCookie();
  const res = await app.inject({
    method: "POST",
    url: `/v1/admin/merchants/${merchantId}/transactions/recompute-statuses`,
    headers: { cookie },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { scanned: number; openAuthorizations: number; flagsUpdated: string[] };
  assert.ok(body.scanned >= 1);
  assert.equal(body.openAuthorizations, 0);
  assert.deepEqual(body.flagsUpdated, [], "no merchant flag is changed by a status recompute");

  const after = await pool.query<{ test_mode: boolean }>(`SELECT test_mode FROM merchants WHERE id = $1`, [merchantId]);
  assert.equal(after.rows[0]!.test_mode, true, "still excluded from real settlement");
});
