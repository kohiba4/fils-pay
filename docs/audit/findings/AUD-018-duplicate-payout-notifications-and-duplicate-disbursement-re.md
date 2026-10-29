# AUD-018 — Duplicate payout notifications and duplicate disbursement records (incident 2026-08-21)

| Field | Value |
|---|---|
| Severity | **High** |
| Category | race / idempotency |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Duplicate payout notifications and duplicate disbursement records (incident 2026-08-21).

## Location
apps/settlement/internal/settlement/payout_notify.go:29-100, apps/api/src/webhooks/dispatcher.ts:36-41 + payoutDisbursement.ts, db/migrations/0057

**Sibling locations checked:** Daemon and `run-batch` CLI both call `EnqueuePayoutNotifications`; postmortem FP-208 advisory lock — not in code.

## Root cause
Check-then-insert (`NOT EXISTS` then INSERT) with no lock or unique index on outbox (event_type, aggregate_id) → two processes both insert. Disbursement rows are written as a webhook pre-delivery effect per delivery row (per endpoint, again on replays) with no unique on batch.

## Reproduction / evidence
Trace; incident review: two deliveries had different outbox event ids.

## Impact
Merchants told twice; two disbursement instructions per batch (possible double payout on the rail).

## Fix (proposed)
Atomic claim: unique partial index on outbox_events(aggregate_id) where event_type='settlement.paid' + ON CONFLICT DO NOTHING; disbursement unique on settlement_batch_id, written once, not from the webhook path.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-040
