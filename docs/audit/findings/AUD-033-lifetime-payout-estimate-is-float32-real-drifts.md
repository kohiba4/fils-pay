# AUD-033 — Lifetime payout estimate is float32/REAL (drifts)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Low** |
| Category | float |
| Status | **fixed** (branch `fix/AUD-033-payout-estimate-integer`) |
| Fix commit | see `git log fix/AUD-033-payout-estimate-integer` |

## Summary
Lifetime payout estimate is float32/REAL (drifts).

## Location
apps/settlement/internal/settlement/payout_estimate.go, db/migrations/0040

**Sibling locations checked:** EstimateMonthlyPayout float32 too.

## Root cause
float32 accumulator stops adding small payouts once the total is large.

## Reproduction / evidence
Chat claim TRUE. Nothing reads the column or calls `EstimateMonthlyPayout` (grep of apps, packages, scripts, db: only the writer in `payout_estimate.go` and the seed), so there is no money effect, and the "nobody reads it" comments are right. Reproduced by `TestUpdateLifetimePayoutMonitoringEstimate_LargeTotalsStayExact`: with float32 (REAL) a 1,000,000,000 fils total (1M BD) cannot hold increments like 40,001 or 1 (spacing between float32 values is 64 there).

## Impact
Any future ops dashboard or alert built on the figure would be wrong for high-volume merchants (above 2^24 fils, about 16,777 BD, float32 cannot represent every integer; small payouts added to a large total vanish). No payout, ledger or fee value is affected.

## Fix
Migration 0078 changes `merchants.lifetime_net_payout_monitoring_estimate` from REAL to BIGINT (same name; nothing else reads it) and rebuilds the already-drifted values from `SUM(net_payout_fils)` of each merchant's paid batches (an exact integer sum of the batches' current net; merchants without paid batches keep their rounded value). `UpdateLifetimePayoutMonitoringEstimate` adds an `int64`; `EstimateMonthlyPayout` now returns `money.Fils` computed by `SUM` in SQL (it had a float32 accumulator; no caller). The seed (`db/seed/generate.ts`) used `Math.fround` to mimic the REAL column and now sums exact integers. Tests: `LargeTotalsStayExact`, `TestEstimateMonthlyPayout_ExactIntegerSumOfRecentPaidBatches`. Tests changed: `TestUpdateLifetimePayoutMonitoringEstimate_SmallValuesExact` scans into `int64` instead of `float32` (the column type changed; the asserted value, exactly 51000, is unchanged). Migration 0040's comment ("plain real") is left as written (applied migration).

## Re-attack notes
Sibling float32 uses in apps/settlement: none left (`grep -rn float32 apps/settlement --include=*.go` outside tests now matches only a comment; AUD-008 removed the batch one). Fresh `migrate` from 0001 to 0078 and the seed both run clean on a scratch database. Data note (from the review): the backfill is not exactly "what `PayoutBatch` added". (a) Batches paid through the split path (`splits.PayoutSplitBatch`) are included in the sum, but that path never calls `UpdateLifetimePayoutMonitoringEstimate`, so for split merchants the running total will keep missing those payouts (monitoring-only; left as is, noted for whoever builds a dashboard on it). (b) Before AUD-014 a paid batch's net could be rewritten, so the backfill uses today's net, not necessarily the net at payout time. The migration comment says so. Deploy note: the migration rewrites the `merchants` table under an ACCESS EXCLUSIVE lock; fine for a small table, run it in a quiet window.

## Related
AUD-008
