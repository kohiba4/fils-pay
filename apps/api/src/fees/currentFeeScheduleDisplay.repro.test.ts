/** Phase-1 repro for AUD-031: display must show the rate in force (effective_from), not the last row typed. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { getCurrentFeeScheduleForDisplay } from "./currentFeeScheduleDisplay.js";
import { getEffectiveMdrBps } from "./feeSchedule.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("requires DATABASE_URL (migrated Postgres)");
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
test.after(async () => { await pool.end(); });

test("AUD-031: backfilled 245 bps row (effective Mar, entered Aug) must not beat the 225 bps row in force", async () => {
  const m = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Fee Display Repro ${randomUUID()}`],
  );
  const id = m.rows[0]!.id;
  await pool.query(
    `INSERT INTO fee_schedules (merchant_id, mdr_bps, effective_from, created_at) VALUES
       ($1, 245, '2026-03-01', '2026-08-15'), ($1, 225, '2026-08-01', '2026-08-01')`,
    [id],
  );
  const client = await pool.connect();
  let charged: number;
  try { charged = await getEffectiveMdrBps(client, id, new Date(), 250); } finally { client.release(); }
  const shown = await getCurrentFeeScheduleForDisplay(pool, id);
  assert.equal(charged, 225, "capture charges 225");
  assert.equal(shown?.mdrBps, charged, `dashboard shows ${shown?.mdrBps} but payments are charged ${charged}`);
});
