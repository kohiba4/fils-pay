# AUD-029 — Refund fee reversal can exceed the fee charged

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | money / rounding |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

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

## Fix (proposed)
Reverse cumulatively: reversal = round(fee × refundedTotal / captured) − already reversed (FP-300).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-016
