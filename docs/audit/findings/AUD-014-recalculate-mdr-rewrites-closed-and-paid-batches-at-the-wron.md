# AUD-014 — Recalculate MDR rewrites closed AND paid batches, at the wrong rate

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / history mutation |
| Status | confirmed (runtime) |
| Fix commit | — (not fixed; Phase 2) |

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

## Fix (proposed)
Closed-unpaid: keep current behaviour (rewrite before payout). Paid: post the ledger adjustment and cache delta only; never update the batch row (decision Q3).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-016, AUD-015
