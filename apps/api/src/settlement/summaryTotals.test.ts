/**
 * AUD-043 (totals part): GET /v1/settlement/summary summed transactions.captured_fils
 * (the cumulative total) once per capture event, so a transaction captured in N
 * parts counted N times its full total, and captures outside the window leaked
 * in. Measured on a 41k-transaction, 3-part merchant: 372,420,000 fils reported
 * vs 124,140,000 fils of capture events in the window.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { getSettlementSummary } from "./query.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("summaryTotals.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
test.after(async () => {
  await pool.end();
});

test("AUD-043: the summary sums capture events in the Bahrain window, once each", async () => {
  const m = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Summary totals ${randomUUID()}`],
  );
  const merchantId = m.rows[0]!.id;
  const multi = await pool.query<{ id: string }>(
    `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference)
     VALUES ($1, 'captured', 3000, 3000, $2) RETURNING id`,
    [merchantId, `acqref_${randomUUID()}`],
  );
  const single = await pool.query<{ id: string }>(
    `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference)
     VALUES ($1, 'captured', 700, 700, $2) RETURNING id`,
    [merchantId, `acqref_${randomUUID()}`],
  );
  // Window: Bahrain 2026-06-01 .. 2026-06-02 (= 2026-05-31T21:00Z .. 2026-06-01T21:00Z).
  await pool.query(
    `INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type, occurred_at) VALUES
       ($1, 'partially_captured', 1000, 'system', '2026-05-31T21:00:00Z'),  -- 00:00 Bahrain, in
       ($1, 'partially_captured', 1000, 'system', '2026-06-01T10:00:00Z'),  -- in
       ($1, 'captured',           1000, 'system', '2026-06-01T21:00:00Z'),  -- 00:00 next Bahrain day, out
       ($2, 'captured',            700, 'system', '2026-06-01T20:59:59Z')`, // 23:59:59 Bahrain, in
    [multi.rows[0]!.id, single.rows[0]!.id],
  );
  const s = await getSettlementSummary(pool, { merchantId, from: "2026-06-01", to: "2026-06-02" });
  assert.equal(s.transactionCount, 2);
  assert.equal(s.totalCapturedFils, 2_700, "1000 + 1000 + 700: in-window capture deltas only");
});
