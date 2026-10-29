# AUD-033 — Lifetime payout estimate is float32/REAL (drifts)

| Field | Value |
|---|---|
| Severity | **Low** |
| Category | float |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Lifetime payout estimate is float32/REAL (drifts).

## Location
apps/settlement/internal/settlement/payout_estimate.go, db/migrations/0040

**Sibling locations checked:** EstimateMonthlyPayout float32 too.

## Root cause
float32 accumulator stops adding small payouts once the total is large.

## Reproduction / evidence
Trace. Chat claim TRUE; monitoring-only (no payout path reads it — to confirm).

## Impact
Ops dashboard wrong for high-volume merchants.

## Fix (proposed)
BIGINT fils column (new migration) or drop.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-008
