# AUD-009 — Split payouts lose the remainder, never credit children, and drift the cache

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Split payouts lose the remainder, never credit children, and drift the cache.

## Location
apps/settlement/internal/splits/allocate.go:93-141, splits/shares.go:11-17

**Sibling locations checked:** TS `allocateRemainder` (packages/money) is the correct largest-remainder primitive and is unused here; seed selfVerify asserts allocateRemainder only.

## Root cause
Each child gets `ApplyRateFils(net, weight)` independently (banker's rounding) so shares rarely sum to `net`; the difference is never posted. All payout legs debit the **parent's** `merchant_payable` (child id not on the leg), so nothing ever credits a child in the ledger; `ApplyPayout` subtracts `totalAllocated` instead of `net`.

## Reproduction / evidence
Trace. Brief: "three child payouts don't add up… a few tens of fils… every batch".

## Impact
Fils stay stranded in the parent's payable forever; parent cache drifts; child balances wrong.

## Fix (proposed)
Go port of largest-remainder allocation so shares sum exactly to net; post per-child legs; apply `net` to cache. Ledger model for children to confirm with you (Phase 2 question).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-008
