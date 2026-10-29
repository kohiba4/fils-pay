# AUD-009 — Split payouts: independent per-child rounding over- or under-allocates the batch net

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money |
| Status | **fixed** (branch `fix/AUD-009-split-exact-allocation`, pending merge; historical stranded fils not repaired) |
| Fix commit | see `git log fix/AUD-009-split-exact-allocation` |

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

## Fix (applied; decision Q8)
- `splits/shares.go`: `ChildShares` is now the single allocator: largest-remainder method (a Go port of `allocateRemainder`), so shares always sum to exactly the batch net. It returns `ErrInvalidSplitWeights` unless every weight is > 0 and they sum to exactly 10,000 bps. (Before, `ChildShares` was never called by production: `PayoutSplitBatch` inlined its own independent per-child `ApplyRateFils`.)
- `splits/allocate.go` (`PayoutSplitBatch`): uses `ChildShares`; validates the weights BEFORE writing anything; a non-positive net posts no legs (like `PayoutBatch`); each leg's description now carries the child id (`... split to sub-merchant <uuid>`) for traceability; the cache is reduced by the batch NET (resolves the "am:" comment) instead of the sum of the rounded shares. Ledger model unchanged (legs on the parent's payable; per-child record in `settlement_batch_splits`).
- `cmd/settlement/main.go` + `internalapi/server.go`: skipped batches printed by the CLI and returned in an additive `skipped` field of `/internal/run-batch` (the API client ignores unknown fields).
- `settlement/batch.go` (`RunDailyBatch`): a parent with invalid weights is logged, its batch is left `closed` (unpaid) and it is listed in `DailyBatchReport.Skipped`, instead of aborting the daily run for every other merchant. **It is NOT retried automatically:** the daemon only runs *yesterday*, so once the date rolls over an operator must fix the weights and run `settlement run-batch --date=D --merchant=M`. The skip is visible in the CLI output (`!! NOT PAID`), the daemon log (every tick that day) and the admin run-batch response (additive `skipped` array). (An earlier draft claimed it would be retried next run; the independent review proved that false.)
- Tests (written first; compile-red + the Phase-1 runtime repro `net 1001 -> allocated 1000`): `TestChildShares_AwkwardNetsSumExactly` (5 weight sets x nets 0..3000: sum == net, each share within 1 of its floor), `..._LargestRemainderGetsTheExtraFil`, `..._RejectsBadWeights`, `TestSplitPayout_InvalidWeightsAreNotPaid`, `TestRunDailyBatch_SkipsAParentWithInvalidSplitWeights`, `TestSplitPayout_PaysExactlyNetAndReducesCacheByNet`, and the existing `TestRepro_AUD009_*` now passes.
- **Tests changed (justified):** `TestChildShares_SumToNet` only used "nice" numbers where independent rounding happens to sum (10000/5000+5000, 9000/3000+3000+4000, 5000/10000), so it passed while production lost or invented fils; its cases are kept unchanged, only the call now handles the new `(shares, err)` return. The strict cases are added next to it.

## Re-attack notes
- Property check inside the tests covers nets 0..3000 for weights (5000,3000,2000), (3333,3333,3334), (1,9999), (2500 x4), (10000): never negative, never off by more than 1 fil from the exact proportion, always summing to the net. Overflow guard: nets above MaxInt64/10000 are rejected rather than wrapping.
- Over-allocation (children paid MORE than the net, payable driven below zero) existed too, not only the "vanishing fil" finance described. Measured: with weights 5000/3000/2000 about 10% of nets under- and 10% over-allocated; with 3333/3333/3334 about 33% under and 28% over.
- Zero-share children now keep their `settlement_batch_splits` audit row (no ledger legs; the `amount_fils > 0` CHECK), covered by `TestSplitPayout_ZeroShareChildKeepsAnAuditRow`.
- Not fixed here: `PayoutSplitBatch` still does not call `UpdateLifetimePayoutMonitoringEstimate` (non-split payouts do; monitoring only, see AUD-033), and the payout posts no `settlement_payout_disbursements` row for splits (disbursement is created by the webhook path, see AUD-018).
- Finance's "a few tens of fils each batch" is still NOT explained by this code (rounding error is at most 1 fil per batch with valid weights); if production weights do not sum to 10,000 the loss would be larger. Check the production weights first (query below).

## Data check for finance (read-only, nothing run)
```sql
-- weights per parent: must be exactly 10000
SELECT parent_merchant_id, SUM(split_weight_bps) AS total_bps, count(*) FROM merchant_split_children
GROUP BY 1 HAVING SUM(split_weight_bps) <> 10000;
-- paid split batches whose children were not paid exactly the net
SELECT sb.id, sb.batch_date, sb.net_payout_fils, SUM(s.allocated_fils) AS allocated,
       sb.net_payout_fils - SUM(s.allocated_fils) AS stranded_fils
FROM settlement_batches sb JOIN settlement_batch_splits s ON s.settlement_batch_id = sb.id
GROUP BY sb.id HAVING SUM(s.allocated_fils) <> sb.net_payout_fils;
```
Stranded fils remain in the parent's `merchant_payable` and need a reviewed, idempotent correction (finance decision).

## Related
AUD-008
