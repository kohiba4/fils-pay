# AUD-045 — Seed prints raw API keys; 'production' seed dump committed

| Field | Value |
|---|---|
| Severity | **Low** |
| Category | secrets hygiene |
| Status | confirmed (runtime + read) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Seed prints raw API keys; 'production' seed dump committed.

## Location
db/seed/generate.ts, db/seed/fixtures/production_seed.sql (50k lines, unreferenced)

**Sibling locations checked:** —

## Root cause
Logging of secrets; unused data dump labelled production-equivalent.

## Reproduction / evidence
Seed output.

## Impact
Key leakage into logs; possible real data in repo.

## Fix (proposed)
Report only; ask before removing data.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
suspicious/S-08
