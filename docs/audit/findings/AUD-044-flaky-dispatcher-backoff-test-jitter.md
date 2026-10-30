# AUD-044 — Flaky dispatcher backoff test (jitter)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Low** |
| Category | test quality |
| Status | **fixed** (merged with PR #27/#28) (test-only change; verified locally; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/05-AUD-044-test.patch (+ docs in stack/16) |

## Summary
Flaky dispatcher backoff test (jitter).

## Location
apps/api/src/webhooks/dispatcher.test.ts:181-196

**Sibling locations checked:** —

## Root cause
Uses real Math.random jitter; expected exact 1000 ms.

## Reproduction / evidence
Baseline 1043 !== 1000.

## Impact
Noise in CI.

## Fix (proposed)
Inject jitter in the test (test fix, justified).

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/05-AUD-044-test.patch`.
**Verdict: HYGIENE (test only), confirmed.** Production `backoffDelayMs(attempt, config, jitter = Math.random)` already
injects jitter and applies ±10 %. The test called `backoffDelayMs(1, config)` with the real `Math.random` and asserted
exactly 1000 ms, so it failed whenever the draw was not 0.5 (baseline on a fresh DB: 1 failure in both `main` runs).

**Change (test only; production untouched, jitter kept).** `webhooks/dispatcher.test.ts`: the exact-value assertions pass a
fixed jitter `() => 0.5`; the observed `next_attempt_at` check (±3 s window) is unchanged. New test `AUD-044: backoff
jitter stays inside ±10 % of the exponential step, and the production default is random` pins the band edges (900/1100 ms
for attempt 1, 4000 ms at mid-band for attempt 3) and checks 200 default draws stay in 1800–2200 ms and are not all equal.
The earlier uncommitted repair (default jitter `() => 0.5`, which made production deterministic) was **not** ported.

**Tests:** dispatcher tests 9/9 on three consecutive runs after the change (the flaky test failed in each `main` baseline run).
**Test changed:** the backoff/exhaustion test's two exact-value lines, as above (assert the defined value, not a random one).

## Re-attack notes
- Production default still `Math.random` (new test fails if jitter is removed: all 200 draws would be equal).
- Retry bounds unchanged (base × 2^(n−1), cap, ±10 %).
- Independent skeptical review: **pending**.

## Related
—
