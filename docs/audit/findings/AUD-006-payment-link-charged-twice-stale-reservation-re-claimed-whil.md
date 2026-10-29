# AUD-006 — Payment link charged twice: stale reservation re-claimed while first capture is in flight (incident 2026-05-14)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Critical** |
| Category | race / money |
| Status | confirmed (trace) |
| Fix commit | — (not fixed; Phase 2) |

## Summary
Payment link charged twice: stale reservation re-claimed while first capture is in flight (incident 2026-05-14).

## Location
apps/api/src/paymentLinks/pay.ts:67-78 (claim), :135-160 (finalize returns 200 on 0 rows); config.ts `PAYMENT_LINK_RESERVATION_TIMEOUT_SECONDS=60`

**Sibling locations checked:** 0020 CHECK only ties `paid` ⇔ `transaction_id`, doesn't stop two transactions; postmortem action FP-202 ("unique constraint, Done") does not exist — there is no `transactions.payment_link_id` column at all.

## Root cause
The claim treats a reservation older than 60 s as abandoned. A capture that takes > 60 s (acquirer 3DS step-up) is still running; a second buyer re-claims, authorizes, captures and finalizes. The first request's finalize then matches 0 rows and **returns 200 anyway** ("should be unreachable"). Both cards charged. Postmortem blamed duplicate callbacks; callbacks never touch links (they only insert notes).

## Reproduction / evidence
Trace + incident data: every double had a first attempt > 60 s and 16/17 txns had exactly one callback note (postmortem appendix). FH's comment at pay.ts:150 describes exactly this.

## Impact
Customer charged twice; extras settled and paid out (postmortem: BD 1,284.500 credited).

## Fix (proposed)
Make finalize ownership-safe and never answer success for a lost race: the claimer records its own `reserved_at` token; finalize/re-claim key on it; if finalize matches 0 rows, void/refund the capture and return 409. Exact minimal design to agree in Phase 2.

## Re-attack notes
_To be filled after the fix (bypass via other route / tenant / retry / concurrency)._

## Related
AUD-007, postmortem-2026-05
