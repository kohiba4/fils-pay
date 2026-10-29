import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client } from "pg";

// AUD-011: run the REAL script against a throwaway database. Before the fix, a night
// with nothing expired built `DELETE FROM holds` (no WHERE) and wiped every hold.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error("expire_holds.integration.test.ts requires DATABASE_URL (role allowed to CREATE DATABASE)");

function urlForDb(name: string): string {
  const url = new URL(baseUrl as string);
  url.pathname = `/${name}`;
  return url.toString();
}

async function withScratchDb(fn: (db: Client, url: string) => Promise<void>): Promise<void> {
  const name = `expire_holds_${randomBytes(6).toString("hex")}`;
  const admin = new Client({ connectionString: urlForDb("postgres") });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const db = new Client({ connectionString: urlForDb(name) });
    await db.connect();
    try {
      // Only the tables the script touches (independent of later migrations).
      for (const f of ["0001_extensions.sql", "0002_merchants.sql", "0004_transactions.sql", "0005_holds.sql"]) {
        await db.query(readFileSync(join(repoRoot, "db/migrations", f), "utf8"));
      }
      await fn(db, urlForDb(name));
    } finally {
      await db.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
}

function runScript(databaseUrl: string): { status: number | null; output: string } {
  const r = spawnSync("npx", ["tsx", "scripts/expire_holds.ts"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });
  return { status: r.status, output: `${r.stdout}\n${r.stderr}` };
}

async function seedMerchantAndHold(db: Client, status: string, expiresSql: string): Promise<string> {
  const m = await db.query<{ id: string }>(`INSERT INTO merchants (display_name) VALUES ('m') RETURNING id`);
  const h = await db.query<{ id: string }>(
    `INSERT INTO holds (merchant_id, amount_fils, status, expires_at)
     VALUES ($1, 1000, $2, ${expiresSql}) RETURNING id`,
    [m.rows[0]!.id, status],
  );
  return h.rows[0]!.id;
}

test("AUD-011: with nothing expired, no hold is deleted", async () => {
  await withScratchDb(async (db, url) => {
    await seedMerchantAndHold(db, "active", "now() + interval '3 days'");
    await seedMerchantAndHold(db, "released", "now() - interval '3 days'");
    const run = runScript(url);
    assert.equal(run.status, 0, run.output);
    const n = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM holds`);
    assert.equal(Number(n.rows[0]!.n), 2, `holds were deleted:\n${run.output}`);
    const active = await db.query(`SELECT 1 FROM holds WHERE status = 'active'`);
    assert.equal(active.rowCount, 1, "the still-valid active hold must stay active");
  });
});

test("AUD-011: only active holds past expires_at become 'expired'; nothing is deleted; rerun is a no-op", async () => {
  await withScratchDb(async (db, url) => {
    const stale = await seedMerchantAndHold(db, "active", "now() - interval '1 day'");
    const fresh = await seedMerchantAndHold(db, "active", "now() + interval '1 day'");
    const released = await seedMerchantAndHold(db, "released", "now() - interval '1 day'");

    for (let i = 0; i < 2; i++) {
      const run = runScript(url);
      assert.equal(run.status, 0, run.output);
    }
    const rows = await db.query<{ id: string; status: string }>(`SELECT id, status FROM holds`);
    const byId = new Map(rows.rows.map((r) => [r.id, r.status]));
    assert.equal(rows.rowCount, 3, "no hold row may be deleted");
    assert.equal(byId.get(stale), "expired");
    assert.equal(byId.get(fresh), "active");
    assert.equal(byId.get(released), "released");
  });
});
