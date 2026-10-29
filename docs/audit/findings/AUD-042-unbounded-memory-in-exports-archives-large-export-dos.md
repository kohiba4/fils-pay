# AUD-042 — Unbounded memory in exports/archives (large export DoS)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | DoS |
| Status | suspected |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Unbounded memory in exports/archives (large export DoS).

## Location
apps/api/src/transactions/exportCsv.ts, webhooks/archiveReplay.ts, 0068

**Sibling locations checked:** CHANGELOG says export streams; AGENTS.md says it buffers deliberately.

## Root cause
To verify in Phase 1.

## Reproduction / evidence
—

## Impact
OOM on 512 MB container.

## Fix (proposed)
TBD.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
—
