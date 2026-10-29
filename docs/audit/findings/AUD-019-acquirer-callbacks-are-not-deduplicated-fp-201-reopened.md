# AUD-019 — Acquirer callbacks are not deduplicated — FP-201 (reopened)

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | idempotency |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Acquirer callbacks are not deduplicated — FP-201 (reopened).

## Location
apps/api/src/acquirer/callbacks.ts:28-55, db/migrations/0051

**Sibling locations checked:** Postmortem/CHANGELOG/commit bf66bf2 claim `processed_events`; the table, the index (FP-238) and the commit content do not exist (bf66bf2 is an empty commit).

## Root cause
Plain INSERT per callback; no unique on callback_id, no processed_events; `withCallbackRetry` can re-run the insert.

## Reproduction / evidence
Trace + git show bf66bf2 (empty).

## Impact
Duplicate notes on the timeline; any future state-changing callback would double-apply.

## Fix (proposed)
New migration: unique index on (callback_id); INSERT … ON CONFLICT DO NOTHING (de-dup existing rows first).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-021
