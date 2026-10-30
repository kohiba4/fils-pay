# AUD-053 — Webhook deliveries that cannot be attempted stay due forever and starve the dispatcher

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | reliability / availability |
| Status | **fixed** (merged with PR #27/#28) (runtime-verified locally on 55433; review pending) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/11-AUD-053.patch |

## Summary
A delivery row that throws before the HTTP call (for example an endpoint secret that cannot be decrypted) is deliberately left untouched, so it is "due" on every pass forever. Step B reads the 100 oldest due rows; once 100 such rows exist, no later delivery for any merchant is ever attempted.

## Location
apps/api/src/webhooks/dispatcher.ts `attemptDueDeliveries` (`ORDER BY wd.next_attempt_at ASC LIMIT 100`, catch block that leaves the row unchanged); apps/api/src/webhooks/dispatcher.test.ts "per-row isolation" test (leaks one stuck row per run).

## Root cause
The catch block comment says the row "degrades to this one row never progresses rather than webhook delivery silently stops platform-wide", but the query orders by `next_attempt_at` and the stuck rows keep the oldest `next_attempt_at`, so many stuck rows DO stop delivery platform-wide.

## Reproduction
Found while verifying FP-300: after many local test runs the disposable DB held 134 stuck `pending` deliveries (the poison-row test leaves about 4 per run). Result: 6 dispatcher tests failed with "expected 1 delivery, got 0" even though nothing in the code under test had changed. Closing the stuck rows made them pass again.

## Impact
A rotated or mis-set `WEBHOOK_SECRET_ENCRYPTION_KEY` (every existing endpoint becomes undecryptable) or any other persistent per-row failure silently stops all merchants' webhooks (captures, voids, payouts, and refunds) after 100 rows, with only console errors. Merchants stop receiving payout and refund notifications with no retry state to see.

## Fix (proposed)
Count a pre-transport failure as a failed attempt: increment `attempt_count`, set a backoff `next_attempt_at`, and exhaust at `webhookMaxAttempts` like any other failure (store the error in the response excerpt), so stuck rows leave the head of the queue. Make the poison-row test clean up after itself. Track B owns the dispatcher; related to AUD-018/019/020/021 which also edit this file.

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/11-AUD-053.patch`.
**Root cause (confirmed by test).** Step B selects due rows `ORDER BY next_attempt_at LIMIT 100`. A row whose attempt
throws before the transport call (undecryptable secret, a pre-delivery effect that throws) was deliberately left
untouched, so it kept the oldest `next_attempt_at` forever. 100 such rows fill every batch and no other merchant's
webhook is attempted again.

**Change.** `webhooks/dispatcher.ts`: the catch records a failed attempt (`recordUnattemptedFailure`): attempt_count+1,
backoff `next_attempt_at` from the same `backoffDelayMs` (production jitter kept), the error in
`response_body_excerpt` prefixed "not attempted:", no response status; `exhausted` at `webhookMaxAttempts`. The update is
guarded by the attempt_count it read, so it never double-counts. Rows stay visible and replayable; nothing is dropped.

**Tests:** appended to `apps/api/src/webhooks/dispatcher.test.ts`: `AUD-053: a full batch of unsendable rows ahead in the
queue does not starve a later healthy delivery` (105 poisoned rows at the head of the queue; on `main` the healthy row
was not delivered in 3 passes; after: delivered) and `AUD-053: an unsendable row is exhausted at webhookMaxAttempts…`
(failed on `main`, passes). Webhook tests 45/45.
**Test changed (encoded the bug):** the existing "per-row isolation: one poisoned row…" test asserted the poisoned row
stays at attempt 0 with `next_attempt_at` unchanged; corrected (not deleted) to assert one failed attempt, backoff and the
stored error. Its isolation assertions (healthy sibling delivered, pass never throws) are unchanged.

## Re-attack notes
- 105 unsendable rows ahead of a healthy one: healthy delivered within 3 passes.
- Unsendable row: backed off after each pass, exhausted at max attempts with the error kept.
- A transient pre-delivery failure still retries on the normal schedule. A rotated `WEBHOOK_SECRET_ENCRYPTION_KEY` now
  exhausts affected rows after the retry budget instead of stalling everyone; operators must fix the key and replay
  (the excerpt says why).
- The poison-row test no longer leaks permanently-due rows into the shared test DB (the cause of the original repro).
- Independent skeptical review: **pending**.

## Related
AUD-044, AUD-018, FP-300 (refund.succeeded webhook, PR 3)
