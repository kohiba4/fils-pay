# AUD-026 — Migrations 0054/0055 fail on a fresh database (and occupy numbers reserved for v2)

| Field | Value |
|---|---|
| Severity | **High** |
| Category | schema / deploy |
| Status | confirmed (runtime) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Migrations 0054/0055 fail on a fresh database (and occupy numbers reserved for v2).

## Location
db/migrations/0054_views.sql (references missing `settlement_batch_events`), 0055 (columns code/account_type/description don't exist)

**Sibling locations checked:** 0056 (`revoke_after`) applies but nothing reads it; ADR-0005 reserves 0054–0056; HANDOVER says they never ran anywhere.

## Root cause
Abandoned v2 PR files committed to main.

## Reproduction / evidence
`npm run migrate` on empty Postgres: `failed applying 0054_views.sql: relation "settlement_batch_events" does not exist`. Everything ≥0054 never applies.

## Impact
Cannot deploy to a fresh environment (blocks Dilmune Cloud); prod schema state unknown.

## Fix (proposed)
Needs your decision (editing a never-applied migration vs new superseding migration). See PLAN.md Q1.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-015
