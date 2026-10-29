# AUD-032 — Test merchants pushed into real settlement by an admin tool

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | data integrity |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Test merchants pushed into real settlement by an admin tool.

## Location
apps/api/src/admin/merchantFlags.ts:4-21 via routes/adminMerchantsRecompute.ts

**Sibling locations checked:** CloseBatch/RunDailyBatch correctly exclude test_mode; authorize doesn't block test merchants (by design).

## Root cause
'Recompute transaction statuses' clears `test_mode` whenever the merchant has no open authorizations.

## Reproduction / evidence
Trace; Slack 2026-09-19 'testModeCleared: true' for Gamma.

## Impact
Sandbox captures settle and pay out as real money. Chat claim TRUE.

## Fix (proposed)
Remove the side effect (a status recompute must not change merchant mode).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
