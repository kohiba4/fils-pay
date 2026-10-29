# AUD-034 — Ledger immutability not enforced

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | data integrity |
| Status | **fixed** (merged into main; TRUNCATE and the application role's privileges still need an ops change) |
| Fix commit | see `git log fix/AUD-034-ledger-append-only` |

## Summary
Ledger immutability not enforced.

## Location
db/migrations/0007 trigger

**Sibling locations checked:** —

## Root cause
The balance trigger only checks group sums; an UPDATE/DELETE that keeps a group balanced (both legs) passes, contrary to the comment.

## Reproduction / evidence
Trace; repro SQL in Phase 1.

**Phase 1 runtime check:** On a scratch copy: BEGIN; DELETE both legs of a balanced capture group; COMMIT → succeeded (4 legs before, 0 after). The deferred balance trigger only checks sums, so whole groups can be deleted.

## Impact
History can be silently rewritten.

## Fix (applied)
- Migration **0076**: `BEFORE UPDATE OR DELETE` row trigger `ledger_entries_append_only` that raises `integrity_constraint_violation`. Corrections are new balanced groups (already how every writer works), so no application path is affected: a grep of all application code, scripts, seed and migrations finds no `UPDATE` or `DELETE` on `ledger_entries` (the reviewer confirmed this; all four foreign keys touching the table are NO ACTION, so deleting a merchant fails on the FK before any cascade); the only reset path is the dev seed's `TRUNCATE ... CASCADE`, which does not fire row triggers.
- The deferred balance trigger from 0007 is unchanged (still rejects unbalanced inserts).
- Tests (written first; the two mutation tests failed because the whole-group DELETE and the balanced UPDATE committed): `TestLedgerEntriesCannotBeDeleted`, `TestLedgerEntriesCannotBeUpdated`, guard `TestLedgerStillAcceptsBalancedInsertsAndRejectsUnbalanced`. No existing test changed.

## Re-attack notes
- Seed on a fresh database (69 migrations) passes its self-checks twice; full API suite unchanged at the 12 known baseline failures (11 refund tests + 1 flaky jitter test); the Go suite fails only on AUD-048's intentional repro once the branch includes the AUD-018 fix (before that merged, AUD-018's concurrency repro could also fail in a full run).
- **Bypasses (verified by the reviewer):** `ALTER TABLE ... DISABLE TRIGGER`, `SET session_replication_role = replica` (a `DELETE` then succeeds silently) and `TRUNCATE`, available to the table owner/superuser (in the compose stack the single application role is both). The trigger stops application bugs and honest mistakes, not a privileged database user.
- **Not blocked, by design:** `TRUNCATE` (the dev seed needs it). In production the application role should also have `UPDATE`, `DELETE` and `TRUNCATE` revoked on `ledger_entries` (ops; all services currently share one database role, see AUD-035), and a table owner can still `DISABLE TRIGGER`. The trigger stops application bugs and honest mistakes, not a database superuser.
- A one-off ledger repair (for example the finance corrections discussed in AUD-012/AUD-013) must now be written as new groups, or done under an explicit, reviewed `DISABLE TRIGGER` window.
- The false comment in migration 0007 is left in place (applied migration), and the same false claim in `recalculate_mdr_test.go` was corrected; this finding and the new migration's header supersede it.
- Production note: `docs/runbooks/shadow-ledger-cutover.md` already plans a `REVOKE ... ON ledger_entries FROM filspay_api`; doing the same for UPDATE/DELETE/TRUNCATE on the current role is the ops complement to this migration.

## Related
—
