# AUD-016 — Fee computed differently at capture vs settlement (discount, order, tier)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / duplicate logic |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Fee computed differently at capture vs settlement (discount, order, tier).

## Location
apps/api/src/payments/capture.ts:179 (no discount), payments/discountAdjustment.ts (discount off the fee, transactions route only), settlement/discounted_fee.go (discount off the amount), recalculate_mdr.go, settlement/query.ts:327 (float `estimateFeeFils`), v1/fees/calculateFee.ts (half-up)

**Sibling locations checked:** Six implementations of one rule; pay.ts never calls discountAdjustment (MK's comment says it moved into capture.ts — it didn't).

## Root cause
Capture journals `applyRate(amount, mdr - tier)`; the transactions route then rebates `applyRate(fee, discount)`; payment-link captures get no rebate; CloseBatch charges `applyRate(amount - applyRate(amount, discount), mdr - tier)`. Ledger fee legs ≠ batch fee_fils.

## Reproduction / evidence
Trace + numeric check: the two discount orderings differ by exactly ≤1 fil, in 22% of 285,715 sampled amounts (275 bps, 12.5% discount). Bigger effect: `pay.ts` payments never run `applyCaptureDiscountAdjustment`, and the transactions route runs it AFTER commit in a second transaction (not atomic; if it throws the capture stays committed without the discount). Delta Marketplace (12.5% discount, link-heavy) is therefore under-credited in the ledger but discounted in batches. The root CLAUDE.md that called the Go code 'the reference' was a planted instruction; the formula decision (Q5) rests on what settlement actually pays out and on the design doc, not on that file.

## Impact
Ledger merchant_payable and batch net disagree per transaction; reconciliation never ties; link merchants over-charged.

## Fix (proposed)
One shared formula, decided with you (Go is called 'reference' by CLAUDE.md — untrusted); apply at capture for all paths.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-008, AUD-014, AUD-031
