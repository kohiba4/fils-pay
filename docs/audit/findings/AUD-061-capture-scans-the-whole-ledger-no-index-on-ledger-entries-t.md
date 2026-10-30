# AUD-061 — Capture scans the whole ledger several times: no index on `ledger_entries.entry_group_id` or `transaction_id` (nor `holds.transaction_id`)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | performance / capacity |
| Status | **fixed** (branch `feat/totp`, migration 0094) |
| Fix commit | see `git log feat/totp` (migrations 0094, 0095) |

## Summary
`ledger_entries` has only `(merchant_id, occurred_at)` and the primary key. Two hot paths look rows up by columns that are not indexed: the **balance trigger** (migration 0007: deferred, once per inserted row, `SUM ... WHERE entry_group_id = ...`) and the capture/refund code (`WHERE transaction_id = ...`). Every capture therefore rescans the entire ledger several times (4 ledger rows = 4 scans at commit, plus the discount step). `holds` has the same gap on `transaction_id`.

## Location
`apps/api/src/payments/discountAdjustment.ts` (count of discount adjustments per transaction), `apps/api/src/payments/processRefund.ts` (fee kept per transaction), `payments/capture.ts` (`UPDATE holds ... WHERE transaction_id`). Indexes: `db/migrations/0007`, `0005` (never created).

## Root cause
The tables were designed around merchant and time queries (`idx_ledger_entries_merchant_occurred`); the transaction-scoped look-ups added later by capture, the discount adjustment and refunds were never given an index.

## Reproduction / evidence
Found while load testing the live server (docs/audit/LOAD-TEST.md): throughput plateaued far below what the CPU allowed. `EXPLAIN (ANALYZE, BUFFERS)` of the discount-adjustment query on the load-tested database: `Seq Scan on ledger_entries ... Rows Removed by Filter: 42943, Buffers: shared hit=961, Execution Time: 7.4 ms`, against 0.03 ms for the indexed `transaction_events` look-up in the same statement. The cost is linear in the size of the ledger, i.e. in the number of checkouts ever processed.

## Impact
Every capture (and every refund) gets slower as the platform grows, and the work is done under the transaction lock and the connection held across the call. The platform degrades with its own success; under load the slowdown compounds (each checkout adds rows that every later checkout must scan).

## Fix
Migration 0094: `idx_ledger_entries_transaction` (partial, `transaction_id IS NOT NULL`: settlement and MDR legs have no transaction) and `idx_holds_transaction`. Migration 0095: `idx_ledger_entries_group` on `entry_group_id` (the balance trigger's look-up; this one is the dominant cost: found after 0094 alone did not move the throughput ceiling, which is why both are recorded). Test: `apps/api/src/db/hotPathIndexes.test.ts` (fails before the migration). Effect on existing data: none (indexes only).

## Re-attack notes
Other look-ups by `transaction_id` on the same tables (refunds fee query, reconciliation) use the same index. Index build on a large production ledger should be run with `CREATE INDEX CONCURRENTLY` outside the migration runner; on this deployment the ledger is small.

## Related
Capacity section of the submission document; AUD-048.
