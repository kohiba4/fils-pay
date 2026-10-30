/**
 * AUD-047: GET /v1/reporting/export-summary had no auth hook and read
 * request.merchantAuth!.merchantId, so an unauthenticated call crashed with a
 * 500. It must answer 401 without credentials and only ever sum the caller's rows.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { sha256Hex, randomToken } from "../lib/crypto.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("reportingExportSummary.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});
const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);
test.after(async () => {
  await app.close();
  await pool.end();
});

async function merchantWithVolume(gross: number) {
  const m = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Export summary ${randomUUID()}`],
  );
  const merchantId = m.rows[0]!.id;
  await pool.query(
    `INSERT INTO merchant_daily_volume (merchant_id, volume_date, captured_count, captured_gross_fils, last_updated_at)
     VALUES ($1, '2026-10-29', 1, $2, now()), ($1, '2026-10-30', 1, $2, now())`,
    [merchantId, gross],
  );
  const user = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'support', 'x') RETURNING id`,
    [merchantId, `s-${randomUUID()}@example.test`],
  );
  const raw = randomToken(32);
  await pool.query(
    `INSERT INTO sessions (merchant_user_id, token_hash, authenticated, expires_at) VALUES ($1, $2, true, now() + interval '1 hour')`,
    [user.rows[0]!.id, sha256Hex(raw)],
  );
  return { merchantId, cookie: `${config.cookieName}=${raw}` };
}

test("AUD-047: export-summary without credentials is 401, not a 500", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/reporting/export-summary" });
  assert.equal(res.statusCode, 401, res.body);
});

test("AUD-047: export-summary sums only the caller's own merchant rows", async () => {
  const a = await merchantWithVolume(1_000);
  await merchantWithVolume(999_000);
  const res = await app.inject({ method: "GET", url: "/v1/reporting/export-summary", headers: { cookie: a.cookie } });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json(), { totalDays: 2, grossFils: 2_000 });
});
