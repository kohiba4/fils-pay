# AUD-044 — Flaky dispatcher backoff test (jitter)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Low** |
| Category | test quality |
| Status | suspected |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Flaky dispatcher backoff test (jitter).

## Location
apps/api/src/webhooks/dispatcher.test.ts:181-196

**Sibling locations checked:** —

## Root cause
Uses real Math.random jitter; expected exact 1000 ms.

## Reproduction / evidence
Baseline 1043 !== 1000.

## Impact
Noise in CI.

## Fix (proposed)
Inject jitter in the test (test fix, justified).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
