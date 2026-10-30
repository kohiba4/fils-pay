# AUD-006 — Payment link charged twice: stale reservation re-claimed while first capture is in flight (incident 2026-05-14)

| Field | Value |
|---|---|
| Owner | B |
| Severity | **Critical** |
| Category | race / money |
| Status | **fixed** (merged with PR #27/#28) (runtime-verified locally on 55433; independently reviewed 2026-10-30: confirmed) |
| Fix commit | uncommitted on local branch fix/AUD-046-024-merchant-write-authority (stack); patch stack/06-AUD-006-007.patch |

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

## Fix (applied, Track B, 2026-10-30)
Discovered in the Phase 0 team audit unless stated; repaired here. Base `main` af8e9c9, uncommitted working tree in `~/Desktop/hakathons/fils-pay-hackathon`; patch `~/Desktop/hakathons/track-b-patches/stack/06-AUD-006-007.patch`.
**Root cause (confirmed by test).** The claim re-took any reservation older than the timeout (60 s) without asking whether
the previous payer's transaction was still being captured, nothing tied a transaction to its link, and finalize answered
200 even when it recorded nothing. A slow first attempt (3DS step-up) therefore let a second card be authorized and
captured on the same single-use link.

**Change (prevention only; no refund path, `REFUNDS_ENABLED` untouched):**
- Migration **`0080_transactions_payment_link_id.sql`**: nullable `transactions.payment_link_id` (FK) and partial unique
  index `uq_transactions_one_live_per_payment_link` (one non-voided transaction per link). Existing rows stay NULL, so
  it cannot fail on existing data; nothing is deleted.
- `payments/authorize.ts` (shared payments code, additive): optional `paymentLinkId` written on insert.
- `payments/void.ts` (additive type change): a `system` actor may void (the DB CHECK already allowed it).
- `paymentLinks/pay.ts`: a stale reservation is taken over only when the link has no live transaction; otherwise the
  live transaction decides (row locked by an in-flight capture → 409 `payment_link_processing`; already captured →
  link marked paid, 409 `payment_link_already_paid`; abandoned authorization → voided, then claimed). A unique
  violation at authorize → 409. A failed capture voids its own authorization before releasing the link. Finalize no
  longer answers 200 unless the link is recorded as paid by this transaction.
- Not ported from the earlier repair: compensation by refund (uses Track A's disabled refund feature) and the
  re-assert/heartbeat of `reserved_at`. `capture.ts` untouched.

**Tests:** `apps/api/src/paymentLinks/payConcurrency.test.ts` (new, 5 tests, real Postgres, gated acquirer, no sleeps,
reservation timeout 0 to force the stale case). All 5 failed on `main` (two charges in both race tests; abandoned
authorization left live; second charge after an unfinalized capture; declined capture left a live authorization) and
pass after. All payment-link tests 25/25. Migration applied on both an upgraded DB and fresh DBs (suite runs).
**Tests changed:** none.

## Re-attack notes
- Slow capture + second payer: second gets 409, never authorizes; one captured transaction; link paid with it.
- Slow authorize + second payer: one wins, the other gets 409 from the unique index; one captured transaction.
- Crash before capture: next payer voids the abandoned authorization and pays once.
- Crash after capture: next payer gets 409 already paid; the link records the earlier capture; no new authorization.
- Declined capture: own authorization voided, link active again, next payer succeeds.
- **Limits:** not exactly-once at the acquirer. A request that loses at the database after its acquirer authorization
  leaves an uncaptured hold on that card until the acquirer releases it (no charge). A merchant cancel that lands while a
  capture is running leaves a captured transaction on a canceled link; the request now returns 409 `needsReview` and
  logs it instead of claiming success. Historical double charges (incident 2026-05-14) are not linkable by this column.
- Coordination: `authorize.ts` and `void.ts` are shared payments files (additive changes); tell @kohiba4.
- Independent skeptical review (2026-10-30, `docs/audit/reviews/2026-10-30-track-b-batch.md`): **CONFIRMED** — regression test fails with the fix reverted, passes with it (all 5 concurrency tests fail on main: second payer 200 instead of 409). No double-capture path and no credit for an uncaptured payment found. **Open, non-blocking (review):** (1) `releaseReservation` (`pay.ts` `WHERE id = $1 AND status = 'reserved'`) is not owner-checked, so a losing request can reopen the link while the winner's capture is in flight; the next payer then reaches the acquirer before the unique index refuses (authorization hold on that card, 409); (2) a same-Idempotency-Key retry after a crash before capture now gets 409 `not_capturable` (recovery voided its own auth); main captured once; API clients only; (3) a capture 502 (outcome unknown) voids the auth and reopens the link (main also reopened); (4) the unique-index race loser's acquirer authorization is not logged. Untested: the `needsReview` 409 path; transactions authorized by pre-0080 code during a deploy have a NULL link id.

## Related
AUD-007, postmortem-2026-05
