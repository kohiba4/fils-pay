/**
 * The seeded demo accounts use FIXED passwords that are public in the repository (db/seed/generate.ts). On a public server
 * that, combined with first-login authenticator enrolment, would let anyone who has read the repo take an account before its
 * intended user. This replaces EVERY seeded merchant user's and admin's password with a fresh random one, clears their
 * authenticator enrolment and revokes their sessions, and writes the new credentials to a file readable only by its owner
 * (never printed). Run on the server as the service user after seeding:
 *   sudo -u filspay bash -c 'set -a; . /etc/filspay/filspay.env; set +a; cd /opt/filspay/current && \
 *     ./node_modules/.bin/tsx deploy/remote/set-demo-passwords.ts /var/lib/filspay/demo-credentials.txt'
 */
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import { hashPassword } from "../../apps/api/src/auth/passwords.js";
import { loadConfig } from "../../apps/api/src/config.js";

const outPath = process.argv[2];
if (!outPath) throw new Error("usage: set-demo-passwords.ts <output file>");
const config = loadConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl, max: 2 });
const lines: string[] = ["# plane | merchant id | email | role | password   (merchant and admin demo accounts; delete this file after use)"];
try {
  const m = await pool.query<{ id: string; merchant_id: string; email: string; role: string }>(
    `SELECT id, merchant_id, email, role FROM merchant_users ORDER BY merchant_id, email`,
  );
  for (const u of m.rows) {
    const password = randomBytes(12).toString("base64url");
    await pool.query(
      `UPDATE merchant_users SET password_hash = $2, totp_secret_ciphertext = NULL, totp_confirmed_at = NULL, totp_last_step = NULL,
              totp_failed_count = 0, totp_locked_until = NULL WHERE id = $1`,
      [u.id, await hashPassword(password, config)],
    );
    await pool.query(`UPDATE sessions SET revoked_at = now() WHERE merchant_user_id = $1 AND revoked_at IS NULL`, [u.id]);
    lines.push(`merchant | ${u.merchant_id} | ${u.email} | ${u.role} | ${password}`);
  }
  const a = await pool.query<{ id: string; email: string; role: string }>(`SELECT id, email, role FROM admin_users ORDER BY email`);
  for (const u of a.rows) {
    const password = randomBytes(12).toString("base64url");
    await pool.query(
      `UPDATE admin_users SET password_hash = $2, totp_secret_ciphertext = NULL, totp_confirmed_at = NULL, totp_last_step = NULL,
              totp_failed_count = 0, totp_locked_until = NULL WHERE id = $1`,
      [u.id, await hashPassword(password, config)],
    );
    await pool.query(`UPDATE admin_sessions SET revoked_at = now() WHERE admin_user_id = $1 AND revoked_at IS NULL`, [u.id]);
    lines.push(`admin | - | ${u.email} | ${u.role} | ${password}`);
  }
  writeFileSync(outPath, lines.join("\n") + "\n", { mode: 0o600 });
  chmodSync(outPath, 0o600);
  console.log(`replaced ${m.rows.length} merchant-user and ${a.rows.length} admin passwords; credentials written to ${outPath} (mode 600, not printed)`);
} finally {
  await pool.end();
}
