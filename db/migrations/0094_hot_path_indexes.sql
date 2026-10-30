-- AUD-061 (capacity): look-ups by transaction_id on the capture/refund path were sequential scans.
--   ledger_entries: the post-capture discount step counts adjustments per transaction, the refund fee lookup sums
--   platform_fee_revenue per transaction (7 ms per call at 43,000 rows, growing linearly with every checkout).
--   holds: capture releases the active hold of a transaction.
CREATE INDEX idx_ledger_entries_transaction ON ledger_entries (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_holds_transaction ON holds (transaction_id);
