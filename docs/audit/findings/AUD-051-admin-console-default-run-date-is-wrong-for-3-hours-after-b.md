# AUD-051 — Admin console default run date is the wrong day for 3 hours after Bahrain midnight

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Low** |
| Category | time |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
The settlement page pre-fills the "re-run a daily batch" date with a day that is wrong for a Bahrain browser between 00:00 and 03:00.

## Location
apps/admin/src/pages/settlement/SettlementPage.tsx:19-22 (`yesterdayIso`)

**Sibling locations checked:** same bug class as AUD-025 (Go daemon, fixed), `apps/reporting/src/consumer/applyEvent.ts:170` (AUD-047), `apps/api/src/lib/dateUtil.ts` `todayStamp()` (log only).

## Root cause
`yesterdayIso()` takes the browser-local date, subtracts a day, then formats it with `toISOString()`, which is UTC. At 02:00 in Bahrain on the 30th the local "yesterday" is the 29th at 02:00, i.e. 23:00 UTC on the 28th, so the field shows 2026-10-28 instead of 2026-10-29.

## Reproduction / evidence
Trace of the code (`new Date(); setDate(getDate()-1); toISOString().slice(0,10)`). Not yet run as a test.

## Impact
Only the default value of a manual field changes, but the operator who accepts it re-runs the wrong business day (a no-op because batches are idempotent) and believes yesterday was processed.

## Fix (proposed)
Compute the Bahrain date explicitly (UTC instant + 3 h, like `bahrainDate.ts`), not a browser-local one; add a unit test for 00:00-03:00 Bahrain.

## Re-attack notes
_To be filled after the fix._

## Related
AUD-025, AUD-047
