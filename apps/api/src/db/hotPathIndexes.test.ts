import assert from "node:assert/strict";
import { test } from "node:test";
import { Pool } from "pg";

/**
 * Capacity (AUD-061): the capture path looks ledger entries and holds up by transaction_id. Without an index each capture
 * scanned the whole ledger (7 ms at 43,000 rows, linear in the table size), so the platform got slower with every checkout.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("hotPathIndexes.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
test.after(async () => {
  await pool.end();
});

async function leadingColumnIndexed(table: string, column: string): Promise<boolean> {
  const r = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
      WHERE c.relname = $1 AND a.attname = $2 AND i.indisvalid`,
    [table, column],
  );
  return Number(r.rows[0]!.n) > 0;
}

test("ledger_entries and holds are indexed by transaction_id (capture, refund fee lookup and discount step)", async () => {
  assert.equal(await leadingColumnIndexed("ledger_entries", "transaction_id"), true, "ledger_entries(transaction_id)");
  assert.equal(await leadingColumnIndexed("holds", "transaction_id"), true, "holds(transaction_id)");
});
