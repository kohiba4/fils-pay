import type { Pool } from "pg";

/** Operational record of a payout-rail instruction for a settlement batch. */
export async function recordPayoutDisbursementEffect(
  pool: Pool,
  settlementBatchId: string,
  amountFils: number,
): Promise<void> {
  if (amountFils <= 0) {
    // Void batches (zero or negative net) carry no payout instruction.
    return;
  }

  await pool.query(
    // AUD-018 (B half): one disbursement per paid batch (migration 0082). The
    // effect runs once per settlement.paid delivery row — per endpoint and per
    // replay — so a repeat must be a no-op, not a second payout instruction.
    `INSERT INTO settlement_payout_disbursements (settlement_batch_id, amount_fils, disbursement_reference)
     VALUES ($1, $2, 'disb_' || gen_random_uuid())
     ON CONFLICT (settlement_batch_id) WHERE duplicate_of_disbursement_id IS NULL DO NOTHING`,
    [settlementBatchId, amountFils],
  );
}
