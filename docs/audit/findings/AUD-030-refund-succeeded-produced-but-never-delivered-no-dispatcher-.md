# AUD-030 — `refund.succeeded` produced but never delivered (no dispatcher type, no envelope)

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | integration |
| Status | confirmed (trace) |
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
