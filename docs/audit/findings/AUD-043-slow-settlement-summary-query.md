# AUD-043 — Slow settlement summary query

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Low** |
| Category | performance |
| Status | suspected |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Slow settlement summary query.

## Location
apps/api/src/settlement/query.ts; missing index transaction_events(transaction_id, event_type)

**Sibling locations checked:** perf doc's '38% higher' summary vs batches explained away by an AI answer — likely a double count, to check.

## Root cause
To verify with EXPLAIN.

## Reproduction / evidence
docs/perf/2026-07-settlement-summary-slow.md

## Impact
Slow page; possibly wrong totals.

## Fix (proposed)
TBD.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
