# AUD-037 — 'Adjust balance' writes the cache only; docs disagree

| Field | Value |
|---|---|
| Severity | **Low** |
| Category | data integrity / docs |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
'Adjust balance' writes the cache only; docs disagree.

## Location
apps/api/src/admin/balanceAdjustments.ts; ADR-0006 vs ADMIN.md

**Sibling locations checked:** Journaled variant exists, not exposed.

## Root cause
By ADR-0006 design; ADMIN.md says it is journaled.

## Reproduction / evidence
Read.

## Impact
Hides AUD-015; corrections vanish on rebuild.

## Fix (proposed)
Doc/design decision — out of scope unless you want it.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-015
