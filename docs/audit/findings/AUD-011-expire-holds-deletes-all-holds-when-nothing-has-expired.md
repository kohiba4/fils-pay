# AUD-011 — `expire_holds` deletes ALL holds when nothing has expired

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Critical** |
| Category | data loss |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
`expire_holds` deletes ALL holds when nothing has expired.

## Location
scripts/lib/sqlFilter.ts:8-11, scripts/expire_holds.ts:27-50

**Sibling locations checked:** Any other caller of `buildDelete`/`buildWhere` (only this script today).

## Root cause
`buildWhere` skips an empty array filter, so `buildDelete('holds', { id: [] })` yields `DELETE FROM holds` with no WHERE. Also deletes rather than marks `expired` (handover/0005 say holds are never deleted) and has a SELECT-then-DELETE race.

## Reproduction / evidence
Trace; unit test to add: `buildDelete('holds',{id:[]}).text` must not be an unconditional DELETE.

## Impact
A quiet night wipes every active hold (authorization state).

## Fix (proposed)
Return early when there are no ids, and (per docs) UPDATE status='expired' with the predicate in one statement.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
