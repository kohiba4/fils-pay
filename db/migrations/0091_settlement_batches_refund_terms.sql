-- FP-300 PR 2 / AUD-054: refunds reach the payout. A batch records the refunds it absorbed as two separate terms:
--   net_payout_fils = gross_fils - fee_fils - refund_fils + refund_fee_reversed_fils
-- gross_fils and scheme_export_lines stay captures-only (they must keep matching the scheme file). net_payout_fils may
-- be NEGATIVE for a batch whose refunds exceed its captures: nothing is paid for it and the cached balance shows the debt.
-- DEFAULT 0 keeps every existing batch unchanged (it has no refund terms).
ALTER TABLE settlement_batches
    ADD COLUMN refund_fils                BIGINT NOT NULL DEFAULT 0 CHECK (refund_fils >= 0),
    ADD COLUMN refund_fee_reversed_fils   BIGINT NOT NULL DEFAULT 0 CHECK (refund_fee_reversed_fils >= 0);
