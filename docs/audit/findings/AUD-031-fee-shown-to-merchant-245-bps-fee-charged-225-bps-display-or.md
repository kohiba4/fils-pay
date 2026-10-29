# AUD-031 — Admin merchant page shows 245 bps while payments are charged 225 bps: display orders by created_at

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | data / display |
| Status | **fixed** (merged into main) |
| Fix commit | see `git log fix/AUD-031-fee-display-effective-from` |

## Summary
Fee shown to merchant (245 bps) ≠ fee charged (225 bps): display orders by created_at.

## Location
apps/api/src/fees/currentFeeScheduleDisplay.ts:31-42

**Sibling locations checked:** Capture uses feeSchedule.ts (`effective_from <= now ORDER BY effective_from DESC, created_at DESC`); settlement uses effective_from; settlement/query.ts reads merchants.mdr_bps claiming a '0046 trigger' keeps it in sync (no such trigger).

## Root cause
Display picks the most recently **entered** row (a backfill/future-dated row) instead of the row in force.

## Reproduction / evidence
REPRODUCED from the seed: Alpha Retail has fee_schedules rows (245 bps, effective 2026-03-01, created 2026-08-15 = the backfill) and (225 bps, effective 2026-08-01, created 2026-08-01). `getCurrentFeeScheduleForDisplay` orders by created_at DESC → 245; capture/settlement order by effective_from → 225. Matches the brief exactly. Authoritative: `fee_schedules` resolved by effective_from (fallback merchants.mdr_bps).

**Phase 1 runtime check:** currentFeeScheduleDisplay.repro.test.ts: capture charges 225, display shows 245. The existing test at currentFeeScheduleDisplay.test.ts:72-82 ENCODES the bug ('backfilled row wins') and must be changed in the fix commit.

## Impact
The ADMIN merchant page (the only consumer: `apps/api/src/admin/merchants.ts` -> `MerchantDetailPage.tsx`) showed support a rate that was never billed, which is what the finance email reports as "the dashboard shows 245". No merchant-facing screen or API route exposes a fee rate (reviewer grep of apps/web and apps/api/src/routes). Authoritative table: `fee_schedules` resolved by effective_from (fallback merchants.mdr_bps).

## Fix (applied)
- `getCurrentFeeScheduleForDisplay` now uses the same rule as capture and settlement: `WHERE effective_from <= now() ORDER BY effective_from DESC, created_at DESC LIMIT 1`. A future-dated schedule is not shown until it takes effect; none in force returns null. The justification comments ("asked Claude, created_at is right", "display only, nobody bills off this") were removed: the second is exactly why support saw a rate that was never charged.
- Tests (written first; 4 failed on the old code): corrected `a backfilled older period never displaces the rate in force`, new `a future-dated schedule is not shown as current...`, `only future-dated schedules on file...`, a same-day tie-break test (already passed, kept as a guard), and the Phase-1 repro renamed to `currentFeeScheduleDisplay.parity.test.ts` (display must equal what `getEffectiveMdrBps` bills).
- **Test changed (justified):** `returns the most recently entered schedule even when an older period was backfilled later` asserted 245 bps / effective 2026-03-01 / created 2026-08-15 (a comment on it said "it asserts the backfilled row wins"). It now asserts the row actually in force: 225 bps / 2026-08-01 / 2026-08-01. No assertion was removed.

## Re-attack notes
- Full API suite: only the 12 known baseline failures (11 refund tests, 1 flaky jitter test).
- "225" is the schedule rate; the fee actually charged also subtracts the volume-tier bonus (capture) and, at settlement, applies the negotiated discount (AUD-016/AUD-017), so 225 is the right comparison for the DISPLAYED schedule, not the final fee.
- The admin merchant page shows TWO rates side by side: `merchants.mdr_bps` (the default/fallback rate) and `currentFeeSchedule` (now the rate in force). They legitimately differ when a schedule exists; the label should keep saying which is which.
- Siblings checked: capture (`fees/feeSchedule.ts`) and Go (`fee_schedule.go`) already order by `effective_from`; dead `v1/` code ignored. Two siblings that still use the fallback `merchants.mdr_bps` and ignore the schedule are recorded separately: manual credits' MDR reversal (**AUD-050**) and the reconciliation's pending-fee estimate (`settlement/query.ts:312-327`, whose comment cites a "0046 trigger" that does not exist; part of AUD-016).

## Related
AUD-016
