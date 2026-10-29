# AUD-004 — Concurrent refunds both succeed (no lock across acquirer call; stale `refunded_fils`) — FP-209

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **Critical** |
| Category | race / money |
| Status | latent (helper only; FP-300 wires it) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Concurrent refunds both succeed (no lock across acquirer call; stale `refunded_fils`) — FP-209.

## Location
apps/api/src/payments/processRefund.ts:58-150 (validate txn), :152-205 (journal)

**Sibling locations checked:** capture.ts holds `SELECT … FOR UPDATE` through the acquirer call (correct — why "normal payments don't have this problem"); idempotency keys don't help (two different keys); no DB constraint `refunded_fils <= captured_fils` (0043 leaves it to the app).

## Root cause
Validation reads the transaction without `FOR UPDATE` and commits; the acquirer call runs with no lock; the journal transaction writes `refunded_fils = prepared.refundedFils + amount` from the **stale** read. Two requests both pass validation, both call the acquirer, last write wins on `refunded_fils`.

## Reproduction / evidence
Trace. Repro planned: two parallel refunds of the full amount → expect one 200 + one 409/422; current code gives two 200s and `refunded_fils` = one amount.

## Impact
Double money out to the cardholder, ledger shows both reversals but `refunded_fils` undercounts so further refunds remain possible.

## Fix (proposed)
In FP-300: lock the row (`FOR UPDATE`) in the journal transaction and re-validate against fresh values, increment atomically (`refunded_fils = refunded_fils + $n`), plus a DB CHECK/trigger backstop `refunded_fils <= captured_fils` via new migration.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-003, AUD-005
