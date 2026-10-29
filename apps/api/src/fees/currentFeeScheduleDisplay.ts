import type { Pool } from "pg";

/**
 * effectiveFrom: when the rate starts applying. createdAt: when it was
 * keyed in. The display returns the latest row whose effectiveFrom is not
 * in the future.
 */
export interface CurrentFeeScheduleDisplay {
  mdrBps: number;
  effectiveFrom: Date;
  createdAt: Date;
}

/**
 * Fetches the negotiated fee schedule currently IN FORCE for a merchant, for display on the admin
 * merchant-detail page: the row with the newest `effective_from` that has already arrived, ties broken by
 * `created_at` (a same-day correction wins). This is exactly the rule capture (fees/feeSchedule.ts) and
 * settlement (fee_schedule.go) bill with, so the page can never show a rate payments are not charged at.
 *
 * It used to order by `created_at` ("most recently agreed"), so a backdated row typed in later (the 245 bps
 * backfill entered on 15 Aug for 1 Mar) displaced the 225 bps row actually in force (AUD-031). A schedule
 * dated in the future is not shown until it takes effect; with none in force the result is null.
 */
export async function getCurrentFeeScheduleForDisplay(
  pool: Pool,
  merchantId: string,
): Promise<CurrentFeeScheduleDisplay | null> {
  const result = await pool.query<{ mdr_bps: number; effective_from: Date; created_at: Date }>(
    `SELECT mdr_bps, effective_from, created_at
       FROM fee_schedules
      WHERE merchant_id = $1 AND effective_from <= now()
      ORDER BY effective_from DESC, created_at DESC
      LIMIT 1`,
    [merchantId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { mdrBps: row.mdr_bps, effectiveFrom: row.effective_from, createdAt: row.created_at };
}
