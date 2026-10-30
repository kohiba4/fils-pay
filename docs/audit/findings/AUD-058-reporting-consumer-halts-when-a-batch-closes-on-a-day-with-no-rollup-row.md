# AUD-058 — Reporting consumer halts when a batch closes on a day with no rollup row

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Medium** |
| Category | reliability / reporting |
| Status | **fixed** (merged with PR #27/#28) (runtime-verified locally on 55433; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (after 1b2ea38) |

## Summary
New, found 2026-10-30 while testing FP-300 reporting. `applyBatchClosed`'s "rollup parity check" threw a TypeError when
`merchant_daily_volume` had no row for the batch's merchant and day.

## Location
apps/reporting/src/consumer/applyEvent.ts (`applyBatchClosed`, parity check after the payout-trend upsert).

## Root cause
The check counts real capture events for the batch day and, if any exist, reads the rollup row and compares counts. It
cast `rows[0]` and dereferenced `captured_count` without handling "no row". A missing row is the largest possible lag,
which the check is documented to *warn* about.

## Reproduction / evidence
`apps/reporting/src/consumer/batchClosedParity.test.ts`: a merchant with one capture event on 2026-04-10 and no rollup row,
then a `settlement.batch_closed` event for that day. On the code before the fix: `Cannot read properties of undefined
(reading 'captured_count')`. Also seen in the shared test DB: Go settlement tests insert capture events directly (no
outbox event), and the next reporting pass failed the same way.

## Impact
`runConsumerPass` applies a batch atomically and rolls back on any error, so the failing event is retried forever and
**no reporting event for any merchant is applied after it** (dashboards and analytics stop updating). Reachable whenever
captures exist without a consumed outbox event for that day: the seed, scripts, data repairs, or a rollup truncated by an
interrupted rebuild. Medium: availability of reporting, not money.

## Fix (applied, Track B, 2026-10-30)
Treat a missing row as 0 and warn (`rollup=0 ground_truth=N`); the payout-trend row is still written. Test passes (1/1);
reporting suite results in the Track B handoff.

## Re-attack notes
- Missing row: warning, pass continues. Existing lag (row with fewer captures): unchanged warning path.
- Other appliers do not read rows they might not have written (checked: captured/voided/refund upsert).
- Independent skeptical review: **pending**.

## Related
AUD-041, AUD-047, FP-300
