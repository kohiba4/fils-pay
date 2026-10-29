# AUD-028 — 0072 refund summary view joins `t.id = r.id` (always empty)

| Field | Value |
|---|---|
| Severity | **Medium** |
| Category | reporting |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
0072 refund summary view joins `t.id = r.id` (always empty).

## Location
db/migrations/0072_refund_merchant_summary.sql

**Sibling locations checked:** Comment says refreshed by reporting worker — no refresh code found.

## Root cause
Join should be `t.id = r.transaction_id`; materialized view never refreshed.

## Reproduction / evidence
Trace.

## Impact
Refund reporting shows nothing (FP-300 'shows up in the reports').

## Fix (proposed)
New migration replacing the view (FP-300).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
FP-300
