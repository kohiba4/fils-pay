-- AUD-018, Track B half (contract from Track A's AUD-018 finding: "unique
-- settlement_batch_id (one disbursement per batch) with ON CONFLICT DO
-- NOTHING"; index name proposed by Track B, to be confirmed by Track A).
--
-- The dispatcher records a payout disbursement as a side effect of the first
-- attempt of each settlement.paid delivery row: once per webhook endpoint and
-- again for every replay, each with a fresh disbursement_reference. 0057's
-- comment ("one row per paid batch") was never enforced.
--
-- Existing duplicates are kept and marked (later rows point at the earliest
-- row for the same batch); only unmarked rows are covered by the index.
-- Readers must ignore marked rows. Nothing is deleted.
ALTER TABLE settlement_payout_disbursements
    ADD COLUMN IF NOT EXISTS duplicate_of_disbursement_id UUID REFERENCES settlement_payout_disbursements (id);

WITH ranked AS (
    SELECT id,
           first_value(id) OVER (PARTITION BY settlement_batch_id ORDER BY created_at, id) AS first_id
      FROM settlement_payout_disbursements
)
UPDATE settlement_payout_disbursements d
   SET duplicate_of_disbursement_id = r.first_id
  FROM ranked r
 WHERE d.id = r.id
   AND r.id <> r.first_id
   AND d.duplicate_of_disbursement_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_payout_disbursements_batch
    ON settlement_payout_disbursements (settlement_batch_id)
    WHERE duplicate_of_disbursement_id IS NULL;
