# AUD-027 — Refund inserts violate the 0070 reason constraint — refunds always 500

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **High** |
| Category | schema drift |
| Status | confirmed (runtime) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Refund inserts violate the 0070 reason constraint — refunds always 500.

## Location
apps/api/src/payments/processRefund.ts:165 (`input.reason ?? null`), db/migrations/0070

**Sibling locations checked:** 11 failing tests in processRefund/initiateMerchantRefund.

## Root cause
0070 adds `CHECK (reason IS NOT NULL) NOT VALID` (enforced for new rows) and a default, but the code passes an explicit NULL, bypassing the default.

## Reproduction / evidence
Baseline: 11 tests fail with `violates check constraint "chk_refunds_reason_not_null"`.

## Impact
Refund feature cannot work (FP-300 blocker).

## Fix (proposed)
Omit the column / pass a value when absent (part of FP-300).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
FP-300
