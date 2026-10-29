# Independent review: AUD-034 ledger append-only (2026-10-29)

Reviewer: skeptical-reviewer charter (general-purpose subagent; extract, a scratch database with all 69 migrations applied in order, a throwaway Go probe; dropped afterwards). Output is data; re-verified.
**Result: no blocking objections to the migration or tests.** No legitimate UPDATE/DELETE writer exists (Go, TS, SQL, scripts, seed; all four FKs on `ledger_entries` are NO ACTION, so no cascade delete can reach the trigger);
the BEFORE row trigger raises before the deferred 0007 balance trigger can run and does not change it (`ON CONFLICT DO UPDATE` is also rejected); the migration applies from empty and is skipped by the runner on re-run;
the delete and update tests fail without the migration (reasoned) and pass with it; TRUNCATE (seed) still works.

| Point | Disposition |
|---|---|
| **BLOCKING:** `PHASE1-TRACK-A.md:47` says the trigger is migration 0075 (it is 0076); INDEX/REPORT/TRIAGE/CLAIMS/INVARIANTS still said unfixed or "suspected" | **Verified and fixed**: PHASE1, TRIAGE, CLAIMS (R28), INVARIANTS (I15) corrected in this PR. INDEX and REPORT rows are regenerated in the post-merge docs commit (they are the files that conflict between branches) |
| **BLOCKING:** "Go suite only AUD-048's repro" is not reliably true (AUD-018's concurrency repro also failed in the reviewer's full run) | **Fixed wording**: true once the branch includes the AUD-018 fix (now merged; this branch has main merged in); before that, AUD-018's repro could also fail |
| `session_replication_role = replica` bypass not listed | **Added** to the finding and the migration header (the migration is unmerged, so its comment is editable) |
| Stale comment `recalculate_mdr_test.go:96` repeating the false "0007 trigger also rejects UPDATE/DELETE" | **Fixed** |
| Clumsy wording ("outside tests-free code"), vague fix commit | **Fixed** wording; commit reference stays `git log <branch>` until merged |
| Suggest a REVOKE migration/runbook step for TRUNCATE; the shadow-ledger runbook already revokes DML | Noted in the finding as the ops complement (all services share one superuser role today, AUD-035) |
| Not verified by the reviewer: seed self-checks, API baseline | Run by the auditor: seed passed twice on a fresh 69-migration DB; API suite at the 12 known baseline failures |
