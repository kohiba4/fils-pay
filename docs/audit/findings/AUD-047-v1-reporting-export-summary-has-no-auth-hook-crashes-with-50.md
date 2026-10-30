# AUD-047 — `/v1/reporting/export-summary` has no auth hook (crashes with 500); UTC date used in a Bahrain-bucketed rollup

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Low** |
| Category | authn / time |
| Status | fix ready, not merged (runtime-verified locally on 55433; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/15-AUD-047.patch |

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

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/15-AUD-047.patch`.
**Root cause (confirmed by tests).** (1) `routes/reporting.ts` registered `GET /v1/reporting/export-summary` with no
`preHandler`, then read `request.merchantAuth!.merchantId`: every call, authenticated or not, was a 500 (fails closed;
no data leaked). (2) `apps/reporting/src/consumer/applyEvent.ts applyDailySummaryRollup` bucketed by
`toISOString().slice(0,10)` (UTC) into a Bahrain-date table.

**Change.** (1) `preHandler: requireMerchantAuth`; the query was already scoped to the caller's merchant. The route takes
no date parameters, so there is no input to validate. (2) `toBahrainDateString(occurredAt)`, the reporting service's
existing helper.

**Tests:** `apps/api/src/routes/reportingExportSummary.test.ts` (new): unauthenticated → 401 (was 500); a support session
sees only its own merchant's two days (was 500). `apps/reporting/src/consumer/dailySummaryRollup.test.ts` (new): the bound
date at 23:59:59 / 00:00:00 / 02:30 Bahrain is 29th / 30th / 30th; it failed against `main`'s `applyEvent.ts` (file swapped
in temporarily and restored) and passes after. **Tests changed:** none.

**Found while testing (dependency for Track A, FP-300 PR 3):** `applyDailySummaryRollup` has no caller and writes
`refund_count` / `refund_gross_fils`, which do **not exist** in `merchant_daily_volume` on `main`; any call fails today. The
date test therefore uses a capturing client instead of a real insert. Track A's refund-reporting migration must add those
columns (or change the function) before wiring `refund.succeeded` into reporting.

## Re-attack notes
- No credentials: 401. Another merchant's volume never included (two merchants seeded).
- Bahrain midnight boundary covered on both sides; 02:30 Bahrain (still the previous UTC day) goes to the Bahrain day.
- Other reporting appliers already use `toBahrainDateString` (capture/void/batch-closed); no other UTC bucketing found in
  `apps/reporting/src` (grep for `toISOString().slice`).
- Independent skeptical review: **pending**.

## Related
AUD-041
