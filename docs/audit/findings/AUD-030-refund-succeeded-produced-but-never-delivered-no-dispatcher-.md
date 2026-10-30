# AUD-030 — `refund.succeeded` produced but never delivered (no dispatcher type, no envelope)

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **Medium** |
| Category | integration |
| Status | fix ready, not merged (runtime-verified locally on 55433; review pending) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
`refund.succeeded` produced but never delivered (no dispatcher type, no envelope).

## Location
apps/api/src/webhooks/dispatcher.ts:28-32, envelope.ts:54-95

**Sibling locations checked:** Reporting consumer ignores refunds too (to verify).

## Root cause
Event type is enqueued but not in WEBHOOK_ELIGIBLE_EVENT_TYPES and has no buildEnvelope case.

## Reproduction / evidence
Trace.

## Impact
Shop gets no refund webhook (FP-300 criterion).

## Fix (proposed)
FP-300.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
FP-300

## FP-300 PR 3 addendum (Track B, 2026-10-30; for @kohiba4)
`apps/api/src/webhooks/dispatcher.ts` adds `refund.succeeded` to the eligible list; `webhooks/envelope.ts` maps it to
`{ refundId, transactionId, merchantId, amountFils, feeReversedFils, refundedTotalFils, status }` (same conventions as
`transaction.captured`). Verified end to end by `apps/api/src/refunds/fp300Acceptance.test.ts`: three refunds through
`POST /v1/refunds` produce three signed `refund.succeeded` deliveries to the merchant's endpoint, each verifying over the
raw body; failed against the code before the change.
