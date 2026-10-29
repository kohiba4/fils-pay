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
Migration 0078 changes `merchants.lifetime_net_payout_monitoring_estimate` from REAL to BIGINT (same name; nothing else reads it) and rebuilds the already-drifted values exactly from `SUM(net_payout_fils)` of each merchant's paid batches (merchants without paid batches keep their rounded value). `UpdateLifetimePayoutMonitoringEstimate` adds an `int64`; `EstimateMonthlyPayout` now returns `money.Fils` computed by `SUM` in SQL (it had a float32 accumulator; no caller). The seed (`db/seed/generate.ts`) used `Math.fround` to mimic the REAL column and now sums exact integers. Tests: `LargeTotalsStayExact`, `TestEstimateMonthlyPayout_ExactIntegerSumOfRecentPaidBatches`. Tests changed: `TestUpdateLifetimePayoutMonitoringEstimate_SmallValuesExact` scans into `int64` instead of `float32` (the column type changed; the asserted value, exactly 51000, is unchanged). Migration 0040's comment ("plain real") is left as written (applied migration).

## Re-attack notes
Sibling float32 uses in apps/settlement: none left (`grep -rn float32 apps/settlement --include=*.go` outside tests now matches only a comment; AUD-008 removed the batch one). Fresh `migrate` from 0001 to 0078 and the seed both run clean on a scratch database. Data note: the migration recomputation assumes `settlement_batches.net_payout_fils` of paid batches equals what `PayoutBatch` added; since AUD-014 paid batches are never rewritten, that holds going forward.

## Related
AUD-008
