# AUD-025 — Daily close runs ~03:15 Bahrain, not 00:15

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | time |
| Status | **fixed** (branch `fix/AUD-025-close-at-bahrain-midnight`, pending merge) |
| Fix commit | see `git log fix/AUD-025-close-at-bahrain-midnight` |

## Summary
Daily close runs ~03:15 Bahrain, not 00:15.

## Location
apps/settlement/internal/scheduler/daemon.go:79-86, settlement/window.go:46-52

**Sibling locations checked:** `BusinessDayWindow` itself is right for a date; reporting/analytics use own Bahrain helpers (to check).

## Root cause
`now := time.Now().UTC()` → `BusinessDayWindow(now)` takes the **UTC** calendar date, so 'today' only advances at 00:00 UTC = 03:00 Bahrain.

## Reproduction / evidence
Trace; ops log note '~03:15 local'. Chat claim TRUE.

**Phase 1 runtime check:** Worked example (trace, not yet a test; needs a clock seam): at 2026-10-29T22:00Z (= 01:00 Bahrain on 30 Oct) `runIfDue` takes the UTC date 10-29 as 'today', so it closes 10-28 and the 10-29 business day (ended 21:00Z) is not closed until 2026-10-30T00:15Z = 03:15 Bahrain, matching the ops log note.

## Impact
Payouts and batch_closed 3 h late vs docs/merchant promise; window contents themselves correct.

## Fix (applied)
- `settlement/window.go`: new `BusinessDateOf(t)` returns the Asia/Bahrain calendar date containing any instant; `BusinessDayWindow`'s doc now says its argument must be a calendar date, not a raw UTC instant.
- `scheduler/daemon.go`: the decision moved into a pure, clock-injectable `dueBusinessDate(now, delayMinutes)`: "today" is the Bahrain date, due once `delay` minutes have passed since Bahrain midnight, closing yesterday (Bahrain). `runIfDue` calls it. The misleading comments ("MK: UTC here is fine", "am: ... ~03:15 local whatever") are replaced by an accurate explanation.
- Tests (written first; compile-red because the function did not exist; the old logic was also run through the same instants as a scratch test): `TestDueBusinessDate`, 9 cases: 23:59 Bahrain, 00:05 (grace period), exactly 00:15, 00:20, 01:00, 03:00, month, year and leap-day boundaries. Old logic on the same instants: 00:05 Bahrain was already "due" (ignoring the grace period); 00:20 and 01:00 re-ran 10-28 (a no-op) instead of 10-29; the right day was only closed at 00:00 UTC = 03:00 Bahrain. No existing test changed.

## Re-attack notes
- Other uses of a UTC "now" as a business date in Go: none left (`time.Parse` of explicit dates in the CLI and internal API is fine; `CloseBatch` only reads Y/M/D of the date it is given).
- Behavioural consequence to expect after deploy: the first close after the fix runs at 00:15 Bahrain instead of ~03:00, so `settlement.batch_closed` / `settlement.paid` events, payout postings and notifications move about 2.75 hours earlier. Captures timestamped inside the 15-minute grace period after midnight belong to the next day (unchanged rule). Re-running a day is idempotent, so the first tick after the deploy is harmless.
- The daemon still catches up only yesterday after an outage (documented; use `run-batch --date`).
- Reporting and the API already bucket by Bahrain date (`bahrainDate.ts`, `AT TIME ZONE 'Asia/Bahrain'`); `capture.ts` `recordCaptureMetric` uses a UTC date but has no callers (noted in AUD-047).

## Related
—
