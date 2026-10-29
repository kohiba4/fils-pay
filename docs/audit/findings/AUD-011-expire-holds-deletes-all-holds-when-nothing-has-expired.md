# AUD-011 — `expire_holds` deletes ALL holds when nothing has expired

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Critical** |
| Category | data loss |
| Status | **fixed** (branch `fix/AUD-011-expire-holds`, pending merge) |
| Fix commit | see `git log fix/AUD-011-expire-holds` |

## Summary
`expire_holds` deletes ALL holds when nothing has expired.

## Location
scripts/lib/sqlFilter.ts:8-11, scripts/expire_holds.ts:27-50

**Sibling locations checked:** Any other caller of `buildDelete`/`buildWhere` (only this script today).

## Root cause
`buildWhere` skips an empty array filter, so `buildDelete('holds', { id: [] })` yields `DELETE FROM holds` with no WHERE. Also deletes rather than marks `expired` (handover/0005 say holds are never deleted) and has a SELECT-then-DELETE race.

## Reproduction / evidence
Trace; unit test to add: `buildDelete('holds',{id:[]}).text` must not be an unconditional DELETE.

**Phase 1 runtime check:** scripts/expire_holds.repro.test.ts: `buildExpiredHoldsDelete([]).text` = "DELETE FROM holds" (no WHERE). Existing tests only cover non-empty id lists.

## Impact
A quiet night wipes every active hold (authorization state).

## Fix (applied)
- `scripts/expire_holds.ts`: one atomic `UPDATE holds SET status='expired' WHERE status='active' AND expires_at < now()`. No id list (the empty-list bug cannot occur) and no SELECT-then-write race. **Behaviour change (flag for the user):** it now marks holds `expired` instead of deleting them. Evidence: HANDOVER ("Holds are never deleted"), the comment in `authorize.ts` ("it never deletes, so the hold history stays") and the schema's `expired` status all say so; only a comment in migration 0005 ("FP-219 … now deletes", unverifiable, no such ticket in history) claims otherwise. Nothing reads or references hold rows, so marking is the zero-data-loss option.
- `scripts/lib/sqlFilter.ts`: `buildDelete` throws instead of building an unfiltered DELETE (root cause: `buildWhere` silently skips empty-array filters).
- Tests: new `scripts/expire_holds.integration.test.ts` runs the REAL script against a throwaway database (fails before: all holds deleted, `actual: 0`; passes after).
- **Tests changed (justified):** `scripts/expire_holds.test.ts` asserted the exact text `DELETE FROM holds WHERE id = ANY($1::uuid[])` for the delete-by-id behaviour; replaced with assertions on the new UPDATE and on the `buildDelete` guard. `scripts/expire_holds.repro.test.ts` (my Phase-1 repro of the removed function) deleted, superseded by the integration test. No test was skipped or weakened.

## Re-attack notes
- The bug bites in normal operation, not only on quiet nights: first run expires one hold, the next night's run (nothing expired) deleted ALL remaining holds. The integration test runs the script twice.
- Other callers of `buildDelete`/`buildWhere`: none. Readers/FKs of `holds`: none besides capture/void releasing active holds, so 'expired' rows are inert.
- Migration 0005's comment ("deletes expired rows") is now wrong; migrations are not edited after the fact (comment only, no behaviour). 
- Not covered: nothing schedules this script in the repo (cron lives outside); holds already deleted in prod cannot be recovered from the repo — check backups if the script ever ran on a quiet night.

## Related
—
