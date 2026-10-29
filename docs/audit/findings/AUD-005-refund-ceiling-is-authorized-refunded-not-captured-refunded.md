# AUD-005 — Refund ceiling is authorized − refunded, not captured − refunded

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **High** |
| Category | money |
| Status | **fixed** (branch `feat/FP-300-refund-core`) |
| Fix commit | see `git log feat/FP-300-refund-core` |

## Summary
Refund ceiling is authorized − refunded, not captured − refunded.

## Location
apps/api/src/payments/processRefund.ts:94

**Sibling locations checked:** refundValidation.ts trusts the caller's `refundableFils`; refundState.ts keeps partially_captured.

## Root cause
`refundableFils = amountAuthorized - refundedFils`. For a partial capture (authorize 10.000, capture 4.000) up to 10.000 can be refunded.

## Reproduction / evidence
Trace. YA's comment (refundState.ts) claims validation stops it — it doesn't, because the ceiling is computed from the authorized amount.

## Impact
Refund more than was charged (brief list item 1) → direct loss.

## Fix
The ceiling is `captured - refunded` (was `authorized - refunded`), computed from the locked row. A partial capture can only be refunded up to what was captured.

Tests: `processRefund.test.ts` "AUD-005" (authorize 10.000, capture 4.000: refunding 5.000 is 422 with `refundableFils` 4000; omitting the amount refunds 4000), `routes/refunds.test.ts` ceiling test. Tests changed: none (`refundValidation.test.ts` already tests the validator with `refundableFils` as input).

## Re-attack notes
The status rule that keeps `partially_captured` after a full refund of a partial capture (finance rule, headroom stays open) is unchanged and cannot re-open refunds, because the ceiling is captured - refunded. Migration 0090 refuses `refunded_fils > captured_fils` at the database too.

## Related
AUD-004
