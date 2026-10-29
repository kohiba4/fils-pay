# AUD-051 — Admin console default run date is the wrong day for 3 hours after Bahrain midnight

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Low** |
| Category | time |
| Status | **fixed** (branch `fix/AUD-051-admin-default-date`) |
| Fix commit | see `git log fix/AUD-051-admin-default-date` |

## Summary
The settlement page pre-fills the "re-run a daily batch" date with a day that is wrong for a Bahrain browser between 00:00 and 03:00.

## Location
apps/admin/src/pages/settlement/SettlementPage.tsx:19-22 (`yesterdayIso`)

**Sibling locations checked:** same bug class as AUD-025 (Go daemon, fixed), `apps/reporting/src/consumer/applyEvent.ts:170` (AUD-047), `apps/api/src/lib/dateUtil.ts` `todayStamp()` (log only).

## Root cause
`yesterdayIso()` moves the current instant back exactly 24 h (`setDate(getDate()-1)`) and then reads its **UTC** date with `toISOString()`. The result is therefore the UTC yesterday in every browser timezone, whatever the "browser-local" comment says. Bahrain's date is ahead of UTC from 21:00 to 24:00 UTC (00:00-03:00 Bahrain), so at 02:00 Bahrain on the 30th (23:00 UTC on the 29th) the field shows 2026-10-28 instead of 2026-10-29.

## Reproduction / evidence
Trace of the code (`new Date(); setDate(getDate()-1); toISOString().slice(0,10)`). Reproduced by `apps/admin/src/lib/bahrainDate.test.ts`: at 23:00 UTC on the 29th (02:00 Bahrain on the 30th) the old logic gives 2026-10-28 (same result in any browser timezone), the correct default is 2026-10-29.

## Impact
Only the default value of a manual field changes, but the operator who accepts it re-runs the wrong business day (a no-op because batches are idempotent) and believes yesterday was processed.

## Fix
`bahrainYesterday()` in `apps/admin/src/lib/bahrainDate.ts` computes the previous Asia/Bahrain day from the UTC instant + 3 h (same technique as `apps/reporting/src/bahrainDate.ts`), independent of the browser timezone. `SettlementPage` uses it. The admin package had no test runner: added the same `tsx --test` script as `apps/web` (no new dependency) and `node` to its tsconfig `types` so the test typechecks. Tests: `apps/admin/src/lib/bahrainDate.test.ts` (3 tests: 02:00 Bahrain, either side of midnight, month and year boundaries).

Tests changed: none (new tests only).

## Re-attack notes
Browser timezone no longer matters. The old code gave the same wrong answer in every timezone (the independent review ran it under Bahrain, UTC, New York and Kiritimati). No other `yesterdayIso`/`toISOString` use of a local date in apps/admin or apps/web (grep). AUD-047 (reporting `applyEvent.ts:170`) is the same bug class and stays with Track B.

## Related
AUD-025, AUD-047
