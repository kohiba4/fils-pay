-- AUD-019 (FP-201, reopened): acquirer callbacks were never deduplicated.
-- CHANGELOG and the 2026-05 postmortem say "deduplicated on callbackId" and
-- commit bf66bf2 claims a processed_events table; the commit is empty and no
-- such table or index exists. Every redelivery (the acquirer retries with the
-- same callback_id, and withCallbackRetry can repeat the insert) appended
-- another note to the transaction's timeline.
--
-- Dedupe key: (transaction_id, callback_id). A callback_id is the acquirer's
-- retry identity for one callback about one transaction.
--
-- Existing duplicates are kept, not deleted: every row after the earliest
-- (by created_at, then id) for the same key is marked with
-- duplicate_of_note_id = the earliest row's id, and only unmarked rows are
-- covered by the unique index. Readers must ignore marked rows.
ALTER TABLE acquirer_callback_notes
    ADD COLUMN IF NOT EXISTS duplicate_of_note_id UUID REFERENCES acquirer_callback_notes (id);

WITH ranked AS (
    SELECT id,
           first_value(id) OVER (PARTITION BY transaction_id, callback_id ORDER BY created_at, id) AS first_id
      FROM acquirer_callback_notes
)
UPDATE acquirer_callback_notes n
   SET duplicate_of_note_id = r.first_id
  FROM ranked r
 WHERE n.id = r.id
   AND r.id <> r.first_id
   AND n.duplicate_of_note_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_acquirer_callback_notes_txn_callback
    ON acquirer_callback_notes (transaction_id, callback_id)
    WHERE duplicate_of_note_id IS NULL;
