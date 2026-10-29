# AUD-027 — Refund inserts violate the 0070 reason constraint — refunds always 500

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **High** |
| Category | schema drift |
| Status | **fixed** (branch `feat/FP-300-refund-core`) |
| Fix commit | see `git log feat/FP-300-refund-core` |

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

## Fix
The INSERT now uses `COALESCE($6, 'unspecified')` for `reason`, so an omitted reason takes the default 0070 intended instead of an explicit NULL. The route validates `reason` (1-255 characters) and stores it trimmed.

Tests: All 11 previously failing refund tests pass (processRefund x8, initiateMerchantRefund x4); `routes/refunds.test.ts` checks the default and a custom reason. Tests changed: none.

## Re-attack notes
Migration 0070 is untouched (applied). No other writer inserts into `refunds`.

## Related
FP-300
