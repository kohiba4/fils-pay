# Independent review: AUD-013 March sweep + AUD-052 test isolation (2026-10-29)

Reviewer: skeptical-reviewer charter (general-purpose subagent; extracts, scratch databases). Output is data; re-verified.
**Result: no blocking objections to the code of either branch.** AUD-013: dry run does no BEGIN or writes, exits 0; the lock is taken before every check and insert (READ COMMITTED sees the first run's commit); a failure mid-loop rolls everything back; the test's migrations cover what the script needs; no other caller of the posting code. AUD-052: root cause plausible from the code (tier turns on at 2e9, `CloseBatch` reads the counter), the reset masks no product bug and defeats no test that relies on the counter (platform_volume_test, the AUD-017 repro and the TS tier test set it themselves); Go suite passed except AUD-048's repro.

| Point | Disposition |
|---|---|
| AUD-013 finding missed stronger evidence: `docs/meetings/2026-07-08-finance-eng.md:17` "FH re-ran the script as a dry run: 13 lines, 70 fils"; the old script had no dry run, so it most likely applied a second time (environment not stated) | **Verified and added** to the finding; wording about the log fixed (`scripts/out/` is not in the repo) |
| SQL for finance counted legs, not runs (`count(*)`) | **Fixed**: `count(DISTINCT entry_group_id)` |
| Skip is per merchant only: a changed amount or an earlier different sweep is skipped silently; residue rows read before the lock can be stale | **Fixed**: prints what was swept earlier and a WARNING when it differs; rows re-read inside the lock; documented as idempotent but not self-correcting; test added |
| Idempotency key is the exact description string | **Fixed**: code comment "NEVER change this string" + finding |
| Unknown flags (`--aply`) silently dry-run | **Fixed**: exits non-zero; test added |
| "Was NOT safe, reproduced" overstated as production proof | **Reworded** (mechanism proven on scratch DB; production unknown) |
| The simultaneous-run test is probabilistic (fails 1 of 2 trials with the lock removed) | Acknowledged in the finding |
| AUD-052: counter is left non-zero at the end of a run (~1.2e9), which could in principle influence a later TS test | **Fixed in the AUD-052 branch**: `mustPool` also resets the counter in `t.Cleanup` |
| AUD-052: the 235-vs-250 numbers not reproduced by the reviewer on main | Reproduced by the auditor (counter set to 2.5e9: 235 vs 250, 112 vs 119, 190 vs 202) |
