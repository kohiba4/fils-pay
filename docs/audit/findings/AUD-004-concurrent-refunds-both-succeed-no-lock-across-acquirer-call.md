# AUD-004 — Concurrent refunds both succeed (no lock across acquirer call; stale `refunded_fils`) — FP-209

| Field | Value |
|---|---|
| Owner | FP-300 (shared) |
| Severity | **Critical** |
| Category | race / money |
| Status | **fixed** (branch `feat/FP-300-refund-core`) |
| Fix commit | see `git log feat/FP-300-refund-core` |

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

## Fix
`processRefund` is now one transaction that takes `SELECT ... FOR UPDATE` on the transaction row before validating and holds it across the acquirer call to COMMIT, exactly like capture (R-04). The second of two simultaneous refunds waits, then validates against the first one's final `refunded_fils`. The update is `refunded_fils = refunded_fils + $n` (an increment, not a write of a stale total). Migration 0090 adds the backstop `CHECK (refunded_fils <= captured_fils)`.

Tests: `processRefund.test.ts` "AUD-004: two simultaneous refunds cannot both succeed past the captured amount" (6000 + 6000 on 10000 with a slow acquirer: exactly one 200 and one 422, refunded 6000). Tests changed: none.

## Re-attack notes
A refund also serialises against capture and void of the same transaction (same row lock). Known limit shared with capture: a database connection is held during the acquirer call. A crash after the acquirer approved but before COMMIT leaves a refund at the acquirer with no record; the retry (same idempotency key) reuses the acquirer idempotency key `claimId:attempt`, the same behaviour capture has.

## Related
AUD-003, AUD-005
