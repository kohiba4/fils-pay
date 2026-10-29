# AUD-014 — Recalculate MDR rewrites closed AND paid batches, at the wrong rate

| Field | Value |
|---|---|
| Severity | **High** |
| Category | money / history mutation |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Recalculate MDR rewrites closed AND paid batches, at the wrong rate.

## Location
apps/settlement/internal/settlement/recalculate_mdr.go:66-127

**Sibling locations checked:** CloseBatch resolves fee_schedules per event + tier bonus; recalc uses `merchants.mdr_bps` only.

## Root cause
Selects `status <> 'open'` (i.e. closed and paid) and `UPDATE settlement_batches SET fee_fils, net_payout_fils` on them; ignores effective-dated schedules and the tier bonus; adjustment legs are posted against the old batch id.

## Reproduction / evidence
Trace. Slack 2026-09-11: 9 Delta Marketplace batches adjusted incl. paid ones.

## Impact
Paid batches no longer match the bank instruction/statement; fee history wrong; settlement team's claim "only open batches" is false (it never touches open ones).

## Fix (proposed)
Never mutate paid batches: restrict to `closed` or post adjustment only (decision needed — Phase 2 question).

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-016, AUD-015
