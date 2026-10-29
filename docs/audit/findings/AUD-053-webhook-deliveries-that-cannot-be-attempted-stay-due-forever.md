# AUD-053 — Webhook deliveries that cannot be attempted stay due forever and starve the dispatcher

| Field | Value |
|---|---|
| Owner | B |
| Severity | **High** |
| Category | reliability / availability |
| Status | confirmed (runtime) |
| Fix commit | — |

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

## Re-attack notes
_To be filled after the fix._

## Related
AUD-044, AUD-018, FP-300 (refund.succeeded webhook, PR 3)
