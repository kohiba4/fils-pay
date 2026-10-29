import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client } from "pg";

// AUD-026: `npm run migrate` must work on an EMPTY database. Migrations 0054/0055
// originally referenced a table and columns that don't exist, so nothing from
// 0054 onward could ever be applied to a fresh environment.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error("migrate_fresh.test.ts requires DATABASE_URL (a Postgres role allowed to CREATE DATABASE)");
}

function urlForDb(dbName: string): string {
  const url = new URL(baseUrl as string);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function runMigrate(databaseUrl: string): { status: number | null; output: string } {
  const result = spawnSync("npx", ["tsx", "db/migrate.ts"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

test("AUD-026: migrations apply from an empty database, and a second run is a no-op", async () => {
  const dbName = `migrate_fresh_${randomBytes(6).toString("hex")}`;
  const admin = new Client({ connectionString: urlForDb("postgres") });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${dbName}`);

    const first = runMigrate(urlForDb(dbName));
    assert.equal(first.status, 0, `fresh migrate failed:\n${first.output.slice(-1500)}`);

    const expected = readdirSync(join(repoRoot, "db/migrations")).filter((f) => f.endsWith(".sql")).length;
    const db = new Client({ connectionString: urlForDb(dbName) });
    await db.connect();
    try {
      const applied = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM schema_migrations");
      assert.equal(Number(applied.rows[0]!.n), expected, "every migration file must be recorded as applied");
      // The balance-cache code (ledger/refresh.go) depends on this view.
      const view = await db.query("SELECT 1 FROM pg_views WHERE viewname = 'merchant_payable_position'");
      assert.equal(view.rowCount, 1, "merchant_payable_position view must exist");
    } finally {
      await db.end();
    }

    const second = runMigrate(urlForDb(dbName));
    assert.equal(second.status, 0, `second migrate run failed:\n${second.output.slice(-800)}`);
    assert.match(second.output, /0 migration\(s\) applied/);
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }
});
