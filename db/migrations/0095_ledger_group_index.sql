-- AUD-061 (capacity), the dominant part: the ledger balance trigger (0007, deferred, FOR EACH ROW) runs at commit once per
-- inserted ledger row and executes  SELECT SUM(...) FROM ledger_entries WHERE entry_group_id = <group>.  Without an index on
-- entry_group_id that is a sequential scan of the whole ledger per row: a capture (4 rows) rescanned the ledger 4 times at
-- commit, and the cost grew with every checkout ever processed. 0094 covered the transaction_id look-ups.
CREATE INDEX idx_ledger_entries_group ON ledger_entries (entry_group_id);
