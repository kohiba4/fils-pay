# AUD-014 — Recalculate MDR rewrites closed AND paid batches, at the wrong rate

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / history mutation |
| Status | **fixed** (merged into main) |
| Fix commit | see `git log fix/AUD-014-mdr-recalc-paid-batches` |

## Summary
Recalculate MDR rewrites closed AND paid batches, at the wrong rate.

## Location
apps/settlement/internal/settlement/recalculate_mdr.go:66-127

**Sibling locations checked:** CloseBatch resolves fee_schedules per event + tier bonus; recalc uses `merchants.mdr_bps` only.

## Root cause
Selects `status <> 'open'` (closed AND paid) and rewrites `settlement_batches.fee_fils/net_payout_fils` on paid batches, so the stored batch no longer matches the bank instruction/statement. Recalculating at the merchant's *current* terms is the intended finance flow (test `TestRecalculateMDR_RecomputesAtCurrentRate`, closed-unpaid batch), so that part is NOT a bug. 'Open' batches have no totals (status open exists only inside CloseBatch's tx), so the settlement team's 'only touches open batches' is vacuous: it never touches them.

## Reproduction / evidence
Trace + test review: existing tests cover only closed (unpaid) batches; none covers a paid batch. Seed contains 64 closed, 4 open, 0 paid, so the paid case needs a constructed test.

**Phase 1 runtime check:** TestRepro_AUD014_RecalculateMDRDoesNotRewritePaidBatch: paid batch fee 2500 → 4000, net 97500 → 96000 after the merchant rate changed, though the bank was already paid 97500.

## Impact
Paid batches no longer match the bank instruction/statement; fee history wrong; settlement team's claim "only open batches" is false (it never touches open ones).

## Fix (applied; decision Q3)
- `settlement/recalculate_mdr.go`: a **paid** batch's row (`fee_fils`, `net_payout_fils`) is never rewritten any more: the fee difference is posted as a ledger adjustment (dated now) and applied to the cache only. **Closed, unpaid** batches are still rewritten before payout (intended finance flow, covered by the 4 existing tests, untouched).
- Idempotency (needed because a paid row no longer changes): the cumulative adjustment applied to a paid batch is stored explicitly in a new column `settlement_batches.paid_fee_adjustment_fils` (migration **0073**, default 0, correct for history because the old code rewrote rows). The new fee is measured against `fee_fils + paid_fee_adjustment_fils`. A batch rewritten while still closed has its changes folded into `fee_fils` and keeps 0, so nothing is counted twice. `BatchAdjustment.OldFeeFils` reports that effective fee. (First version inferred the prior adjustments from ledger legs with a description string; the independent review proved that double counts a batch rewritten while closed and later paid, e.g. OldFeeFils 5,500 and a 1,500 over-credit; replaced by the column.)
- Tests (written first; the repro failed `fee 2500 -> 4000, net 97500 -> 96000`): `TestRecalculateMDR_PaidBatchGetsAnAdjustmentNotARewrite` and `..._PaidBatchAdjustmentIsIdempotentAndCumulative` (rate 250 -> 400 -> rerun -> 300: net adjustment +500 = 3,000 owed - 2,500 paid, one leg group per change) and, from the review, `..._RewrittenWhileClosedThenPaidThenRecalculated` (rewritten while closed 2,500 -> 4,000, paid, then 300: expects 4,000 -> 3,000, total +500; failed before the column with `OldFeeFils: 5500, DiffFils: -2500`). `TestRepro_AUD014_*` now passes. No existing test changed.

## Re-attack notes
- API consumers: the response shape is unchanged (`apps/api/src/admin/settlementClient.ts` reads `status`, `oldFeeFils`, `newFeeFils`, `diffFils`); for paid batches `oldFeeFils` is now the effective (already adjusted) fee.
- Reconciliation will show a gap equal to the cumulative adjustments on paid batches (ledger payable moves, `net_payout_fils` does not). That is the intended visibility of the correction, not a new bug.
- **Open question (traced, not changed): how does an adjustment reach the bank?** `PayoutBatch` pays only the batch's own `net_payout_fils`. An adjustment on a paid batch (and manual credits, CSV adjustments) changes `merchant_payable` and the cache, but no payout or collection instruction is generated for it, so a fee increase is never collected and a decrease never paid out. This was already true before the fix (the old code also only posted legs). Needs a finance decision on the settlement path for adjustments (e.g. fold the payable remainder into the next batch's payout).
- Not covered by tests: concurrent recalculation vs a payout of the same batch (batch rows are locked `FOR UPDATE` and `PayoutBatch`/`PayoutSplitBatch` lock the same row, so they serialise; traced by the reviewer, not run).
- Removed the stale comment `MK: recalculate_mdr.go selects paid batches too??` in `apps/api/src/routes/admin.ts`. Needs migration 0073 applied (Track A migration range).
- **Escalate to finance (real gap, pre-existing):** adjustments never reach a payout instruction; `PayoutBatch`, `payout_estimate.go` and `payout_notify.go` only use `net_payout_fils` and nothing sweeps payable adjustments, so a fee increase on a paid batch is never collected and a decrease is never paid out.
- Recalculation uses the merchant's CURRENT terms and ignores `fee_schedules` and the volume tier, as designed for finance contract changes; if a tier discount was active when the batch closed, a recalculation removes it from the fee (known limitation).

## Related
AUD-016, AUD-015
