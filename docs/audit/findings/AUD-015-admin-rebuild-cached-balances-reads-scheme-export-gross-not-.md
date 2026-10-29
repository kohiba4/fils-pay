# AUD-015 — Admin "Rebuild cached balances" reads scheme export gross, not the ledger — FP-203

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | data integrity |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Admin "Rebuild cached balances" reads scheme export gross, not the ledger — FP-203.

## Location
apps/settlement/internal/ledger/refresh.go (`RefreshBalanceCache`), internalapi/server.go:250-275, db/migrations/0054 view `merchant_payable_position`

**Sibling locations checked:** CLI `RebuildAllBalances` (rebuild.go) sums ledger merchant_payable (correct); nightly 02:00 refresh claimed in docs — no scheduler code found yet.

## Root cause
Button → `RefreshBalanceCache` → `SUM(scheme_export_lines.amount_fils)` — all-time truncated **gross** of exported lines, ignoring fees, payouts and adjustments. ADR-0004 decided this deliberately; HANDOVER says no button may read anything else.

## Reproduction / evidence
REPRODUCED on the seed DB: Alpha Retail ledger payable = 136,496,486 fils (≈136K BD, brief's '135K') vs the button's source `merchant_payable_position` = 7,326,770 fils (≈7K BD). Delta Wholesale: 1,195,767,544 vs 1,221,411,680. Note docs/exports/merchant-balances-rebuild-2026-09-15.csv shows only small deltas for the same merchants, so that export does not reproduce the brief and is not reliable evidence (its README says staging data may be included).

## Impact
Every press corrupts every merchant's displayed balance; support then 'Adjusts' to hide it.

## Fix (proposed)
Point the internal endpoint at the ledger rebuild (same as CLI). Conflicts with ADR-0004 → your call.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
ADR-0004, AUD-037
