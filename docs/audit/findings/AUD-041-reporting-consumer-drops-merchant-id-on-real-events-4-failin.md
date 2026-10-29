# AUD-041 — Reporting consumer drops merchant_id on real events (4 failing tests)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | reporting |
| Status | suspected (runtime failure, cause not yet traced) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Reporting consumer drops merchant_id on real events (4 failing tests).

## Location
apps/reporting/src/consumer/applyEvent.ts:22-31

**Sibling locations checked:** enqueueEvent JSON.stringify → jsonb; FH's 'double-encoded payload' note.

## Root cause
To trace in Phase 1.

## Reproduction / evidence
Baseline: `null value in column "merchant_id" of relation "merchant_daily_volume"`.

## Impact
Dashboards/rollups stop; FP-300 reports.

## Fix (proposed)
TBD.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
