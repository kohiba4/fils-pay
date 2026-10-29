# AUD-031 — Fee shown to merchant (245 bps) ≠ fee charged (225 bps): display orders by created_at

| Field | Value |
|---|---|
| Owner | A |
| Severity | **Medium** |
| Category | data / display |
| Status | confirmed (seed data) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Fee shown to merchant (245 bps) ≠ fee charged (225 bps): display orders by created_at.

## Location
apps/api/src/fees/currentFeeScheduleDisplay.ts:31-42

**Sibling locations checked:** Capture uses feeSchedule.ts (`effective_from <= now ORDER BY effective_from DESC, created_at DESC`); settlement uses effective_from; settlement/query.ts reads merchants.mdr_bps claiming a '0046 trigger' keeps it in sync (no such trigger).

## Root cause
Display picks the most recently **entered** row (a backfill/future-dated row) instead of the row in force.

## Reproduction / evidence
REPRODUCED from the seed: Alpha Retail has fee_schedules rows (245 bps, effective 2026-03-01, created 2026-08-15 = the backfill) and (225 bps, effective 2026-08-01, created 2026-08-01). `getCurrentFeeScheduleForDisplay` orders by created_at DESC → 245; capture/settlement order by effective_from → 225. Matches the brief exactly. Authoritative: `fee_schedules` resolved by effective_from (fallback merchants.mdr_bps).

## Impact
Merchant sees wrong rate; support confusion. Authoritative table: `fee_schedules` resolved by effective_from (fallback merchants.mdr_bps).

## Fix (proposed)
Reuse the effective-dated query.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-016
