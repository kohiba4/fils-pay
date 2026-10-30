/**
 * Issues ONE dedicated API key for load testing and writes it to a file (mode 600). The key is never printed.
 * Run on the server as the service user (it needs the same environment as the API):
 *   sudo -u filspay bash -c 'set -a; . /etc/filspay/filspay.env; set +a; cd /opt/filspay/current && \
 *     npx tsx deploy/loadtest/issue-loadtest-key.ts /var/lib/filspay/loadtest.key'
 * It picks a seeded merchant that is active, not in test mode, KYC-approved, and has an owner user.
 * Revoke it after the event: UPDATE api_keys SET revoked_at = now() WHERE label = 'loadtest';
 */
import { chmodSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import { loadConfig } from "../../apps/api/src/config.js";
import { issueApiKey } from "../../apps/api/src/apiKeys/issue.js";

const outPath = process.argv[2];
if (!outPath) throw new Error("usage: issue-loadtest-key.ts <output file>");
const config = loadConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl, max: 2 });
try {
  const r = await pool.query<{ merchant_id: string; user_id: string; display_name: string }>(
    `SELECT m.id AS merchant_id, u.id AS user_id, m.display_name
       FROM merchants m
       JOIN merchant_users u ON u.merchant_id = m.id AND u.role = 'owner'
      WHERE m.status = 'active' AND m.test_mode = false
      ORDER BY m.created_at LIMIT 1`,
  );
  const row = r.rows[0];
  if (!row) throw new Error("no active non-test merchant with an owner user found");
  const issued = await issueApiKey(pool, config, { merchantId: row.merchant_id, createdBy: row.user_id, label: "loadtest" });
  writeFileSync(outPath, issued.rawKey, { mode: 0o600 });
  chmodSync(outPath, 0o600);
  console.log(`issued a 'loadtest' key for merchant "${row.display_name}"; written to ${outPath} (mode 600, not printed)`);
} finally {
  await pool.end();
}
