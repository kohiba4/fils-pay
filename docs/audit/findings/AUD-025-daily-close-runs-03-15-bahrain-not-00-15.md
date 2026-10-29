# AUD-025 — Daily close runs ~03:15 Bahrain, not 00:15

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | time |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Daily close runs ~03:15 Bahrain, not 00:15.

## Location
apps/settlement/internal/scheduler/daemon.go:79-86, settlement/window.go:46-52

**Sibling locations checked:** `BusinessDayWindow` itself is right for a date; reporting/analytics use own Bahrain helpers (to check).

## Root cause
`now := time.Now().UTC()` → `BusinessDayWindow(now)` takes the **UTC** calendar date, so 'today' only advances at 00:00 UTC = 03:00 Bahrain.

## Reproduction / evidence
Trace; ops log note '~03:15 local'. Chat claim TRUE.

## Impact
Payouts and batch_closed 3 h late vs docs/merchant promise; window contents themselves correct.

## Fix (proposed)
Convert now to Asia/Bahrain before taking the date.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
