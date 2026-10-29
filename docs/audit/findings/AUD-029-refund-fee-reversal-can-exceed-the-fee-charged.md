# AUD-029 — Refund fee reversal can exceed the fee charged

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **Medium** |
| Category | money / rounding |
| Status | **fixed** (branch `feat/FP-300-refund-core`) |
| Fix commit | see `git log feat/FP-300-refund-core` |

## Summary
Refund fee reversal can exceed the fee charged.

## Location
packages/money/src/fils.ts `calculateRefundFee`, processRefund.ts:113-121

**Sibling locations checked:** Fee 'charged' is read as SUM of platform_fee_revenue credits, ignoring discount debits (AUD-016).

## Root cause
Each partial rounds independently (banker's) → e.g. fee 5, captured 3, three refunds of 1 → 2+2+2 = 6 > 5. Meeting note claims 'tests show it never exceeds' — the tests only cover single refunds.

## Reproduction / evidence
Arithmetic trace.

## Impact
Platform gives back more fee than it earned; ledger fee revenue negative per txn.

## Fix
Kept the finance-approved per-refund rule (`calculateRefundFee`, banker's rounding, meeting 2026-07-08) and added the missing guarantee: the reversal is clamped to the fee still kept (`feeKept - sum(refunds.fee_reversed_fils)`), and the refund that brings the refunded total up to the captured amount reverses exactly the remainder. The fee "kept" is read from the ledger as capture's fee credit minus the negotiated-discount debit (the old code summed only the credits, so a discounted merchant got back more fee than the platform had kept).

Tests: `processRefund.test.ts` "AUD-029" (captured 3 fils at 66.67%: three refunds of 1 reverse 2 in total, not 3; captured 7 fils at 25%: seven refunds of 1 end at exactly the fee, never above it at any step), "a negotiated discount lowers the fee a refund gives back" (full refund of a 20%-discounted 10.000: 200 reversed, fee revenue on the transaction ends at 0, never negative). Tests changed: none.

## Re-attack notes
Known gap (recorded in AUD-016): capture applies the negotiated discount in a second transaction after it commits (`applyCaptureDiscountAdjustment`), so a refund that lands between the two would reverse the undiscounted fee. It closes when AUD-016 moves the discount into capture. Pay-link captures never get the discount (AUD-016), so their ledger fee is the undiscounted one and the refund follows the ledger.

## Related
AUD-016
