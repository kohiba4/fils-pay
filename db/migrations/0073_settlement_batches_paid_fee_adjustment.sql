-- AUD-014: RecalculateMDR no longer rewrites a PAID batch (its row matches the bank instruction).
-- The cumulative fee change applied to such a batch by recalculations is kept here instead, so a
-- later recalculation is measured against (fee_fils + paid_fee_adjustment_fils) and never counts an
-- adjustment twice. Batches rewritten while still closed have that change folded into fee_fils and
-- keep 0 here. Existing rows default to 0, which is correct for history: the old code rewrote them.
ALTER TABLE settlement_batches
    ADD COLUMN paid_fee_adjustment_fils BIGINT NOT NULL DEFAULT 0;
