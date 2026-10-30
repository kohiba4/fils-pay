-- AUD-006 (incident 2026-05-14): a single-use payment link could be charged
-- twice because nothing tied a transaction to the link it paid. The 2026-05
-- postmortem action FP-202 ("unique constraint, Done") was never written:
-- no such column or index existed.
--
-- payment_link_id is set only by the payment-link pay flow. At most one
-- non-voided transaction may exist per link, so a second capture would need a
-- second live transaction, which the index refuses. A voided authorization
-- frees the link for the next payer.
--
-- Existing rows keep payment_link_id NULL (historical links cannot be matched
-- to their transactions reliably), so the index cannot fail on existing data.
-- Adding a nullable column without a default does not rewrite the table.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS payment_link_id UUID REFERENCES payment_links(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_one_live_per_payment_link
    ON transactions (payment_link_id)
    WHERE payment_link_id IS NOT NULL AND status <> 'voided';
