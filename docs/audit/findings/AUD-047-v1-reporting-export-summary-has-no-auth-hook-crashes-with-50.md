# AUD-047 — `/v1/reporting/export-summary` has no auth hook (crashes with 500); UTC date used in a Bahrain-bucketed rollup

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Low** |
| Category | authn / time |
| Status | confirmed (trace) / suspected (UTC part) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
`/v1/reporting/export-summary` has no auth hook (crashes with 500); UTC date used in a Bahrain-bucketed rollup.

## Location
apps/api/src/routes/reporting.ts:79-86; apps/reporting/src/consumer/applyEvent.ts:170; apps/api/src/payments/capture.ts:14-45 (`recordCaptureMetric`, never called)

**Sibling locations checked:** 0027 says merchant_daily_volume is bucketed by the Bahrain date; the reporting helper `bahrainDate.ts` exists but line 170 slices the UTC date.

## Root cause
Route reads `request.merchantAuth!.merchantId` without `requireMerchantAuth` → TypeError → 500 (fails closed, no data leak). Line 170 uses `toISOString().slice(0,10)` (UTC) for a summary date.

## Reproduction / evidence
Trace.

## Impact
Unauthenticated callers get a 500 instead of 401 (noise, error leakage); possible 3-hour day-boundary skew in refund/summary rollups.

## Fix (proposed)
Add the preHandler; use `toBahrainDateString`.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-041
