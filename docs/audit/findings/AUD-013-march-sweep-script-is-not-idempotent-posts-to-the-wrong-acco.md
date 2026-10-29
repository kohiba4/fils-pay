# AUD-013 — March sweep script is not idempotent, posts to the wrong accounts, wrong window

| Field | Value |
|---|---|
| Severity | **High** |
| Category | ops script / money |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
March sweep script is not idempotent, posts to the wrong accounts, wrong window.

## Location
scripts/reconcile_march.ts

**Sibling locations checked:** RUNBOOK says copy it monthly and that a rerun is a no-op (false); meeting 2026-07-08 "dry run" — script has no dry-run, so that run posted again.

## Root cause
Random `entry_group_id`, no existing-posting check, no dry-run flag; residue computed from `transactions.captured_fils` (running total) not per scheme line; debits `merchant_payable` (takes money from the merchant) instead of ADR-0002's clearing/residue legs; UTC month (ADR-0003) not Bahrain.

## Reproduction / evidence
Trace; brief: ran twice on staging and the gap doubled.

## Impact
Each run doubles the correction; merchant payables reduced by residue they never owed. Not safe to rerun.

## Fix (proposed)
Not to be run. If kept: dry-run default, deterministic idempotency (unique description/key), correct legs, Bahrain window. Ask before investing.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-010, ADR-0003
