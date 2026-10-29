import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client } from "pg";

// AUD-013: run the REAL March sweep against a throwaway database. Before the fix it applied immediately
// and posted the same residue again on every run (the "gap doubled" when it was run twice on staging).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error("reconcile_march.rerun.test.ts requires DATABASE_URL (role allowed to CREATE DATABASE)");

const urlForDb = (name: string): string => {
  const url = new URL(baseUrl as string);
  url.pathname = `/${name}`;
  return url.toString();
};

async function withScratchDb(fn: (db: Client, url: string) => Promise<void>): Promise<void> {
  const name = `march_sweep_${randomBytes(6).toString("hex")}`;
  const admin = new Client({ connectionString: urlForDb("postgres") });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const db = new Client({ connectionString: urlForDb(name) });
    await db.connect();
    try {
      for (const f of ["0001_extensions", "0002_merchants", "0004_transactions", "0006_settlement_batches", "0007_ledger_double_entry", "0017_transaction_acquirer_reference"]) {
        await db.query(readFileSync(join(repoRoot, "db/migrations", `${f}.sql`), "utf8"));
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

function runSweep(databaseUrl: string, ...args: string[]): { status: number | null; output: string } {
  const r = spawnSync("npx", ["tsx", "scripts/reconcile_march.ts", ...args], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });
  return { status: r.status, output: `${r.stdout}\n${r.stderr}` };
}

async function seedMarch(db: Client): Promise<string> {
  const m = await db.query<{ id: string }>(`INSERT INTO merchants (display_name) VALUES ('march-merchant') RETURNING id`);
  const merchantId = m.rows[0]!.id;
  // Two March captures with 3 and 7 fils of residue (captured_fils % 10), one clean, one outside March.
  for (const [fils, when] of [[10_003, "2026-03-10T12:00:00Z"], [20_007, "2026-03-20T12:00:00Z"], [30_000, "2026-03-21T12:00:00Z"], [40_009, "2026-04-02T12:00:00Z"]] as const) {
    await db.query(
      `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference, occurred_at)
       VALUES ($1, 'captured', $2, $2, $3, $4)`,
      [merchantId, fils, `acq-${randomBytes(4).toString("hex")}`, when],
    );
  }
  return merchantId;
}

const sweepLegs = (db: Client) =>
  db.query<{ n: string; total: string }>(
    `SELECT count(*)::text AS n, COALESCE(sum(amount_fils),0)::text AS total
       FROM ledger_entries WHERE description LIKE 'March 2026 scheme rounding residue sweep%' AND account_id = 'scheme_rounding_residue'`,
  );

test("AUD-013: without --apply the sweep is a dry run and posts nothing", async () => {
  await withScratchDb(async (db, url) => {
    await seedMarch(db);
    const run = runSweep(url);
    assert.equal(run.status, 0, run.output);
    const legs = await sweepLegs(db);
    assert.equal(Number(legs.rows[0]!.n), 0, `a plain run posted ledger rows:\n${run.output}`);
    assert.match(run.output, /DRY RUN/);
    assert.match(run.output, /10 fils/); // 3 + 7 fils of residue in March
  });
});

test("AUD-013: --apply twice posts the residue exactly once (rerunning is a no-op)", async () => {
  await withScratchDb(async (db, url) => {
    await seedMarch(db);
    for (let i = 0; i < 2; i++) {
      const run = runSweep(url, "--apply");
      assert.equal(run.status, 0, run.output);
    }
    const legs = await sweepLegs(db);
    assert.equal(Number(legs.rows[0]!.n), 1, "one residue leg for the one merchant");
    assert.equal(Number(legs.rows[0]!.total), 10, "3 + 7 fils, posted once (the old script doubled it to 20)");
  });
});

// Two operators (or a double click) starting the sweep at the same moment must still post it once.
test("AUD-013: two simultaneous --apply runs post the residue exactly once", async () => {
  await withScratchDb(async (db, url) => {
    await seedMarch(db);
    const runAsync = () =>
      new Promise<number | null>((resolve) => {
        const child = spawn("npx", ["tsx", "scripts/reconcile_march.ts", "--apply"], {
          cwd: repoRoot,
          env: { ...process.env, DATABASE_URL: url },
          stdio: "ignore",
        });
        child.on("close", resolve);
      });
    const codes = await Promise.all([runAsync(), runAsync(), runAsync()]);
    assert.deepEqual(codes, [0, 0, 0]);
    const legs = await sweepLegs(db);
    assert.equal(Number(legs.rows[0]!.n), 1, "exactly one residue leg despite three concurrent runs");
    assert.equal(Number(legs.rows[0]!.total), 10);
  });
});

// Review follow-ups (AUD-013).
test("AUD-013: an unknown flag (e.g. a typo of --apply) is rejected instead of silently dry-running", async () => {
  await withScratchDb(async (db, url) => {
    await seedMarch(db);
    const run = runSweep(url, "--aply");
    assert.notEqual(run.status, 0, `an unknown flag was accepted:\n${run.output}`);
    assert.match(run.output, /unknown argument/i);
    assert.equal(Number((await sweepLegs(db)).rows[0]!.n), 0);
  });
});

test("AUD-013: a skipped merchant is reported with the amount swept earlier, and a changed amount is flagged", async () => {
  await withScratchDb(async (db, url) => {
    const merchantId = await seedMarch(db);
    assert.equal(runSweep(url, "--apply").status, 0);
    // A late March capture with 5 fils of residue arrives AFTER the first sweep.
    await db.query(
      `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference, occurred_at)
       VALUES ($1, 'captured', 10005, 10005, 'acq-late', '2026-03-25T12:00:00Z')`,
      [merchantId],
    );
    const second = runSweep(url, "--apply");
    assert.equal(second.status, 0, second.output);
    assert.match(second.output, /already swept/);
    assert.match(second.output, /10 fils/, "must say what was swept before");
    assert.match(second.output, /WARNING/, "must flag that the current residue (15) differs from what was swept (10)");
    assert.equal(Number((await sweepLegs(db)).rows[0]!.n), 1, "still not posted again: a human decides how to correct a changed amount");
  });
});
