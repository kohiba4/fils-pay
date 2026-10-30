# AUD-018 — Duplicate payout notifications and duplicate disbursement records (incident 2026-08-21)

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | race / idempotency |
| Status | **partly fixed**: duplicate `settlement.paid` events fixed (merged into main); duplicate disbursement records (dispatcher, Track B) still open |
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
- Migration **0075**: partial unique index `uq_outbox_settlement_paid_per_batch ON outbox_events (aggregate_id) WHERE event_type = 'settlement.paid' AND id > <max id at migration time>`. It covers only events created after the migration on purpose: historical duplicates exist (2,163 batches in the disposable DB, created by my own repro runs; real ones in production would be referenced by `webhook_deliveries`, but the production count is unknown), a plain unique index could not be built there, and rewriting history was rejected.
- `payout_notify.go`: the insert is now the claim (`ON CONFLICT DO NOTHING`, count taken from `RowsAffected`), so the daemon and `run-batch` (or two overlapping ticks) can no longer both enqueue. The false comments ("outbox has a unique index", "daemon and CLI never overlap" in `payout_notify.go`, and "resolved, see FP-260" in `scheduler/daemon.go`) are replaced, plus a stray question about the dispatcher (it does deliver `settlement.paid`).
- Tests (written first): `TestSettlementPaidEventIsUniquePerBatch` (second insert must raise 23505; failed with `err = <nil>`), `TestOtherOutboxEventsMayRepeatForAnAggregate` (guard: uniqueness is scoped to `settlement.paid`), and the Phase-1 repro `TestRepro_AUD018_ConcurrentPayoutNotificationsEnqueueOnce` (8 scanners x 40 batches: used to duplicate 35-37 batches, now 0; stable over 5 runs). No existing test changed.

**Track B half (still open): duplicate disbursement records.** `apps/api/src/webhooks/dispatcher.ts` runs the `settlement.paid` pre-delivery effect `recordPayoutDisbursementEffect` for every first delivery attempt of every delivery row (one per endpoint, and again for every replay), inserting a new `settlement_payout_disbursements` row with a fresh reference each time. Fix (Track B, migration 0080+): unique `settlement_batch_id` (one disbursement per batch) with `ON CONFLICT DO NOTHING`, and ideally move the effect out of the webhook path. Tracked in `docs/audit/tracker/track-b.md`.

## Re-attack notes
- Only one producer of `settlement.paid` exists (`payout_notify.go`); the dispatcher only consumes it.
- The incident write-up in `docs/ADMIN.md` blamed "the reporting worker restarted and replayed NOTIFYs". Its own evidence (two deliveries with different outbox event ids) points at two INSERTs, which is what this race produces; the reproduction shows the race is real and easy to hit, but it does not prove it is what happened on 2026-08-21 (no production data). An audit note was added next to the incident table.
- Deploy: migration 0075 is safe on a populated database (no table rewrite beyond the index build, no history changes). Duplicates created before it remain; merchants were already asked to dedupe on `Webhook-Delivery-Id`.
- Limits (from the independent review): the migration is not re-runnable by hand (the runner skips it; a second manual run fails with 42P07); `id > N` is sound while ids come from the sequence (a restore that lowers the sequence fails loudly on the primary key; only gaps left by deleted rows could be silently unenforced); the bare `ON CONFLICT DO NOTHING` would also swallow any other unique violation on `outbox_events`, which is low risk because the primary key comes from a sequence; the index build briefly blocks writes to `outbox_events`; a nullable `dedupe_key` column would be an alternative design. The comment in migration 0030 ("the api is the only writer to outbox_events") is false (settlement writes there too).
- Not covered: the notification scan still only sees batches with `net_payout_fils > 0` and reads `LIMIT 500` at a time (unchanged).

## Related
AUD-040

## Track B addendum (2026-10-30, uncommitted; for @kohiba4 to review)
**Part 1 — duplicates.** Migration `0082_settlement_payout_disbursements_one_per_batch.sql`: `duplicate_of_disbursement_id`;
existing duplicates are marked (later rows point at the earliest for the same batch), nothing deleted; partial unique index
`uq_settlement_payout_disbursements_batch (settlement_batch_id) WHERE duplicate_of_disbursement_id IS NULL` (name proposed by
Track B, please confirm). `apps/api/src/webhooks/payoutDisbursement.ts` inserts `ON CONFLICT … DO NOTHING`.
Tests (`apps/api/src/webhooks/payoutDisbursement.test.ts`): 8 sequential + concurrent calls → 1 row; one `settlement.paid` to two
endpoints, then a replay → 1 row. Upgrade check: 7 of 12 planted rows marked, none deleted.

**Part 2 — merchants without a webhook endpoint got no disbursement.** The record was written only as a side effect of the
first attempt of each `settlement.paid` delivery row, and delivery rows exist only per active endpoint. Now the record is
written **inside the payout transaction** — `apps/settlement/internal/settlement/batch.go PayoutBatch` and
`apps/settlement/internal/splits/allocate.go PayoutSplitBatch` — right after the `status = 'paid'` update, only when
`net_payout_fils > 0`, `ON CONFLICT … DO NOTHING`. This matches 0057's stated design ("written inside PayoutBatch's
transaction, one row per paid batch"), makes the record atomic with the payout (no crash window), and independent of
endpoint count, delivery success and replay. The dispatcher effect is kept as an idempotent backstop for batches paid
before this change. Go tests (written first, all failed on `main` with 0 rows): `TestPayoutBatch_RecordsOneDisbursementWithoutAnyWebhookEndpoint`
(incl. re-pay), `TestPayoutBatch_ConcurrentPayoutsRecordOneDisbursement` (5 goroutines), `TestPayoutBatch_ZeroNetRecordsNoDisbursement`,
`TestPayoutBatch_UnpaidBatchHasNoDisbursement`, `TestPayoutSplitBatch_RecordsOneDisbursement` (two 50 % children, paid twice).
**Not done (needs a finance decision):** backfilling disbursement rows for batches already paid without one; nothing in the
repo reads this table, so whoever pays from it must decide whether a backfill would pay twice.
