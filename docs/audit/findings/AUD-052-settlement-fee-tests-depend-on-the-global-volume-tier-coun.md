# AUD-052 — Settlement fee tests depend on the global volume-tier counter (intermittent failures)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Low** |
| Category | test quality |
| Status | **fixed** (branch `fix/AUD-052-test-isolation-volume-counter`, pending merge) |
| Fix commit | see `git log fix/AUD-052-test-isolation-volume-counter` |

## Summary
Three Go tests that assert exact fees (`TestCloseBatch_FeePerEventThenSummed`, `TestCloseBatch_EligibleEventSelection`, `TestRunBatch_ValidTokenAndDate`) failed intermittently on a shared database.

## Location
apps/settlement/internal/settlement/batch_test.go (`mustPool`), apps/settlement/internal/internalapi/server_test.go (`mustPool`); the dependency is `platform_stats.total_processed_fils` read by `CloseBatch` (`VolumeTierMdrBonusBps`).

**Sibling locations checked:** the ledger and splits packages do not close batches; the TS suites do not read the counter except `platformVolumeTier.test.ts`, which sets it explicitly.

## Root cause
Every `CloseBatch` adds the batch gross to one shared counter and the platform-wide tier discount (15 bps) switches on at 2,000,000,000 fils. The tests assume the tier is off but never reset the counter, so after enough runs (about 1.2 billion fils accumulated per full run) a run starts above the threshold and the fees come out 15 bps lower (235 vs 250, 112 vs 119, 190 vs 202). Which run failed depended on how the counter happened to be left by the previous run.

## Reproduction / evidence
Set the counter to 2,500,000,000 and run those three tests on `main`: all three fail with exactly the numbers above. With the fix, the same scenario passes.

## Impact
Flaky tests that hid real regressions behind "just rerun it", and cost me an investigation during AUD-034. Not a product bug, but a useful product observation: capture (API) and close (Go) read the same counter at different moments, so when the tier switches on between a capture and its batch close, the ledger fee and the batch fee differ (see AUD-016, AUD-017).

## Fix
`mustPool` in both test packages zeroes the counter before each DB test. Verified: the failing scenario now passes, and three consecutive full serial Go runs fail only on AUD-048's intentional repro and leave the counter at 0. No assertion was changed. (Parallel packages still share one database; run `go test -p 1 ./...`.)

## Re-attack notes
- The tier behaviour itself is covered by `platform_volume_test.go`, which sets the counter explicitly (including the above-2^31 case from AUD-017).
- A stronger design would give tests their own database; out of scope.

## Related
AUD-016, AUD-017, AUD-044
