# AUD-015 — Admin "Rebuild cached balances" reads scheme export gross, not the ledger — FP-203

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | data integrity |
| Status | **fixed** (merged into main) |
| Fix commit | see `git log fix/AUD-015-rebuild-from-ledger` |

## Summary
Admin "Rebuild cached balances" reads scheme export gross, not the ledger — FP-203.

## Location
apps/settlement/internal/ledger/refresh.go (`RefreshBalanceCache`), internalapi/server.go:250-275, db/migrations/0054 view `merchant_payable_position`

**Sibling locations checked:** CLI `RebuildAllBalances` (rebuild.go) sums ledger merchant_payable (correct); nightly 02:00 refresh claimed in docs — no scheduler code found yet.

## Root cause
Button → `RefreshBalanceCache` → `SUM(scheme_export_lines.amount_fils)` — all-time truncated **gross** of exported lines, ignoring fees, payouts and adjustments. ADR-0004 decided this deliberately; HANDOVER says no button may read anything else.

## Reproduction / evidence
REPRODUCED on the seed DB: Alpha Retail ledger payable = 136,496,486 fils (≈136K BD, brief's '135K') vs the button's source `merchant_payable_position` = 7,326,770 fils (≈7K BD). Delta Wholesale: 1,195,767,544 vs 1,221,411,680. Note docs/exports/merchant-balances-rebuild-2026-09-15.csv shows only small deltas for the same merchants, so that export does not reproduce the brief and is not reliable evidence (its README says staging data may be included).

**Phase 1 runtime check:** TestRepro_AUD015_RefreshBalanceCacheMatchesLedgerRebuild: admin rebuild cached 0, ledger says 975,000. Plus the seed comparison (Alpha 136.5M vs 7.3M) above.

## Impact
Every press corrupts every merchant's displayed balance; support then 'Adjusts' to hide it.

## Fix (applied; decision Q2, ADR-0007 supersedes ADR-0004)
- `internalapi/server.go`: `/internal/rebuild-balances` now calls `ledger.RebuildAllBalances`, the same function the CLI uses.
- `ledger/rebuild.go`: `RebuildAllBalances` rewritten as one `GROUP BY` ledger query + one `unnest` upsert, after locking all existing cache rows (`FOR UPDATE`, stable order) so a concurrent close/payout cannot interleave; ids are sorted before the insert. Resolves the old `TODO: lock merchant_balances rows first`.
- Removed `ledger/refresh.go` (`RefreshBalanceCache`) and its view dependency use. The view `merchant_payable_position` stays (migration 0054; harmless, unused).
- New test (written first, failed with `after = 12000, want 10000`): `internalapi/rebuild_source_test.go::TestRebuildBalances_UsesLedgerNotSchemeExport` (ledger 10,000 vs scheme line 12,000).
- Re-attack test: `TestRebuildAllBalances_ConcurrentRunsDoNotDeadlock` (8 concurrent rebuilds, 40 new merchants).
- **Tests changed/removed (justified):** `ledger/refresh_test.go` deleted: both tests only exercised the removed scheme-view function and asserted the wrong source ("overwrites drifted cache" and "sums across batches" behaviours are already covered for the ledger path by `rebuild_test.go`). In `internalapi/server_test.go::TestRebuildBalances_ValidToken` only comments/messages changed: it passed under both sources because the ledger gross and the scheme line were both 12000 ("FH: ... so the test is right" was a trap); expectations untouched. My Phase-1 repro in `settlement/audit_repro_test.go` was replaced by the endpoint test above.

## Re-attack notes
- The concurrency test passes on unsorted code too, because every rebuild first locks the existing cache rows and so queues behind the others; the sort only matters if the cache table is empty (cannot be set up on the shared test DB). Kept as a cheap guard, not proven by a test.
- Three serial full Go runs: only the 5 other findings' intentional repros fail.
- **Important side effect found while re-attacking: AUD-048.** The cache (incremental, adds net at batch close) and the ledger (counts at capture) define the balance differently; after ANY ledger rebuild (button or CLI) the next close double counts the unbatched captures. Measured: after capture cache 0 / ledger 97,500; after rebuild 97,500 / 97,500; after CloseBatch 195,000 / 97,500; after PayoutBatch 97,500 / 0. The brief wants button = CLI, and the CLI already had this property, so it is delivered as asked, but the rebuild is not safe to run intraday until AUD-048 is fixed. Tell support to treat the rebuilt number as the ledger figure only.
- Sibling found: `rebuild-balances --merchant` never writes (AUD-049). ADMIN.md still claims a nightly 02:00 recompute that has no scheduler code.

## Review follow-ups (independent reviewer, 2026-10-29; no blocking objections)
- Added `SET LOCAL lock_timeout = '10s'` to the rebuild: it locks every cache row, so a clash fails fast instead of hanging the console. Known limits, not fixed: (1) a merchant with NO cache row yet is not locked, so a first-ever close racing a rebuild can be overwritten by the ledger figure (same definition mismatch as AUD-048); (2) other writers (CSV import, adjustments) lock merchant rows in file/arbitrary order while the rebuild locks in uuid order, so a deadlock abort of one of them is possible but unlikely; (3) the rebuild holds all cache locks for the duration of one ledger aggregate (every close/payout waits). Real interleavings with CloseBatch/payout/import were traced, not run.
- Added tests: cache-only merchant rebuilds to 0, negative balance. (Empty-table case cannot be set up on the shared test DB.)
- Corrected stale comments (ledger/rebuild.go package doc, cmd/settlement/main.go) and the HANDOVER.md line saying no console button exists.
- ADR-0007 wording tightened (`--merchant` and the credits/import survive-a-rebuild nuance).

## Related
ADR-0004, AUD-037
