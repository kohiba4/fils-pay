# AUD-026 — Migrations 0054/0055 fail on a fresh database (and occupy numbers reserved for v2)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | schema / deploy |
| Status | **fixed** (merged into main) |
| Fix commit | `b6ff417` |

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

## Fix (applied, commit b6ff417; decision Q1)
- `0054_views.sql`: removed the unused `v_unbatched_capture_events` view (referenced the non-existent `settlement_batch_events`); kept `merchant_payable_position` and `v_active_api_keys`.
- `0055_chart_of_accounts_suspense.sql`: now a documented no-op (the accounts it tried to add are used by no code, and `kind = 'suspense'` violates the CHECK from 0007).
- Test added: `scripts/migrate_fresh.test.ts` (creates a temp DB, migrates, checks all 66 files recorded + the view, reruns). Failed before the fix with `relation "settlement_batch_events" does not exist`; passes after.
- Tests changed: none.

## Re-attack notes
- Existing database that already recorded 0054/0055 (my disposable DB): `npm run migrate` → 0 applied, 66 up to date. The runner skips by filename and stores no checksum (the "checksum" comment in migrate.ts is false), so edited files cannot break or re-run on those databases.
- Fresh database: migrate applies all 66; `npm run seed` then passes all 5 self-checks, so the schema is complete enough for the app.
- Residual risk: if production ran a *different* 0054 (HANDOVER says a branch version may have created `chargeback_cases` on staging-2, unverifiable), its schema may differ from a fresh one. Compare `\d` of prod against a fresh migrate before the first deploy.
- Full TS suite: no new failures (only the 5 intentional repro tests for AUD-012/031 fail, as expected).

## Related
AUD-015
