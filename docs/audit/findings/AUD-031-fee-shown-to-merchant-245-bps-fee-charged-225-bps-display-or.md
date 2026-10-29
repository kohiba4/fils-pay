# AUD-031 — Fee shown to merchant (245 bps) ≠ fee charged (225 bps): display orders by created_at

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | data / display |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Fee shown to merchant (245 bps) ≠ fee charged (225 bps): display orders by created_at.

## Location
apps/api/src/fees/currentFeeScheduleDisplay.ts:31-42

**Sibling locations checked:** Capture uses feeSchedule.ts (`effective_from <= now ORDER BY effective_from DESC, created_at DESC`); settlement uses effective_from; settlement/query.ts reads merchants.mdr_bps claiming a '0046 trigger' keeps it in sync (no such trigger).

## Root cause
Display picks the most recently **entered** row (a backfill/future-dated row) instead of the row in force.

## Reproduction / evidence
Trace; exact seed rows to reproduce in Phase 1.

## Impact
Merchant sees wrong rate; support confusion. Authoritative table: `fee_schedules` resolved by effective_from (fallback merchants.mdr_bps).

## Fix (proposed)
Reuse the effective-dated query.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-016
