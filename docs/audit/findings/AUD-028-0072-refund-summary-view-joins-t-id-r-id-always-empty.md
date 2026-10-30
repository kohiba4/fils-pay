# AUD-028 — 0072 refund summary view joins `t.id = r.id` (always empty)

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **Medium** |
| Category | reporting |
| Status | fix ready, not merged (migration 0083; no reader yet; review pending) |
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

## FP-300 PR 3 addendum (Track B, 2026-10-30; for @kohiba4)
Migration `0083_refund_reporting.sql` (committed by the user in 1b2ea38) drops and recreates `refund_merchant_summary`
joining `t.id = r.transaction_id`, and counts each refunded transaction's `captured_fils` once per day (the old view
summed it once per refund). Nothing in `apps/` or `scripts/` reads the view, so the visible refund reporting path is
`merchant_daily_volume.refund_count / refund_gross_fils` (also added in 0083) via the reporting consumer and admin rebuild.
Not separately tested beyond a successful fresh migrate; add a view test when something reads it.
