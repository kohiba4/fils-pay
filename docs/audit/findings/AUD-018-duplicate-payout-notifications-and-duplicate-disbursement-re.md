# AUD-018 — Duplicate payout notifications and duplicate disbursement records (incident 2026-08-21)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | race / idempotency |
| Status | **partly fixed**: duplicate `settlement.paid` events fixed (branch `fix/AUD-018-paid-notification-unique`, pending merge); duplicate disbursement records (dispatcher, Track B) still open |
| Fix commit | Track A half: see `git log fix/AUD-018-paid-notification-unique` |

## Summary
Duplicate payout notifications and duplicate disbursement records (incident 2026-08-21).

## Location
apps/settlement/internal/settlement/payout_notify.go:29-100, apps/api/src/webhooks/dispatcher.ts:36-41 + payoutDisbursement.ts, db/migrations/0057

**Sibling locations checked:** Daemon and `run-batch` CLI both call `EnqueuePayoutNotifications`; postmortem FP-208 advisory lock — not in code.

## Root cause
Check-then-insert (`NOT EXISTS` then INSERT) with no lock or unique index on outbox (event_type, aggregate_id) → two processes both insert. Disbursement rows are written as a webhook pre-delivery effect per delivery row (per endpoint, again on replays) with no unique on batch.

## Reproduction / evidence
Trace; incident review: two deliveries had different outbox event ids.

**Phase 1 runtime check:** TestRepro_AUD018_ConcurrentPayoutNotificationsEnqueueOnce: 8 overlapping scans over 40 paid batches → 35–37 batches got duplicate settlement.paid events (≈220 extras), 3 runs. `outbox_events` has no unique index on (event_type, aggregate_id) despite the code comment saying so. A single-batch version of the test passed, so the race needs overlap but is easily hit.

## Impact
Merchants told twice; two disbursement instructions per batch (possible double payout on the rail).

## Fix
**Track A half (done):**
- Migration **0075**: partial unique index `uq_outbox_settlement_paid_per_batch ON outbox_events (aggregate_id) WHERE event_type = 'settlement.paid' AND id > <max id at migration time>`. It covers only events created after the migration on purpose: historical duplicates exist (2,163 batches in the disposable DB from the repro runs; real ones in production are referenced by `webhook_deliveries`), a plain unique index could not be built there, and rewriting history was rejected.
- `payout_notify.go`: the insert is now the claim (`ON CONFLICT DO NOTHING`, count taken from `RowsAffected`), so the daemon and `run-batch` (or two overlapping ticks) can no longer both enqueue. The false comments ("outbox has a unique index", "daemon and CLI never overlap", "FP-260 resolved") are replaced.
- Tests (written first): `TestSettlementPaidEventIsUniquePerBatch` (second insert must raise 23505; failed with `err = <nil>`), `TestOtherOutboxEventsMayRepeatForAnAggregate` (guard: uniqueness is scoped to `settlement.paid`), and the Phase-1 repro `TestRepro_AUD018_ConcurrentPayoutNotificationsEnqueueOnce` (8 scanners x 40 batches: used to duplicate 35-37 batches, now 0; stable over 5 runs). No existing test changed.

**Track B half (still open): duplicate disbursement records.** `apps/api/src/webhooks/dispatcher.ts` runs the `settlement.paid` pre-delivery effect `recordPayoutDisbursementEffect` for every first delivery attempt of every delivery row (one per endpoint, and again for every replay), inserting a new `settlement_payout_disbursements` row with a fresh reference each time. Fix (Track B, migration 0080+): unique `settlement_batch_id` (one disbursement per batch) with `ON CONFLICT DO NOTHING`, and ideally move the effect out of the webhook path. Tracked in `docs/audit/tracker/track-b.md`.

## Re-attack notes
- Only one producer of `settlement.paid` exists (`payout_notify.go`); the dispatcher only consumes it.
- The incident write-up in `docs/ADMIN.md` blamed "the reporting worker restarted and replayed NOTIFYs"; the evidence it cites (two deliveries with different outbox event ids) points at two inserts, which is what the race produced. The documented root cause was wrong.
- Deploy: migration 0075 is safe on a populated database (no table rewrite beyond the index build, no history changes). Duplicates created before it remain; merchants were already asked to dedupe on `Webhook-Delivery-Id`.
- Not covered: the notification scan still only sees batches with `net_payout_fils > 0` and reads `LIMIT 500` at a time (unchanged).

## Related
AUD-040
