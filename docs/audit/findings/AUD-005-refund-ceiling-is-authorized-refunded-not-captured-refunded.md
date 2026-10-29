# AUD-005 — Refund ceiling is authorized − refunded, not captured − refunded

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **High** |
| Category | money |
| Status | latent |
| Fix commit | — (not fixed; Phase 2) |

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

## Fix (proposed)
`captured - refunded` (FP-300).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-004
