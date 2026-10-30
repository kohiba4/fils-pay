/**
 * AUD-047 (date part): merchant_daily_volume is bucketed by the Asia/Bahrain
 * calendar date (0027, decision Q6). applyDailySummaryRollup used the UTC
 * date, so a refund between 00:00 and 03:00 Bahrain landed on the previous day.
 *
 * The function has no caller yet (refund events reach reporting only with
 * FP-300 PR 3, Track A) and the columns it writes (refund_count,
 * refund_gross_fils) do not exist in merchant_daily_volume on main, so this
 * test checks the date it binds with a capturing client instead of a real
 * insert. Track A's migration adds the columns.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";
import { applyDailySummaryRollup } from "./applyEvent.js";

function capturingClient(): { client: PoolClient; dates: string[] } {
  const dates: string[] = [];
  const client = {
    query: async (_sql: string, params: unknown[]) => {
      dates.push(String(params[1]));
      return { rows: [], rowCount: 1 };
    },
  } as unknown as PoolClient;
  return { client, dates };
}

test("AUD-047: the daily refund summary binds the Bahrain date at both sides of Bahrain midnight", async () => {
  const { client, dates } = capturingClient();
  await applyDailySummaryRollup(client, "m", new Date("2026-10-29T20:59:59.000Z"), 100); // 23:59:59 Bahrain, 29th
  await applyDailySummaryRollup(client, "m", new Date("2026-10-29T21:00:00.000Z"), 200); // 00:00:00 Bahrain, 30th
  await applyDailySummaryRollup(client, "m", new Date("2026-10-29T23:30:00.000Z"), 300); // 02:30 Bahrain, UTC still 29th
  assert.deepEqual(dates, ["2026-10-29", "2026-10-30", "2026-10-30"]);
});
