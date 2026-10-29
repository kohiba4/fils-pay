# AUD-040 — Webhook dispatcher Step B has no row claim (multi-replica double send)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Low** |
| Category | race |
| Status | suspected |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Webhook dispatcher Step B has no row claim (multi-replica double send).

## Location
apps/api/src/webhooks/dispatcher.ts:239-250

**Sibling locations checked:** index.ts comment claims SKIP LOCKED — absent.

## Root cause
Plain SELECT of due rows; two replicas send the same delivery.

## Reproduction / evidence
Trace; single replica today.

## Impact
Duplicate deliveries when scaled.

## Fix (proposed)
FOR UPDATE SKIP LOCKED claim.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-018
