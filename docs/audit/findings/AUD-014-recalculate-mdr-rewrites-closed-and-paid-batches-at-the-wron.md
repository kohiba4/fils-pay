# AUD-014 — Recalculate MDR rewrites closed AND paid batches, at the wrong rate

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / history mutation |
| Status | **fixed** (branch `fix/AUD-014-mdr-recalc-paid-batches`, pending merge) |
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
- Idempotency (needed because a paid row no longer changes): the new fee is compared with the fee ALREADY adjusted to = stored fee + the net of earlier `MDR recalculation adjustment` ledger legs for that batch (`priorMdrAdjustmentFils`). Without this every rerun would post the same difference again. `BatchAdjustment.OldFeeFils` now reports that effective fee for paid batches.
- Tests (written first; the repro failed `fee 2500 -> 4000, net 97500 -> 96000`): `TestRecalculateMDR_PaidBatchGetsAnAdjustmentNotARewrite` and `..._PaidBatchAdjustmentIsIdempotentAndCumulative` (rate 250 -> 400 -> rerun -> 300: net adjustment +500 = 3,000 owed - 2,500 paid, one leg group per change). `TestRepro_AUD014_*` now passes. No existing test changed.

## Re-attack notes
- API consumers: the response shape is unchanged (`apps/api/src/admin/settlementClient.ts` reads `status`, `oldFeeFils`, `newFeeFils`, `diffFils`); for paid batches `oldFeeFils` is now the effective (already adjusted) fee.
- Reconciliation will show a gap equal to the cumulative adjustments on paid batches (ledger payable moves, `net_payout_fils` does not). That is the intended visibility of the correction, not a new bug.
- **Open question (traced, not changed): how does an adjustment reach the bank?** `PayoutBatch` pays only the batch's own `net_payout_fils`. An adjustment on a paid batch (and manual credits, CSV adjustments) changes `merchant_payable` and the cache, but no payout or collection instruction is generated for it, so a fee increase is never collected and a decrease never paid out. This was already true before the fix (the old code also only posted legs). Needs a finance decision on the settlement path for adjustments (e.g. fold the payable remainder into the next batch's payout).
- Not covered by tests: concurrent recalculation vs a payout of the same batch (batch rows are locked `FOR UPDATE`; traced only).
- Recalculation uses the merchant's CURRENT terms and ignores `fee_schedules` and the volume tier, as designed for finance contract changes; if a tier discount was active when the batch closed, a recalculation removes it from the fee (known limitation).

## Related
AUD-016, AUD-015
