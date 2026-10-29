# AUD-034 — Ledger immutability not enforced

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | data integrity |
| Status | suspected |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Ledger immutability not enforced.

## Location
db/migrations/0007 trigger

**Sibling locations checked:** —

## Root cause
The balance trigger only checks group sums; an UPDATE/DELETE that keeps a group balanced (both legs) passes, contrary to the comment.

## Reproduction / evidence
Trace; repro SQL in Phase 1.

## Impact
History can be silently rewritten.

## Fix (proposed)
Reject UPDATE/DELETE trigger (new migration) — confirm no legitimate writer.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
