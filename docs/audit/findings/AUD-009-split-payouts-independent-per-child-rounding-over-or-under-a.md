# AUD-009 — Split payouts: independent per-child rounding over- or under-allocates the batch net

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money |
| Status | confirmed (runtime) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Split payouts: independent per-child rounding over- or under-allocates the batch net.

## Location
apps/settlement/internal/splits/allocate.go:93-141, splits/shares.go:11-17

**Sibling locations checked:** TS `allocateRemainder` (packages/money) is the correct largest-remainder primitive and is unused here; seed selfVerify asserts allocateRemainder only.

## Root cause
Each child gets `ApplyRateFils(net, weight)` independently (half-even), so shares rarely sum to `net`. The seed weights (5000/3000/2000 = 10000) are valid, so the sum error comes only from rounding. All payout legs debit the parent's `merchant_payable`; per-child amounts live only in `settlement_batch_splits`. The cache is reduced by `totalAllocated`, which equals the ledger debit, so cache and ledger agree with each other but not with `batch.net_payout_fils`. (Correction to an earlier draft that said the cache drifts from the ledger.)

## Reproduction / evidence
Numeric check over 3,000 consecutive nets (1,000,000–1,002,999 fils): 10% under-allocated by 1 fil, 10% OVER-allocated by 1 fil (payable debited more than the batch net, can go negative). That explains 'a few fils short' but NOT finance's 'a few tens of fils each batch'; the larger figure is unexplained by this code (open question, claim C14 partially true).

**Phase 1 runtime check:** TestRepro_AUD009_SplitPayoutAllocatesExactlyTheNet: net 1001 → children allocated 1000, ledger debited 1000, 1 fil stranded in payable (batch marked paid).

## Impact
Batch is marked paid while up to 1 fil per batch stays stranded in payable (or is over-paid); ledger payout total ≠ batch net.

## Fix (proposed)
Largest-remainder allocation in Go (port of `allocateRemainder`) so shares sum exactly to net; refuse to pay when child weights don't sum to 10000. Keep the existing parent-leg ledger model (decision Q8).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-008
