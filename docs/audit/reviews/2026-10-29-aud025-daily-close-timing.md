# Independent review: AUD-025 daily close timing (2026-10-29)

Reviewer: skeptical-reviewer charter (general-purpose subagent; `git archive` extract). Output is data; re-verified.
**Result: no correctness blockers.** `dueBusinessDate` uses the hardcoded Bahrain zone (host TZ irrelevant: re-run under UTC,
America/Los_Angeles and Pacific/Kiritimati); boundaries 21:14:59Z not due, 21:15:00Z due; a `now` in another location gives the same result;
`business_date` written is the same calendar date for the old UTC-midnight style and the new Bahrain-midnight value; the table test fails on
the old logic (00:05 already "due", 00:20 and 01:00 closing the 28th); only AUD-018/048 repros failed in the Go suite.

| Point | Disposition |
|---|---|
| Stale 2-line comment glued above `dueBusinessDate`; spliced sentence in `window.go` ("It returns i.e. Asia/Bahrain") | **Verified and fixed** |
| "Other UTC date uses: none left" overstated: `SettlementPage.tsx yesterdayIso`, `applyEvent.ts:170`, `dateUtil.todayStamp`, `capture.ts:20` | **Verified and fixed**: finding corrected; new Low finding AUD-051 for the admin default date; the others point to AUD-047 / cosmetic |
| Delay config not validated (1440+ never closes a day; negative fires early) | **Fixed**: validated to 0-1439 with a test |
| No delay-0 test | **Added** |
| Operational effects of closing ~2.75 h earlier unverified (acquirer, holds, scheme cut, downstream jobs) | Acknowledged; stated as a deploy note in the finding |
