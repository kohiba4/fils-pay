# AUD-039 — Second-approver check on credits compares display names

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | authz |
| Status | suspected |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Second-approver check on credits compares display names.

## Location
apps/api/src/admin/creditApproval.ts:11

**Sibling locations checked:** 0060 note.

## Root cause
Identity compared by mutable display name instead of admin id.

## Reproduction / evidence
Trace; exploitability depends on how display names are set — Phase 1.

## Impact
Self-approval or false rejection of large credits.

## Fix (proposed)
Compare admin user ids.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
