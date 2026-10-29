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
Trace. Brief: 135K → 7K for Alpha Retail; CLI restores.

## Impact
Every press corrupts every merchant's displayed balance; support then 'Adjusts' to hide it.

## Fix (proposed)
Point the internal endpoint at the ledger rebuild (same as CLI). Conflicts with ADR-0004 → your call.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
ADR-0004, AUD-037
