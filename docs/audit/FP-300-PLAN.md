# FP-300 plan — refunds, start to end (the "missing feature")

Evidence the missing feature is refunds: `POST /v1/refunds` answers 501 with a stub "until refunds land (FP-212)";
the helper modules (`processRefund`, `refundValidation`, `refundState`, `initiateMerchantRefund`), tables (0042 `refunds`,
0043 `transactions.refunded_fils`, 0044 event types, 0070-0072), the web `RefundDrawer` (commented out) and 11 failing
refund tests all exist; the brief says "touches everything" and lists: through the API, right to the fils in the ledger,
fees and payouts, the shop gets the right webhook, timeline + reports + reconciliation, live on Dilmune.
Every helper was written before the capture discount and volume tier existed (note by YA), so none of it is trusted.

## Existing facts that shape the design (verified in code)
- `refunds.settlement_batch_id` and a partial index "unbatched refunds per merchant" (0042) already exist: the intended
  design is that a refund is picked up by a later batch close. Nothing does it today.
- `CloseBatch` (Go) only selects `captured`/`partially_captured` events; net = gross - fee. A refund therefore never
  reaches a payout, the cached balance (`merchant_balances`) or the scheme/payout reports today.
- Ledger: capture credits `merchant_payable` (gross) and `platform_fee_revenue` (fee); a refund must reverse in the same
  accounts (`processRefund` already posts these legs; they are untested against a real capture with discount/tier).
- Fee already charged is read from the ledger (`platform_fee_revenue` credits for the transaction). This is better than
  `merchants.mdr_bps`, but it is only right while nothing else credits that account for the transaction (MDR recalculation
  adjustments are posted with `transaction_id` NULL, so they are not seen) and it inherits AUD-016 (pay-link captures skip
  the discount): the batch fee and the reversal come from different formulas until AUD-016 is fixed, so reconciliation
  can show a small residual until then. PR 2 should be sequenced after AUD-016 if the Track B dependency allows.
- Capture takes `SELECT ... FOR UPDATE` on the transaction and **holds it across the awaited acquirer call**
  (`capture.ts`, ruled-out R-04); `processRefund` takes no lock (two transactions around the call): AUD-004.
- The earlier team plan (eng-sync 2026-06-02) was "subtract refunds in the report, leave the batch alone until cutover".
  This plan supersedes it because the brief requires the payout itself to be right ("fees and payouts come out right"),
  and a report-only subtraction would pay a merchant for sales that were refunded.
- `nextStatusAfterRefund` deliberately keeps `partially_captured` after a full refund of a partial capture (finance rule,
  "headroom stays open"), while the timeline event type becomes `refunded` once refunded >= captured. Both stay as they are
  (documented, tested); the refundable amount is bounded by captured - refunded so the open headroom cannot be refunded.

## Work breakdown (one PR each, in this order)
| PR | Scope | Findings | Owner |
|---|---|---|---|
| 1 | Route `POST /v1/refunds` wired (the stub's path; API.md documents it; the drawer is the one that is wrong): merchant-scoped lookup (404 for foreign), writer role gate (Q4), required `Idempotency-Key` header, `merchants.refunds_enabled` hold kept (session and API key), `reason` default, ceiling = captured - refunded, **row lock held across the acquirer call like capture** (single transaction, serialises refund vs capture/void), fee reversal (below), migration for CHECK `refunded_fils <= captured_fils`, the 501 test updated, the 11 failing tests fixed | AUD-003, 004, 005, 027, 029 | A (route is Track B's file, taken because the teammate has not started; tagged on issue #15) |
| 2 | Settlement: closing a batch subtracts unbatched refunds (below), `RecalculateMDR` keeps the refund terms and filters events by type, reconciliation (pending refunds exact), `SettlementBatchDto` / admin batch listing / `settlement.batch_closed` payload get additive refund fields, batch invariant comments updated | new finding AUD-053 (refunds never reach a payout) | A |
| 3 | `refund.succeeded` webhook envelope + dispatcher eligibility, reporting consumer + daily refund summary, replace the 0072 view, `refundedFils` in the transaction DTO, timeline | AUD-028, 030 | A (dispatcher file is shared with Track B's AUD-018/019/020/021: small additive change) |
| 4 | Web: wire `RefundDrawer` to `/v1/refunds`, stable idempotency key per attempt, integer fils parsing, role gate, refetch; API.md / ARCHITECTURE / ADMIN docs | brief: "through the API", dashboard | A |
| 5 | Dilmune Cloud deployment | AUD-035 | waits for the user's instructions (Q10) |

**Ordering rule:** refunds must not go live anywhere (including Dilmune) before PR 2 is deployed, otherwise cardholders are
refunded and the merchant is still paid in full.

## Design decisions
- **Concurrency (was Q14, now decided).** Follow capture: one transaction, `SELECT ... FOR UPDATE` on the transaction row,
  validation against the locked values, the acquirer call, then the journal in the same transaction. No `pending` rows
  (they would need a status migration, an expiry for crashed reservations and an exclusion in every reader). A refund
  waits behind an in-flight capture of the same transaction and sees its final `captured_fils`.
- **Fee reversal.** Keep the finance-approved per-refund proportional rule (`calculateRefundFee`, banker's rounding;
  meeting 2026-07-08) and add the missing guarantee on top: `reversal = min(calculateRefundFee(...), feeCharged - alreadyReversed)`,
  and the refund that brings the refunded total up to the captured amount reverses exactly the remainder. The sum can
  therefore never exceed the fee charged (AUD-029) and never needs a negative reversal even when later partial captures
  change the proportions. `alreadyReversed` = sum of `refunds.fee_reversed_fils` for the transaction (status succeeded).
- **Settlement (Q13, still needs finance).** `settlement_batches` gets `refund_fils` and `refund_fee_reversed_fils`
  (`NOT NULL DEFAULT 0`, history unchanged). `gross_fils` and the scheme export stay captures-only; `net_payout_fils = gross -
  fee - refund_fils + refund_fee_reversed_fils`. Pickup rule: refunds with `status = 'succeeded'`, `settlement_batch_id IS NULL`,
  `occurred_at < windowEnd` (no lower bound, so nothing is stranded), for the merchants the daily run already handles
  (active, not test mode); a suspended or test-mode merchant's refunds wait until a batch is closed for it, a test-mode
  merchant is never settled (same as its captures). Each picked-up refund is stamped with the batch id. Finance must
  confirm that the scheme file carries captures only and refunds go through the acquirer refund call (unverified).
  **Negative net:** the batch records the negative net honestly (`net_payout_fils < 0`, no payout leg, status paid with nothing
  paid out, cached balance goes negative so the debt is visible). Default: no automatic netting against later batches (that
  needs a finance policy: cap a later payout at the cached balance, or collect), plus an admin-visible "merchants with a
  negative balance" list. This is the open decision; it must be made before go-live.
- **RecalculateMDR.** New net = gross - new fee - refund_fils + refund_fee_reversed_fils; the fee recomputation selects
  `captured`/`partially_captured` events explicitly. Recalculation does NOT re-derive the fee reversals of refunds (they are
  frozen at what was actually charged and reversed); a recalculated capture batch can therefore leave a small, explainable
  difference in the later refund batch. Stated in the finding; finance to confirm.
- **Reconciliation.** Pending includes unbatched succeeded refunds, computed exactly from the `refunds` table in the window by
  `occurred_at` (no float); the comment claiming this already exists is corrected. A refund picked up by a later batch
  is attributed by its own `occurred_at`, not by `batch_date`.
- **Split payouts.** `PayoutSplitBatch` shares the (possibly refund-reduced) net by weight, so the refund burden is
  shared by weight, not by the child that earned the sale. Left as is, flagged to finance.
- **Q15 (view).** Replace the unrefreshed materialized view 0072 with a plain view and the correct join.
- Migration numbers: Track A is extended to 0090-0099 for FP-300 (0073-0079 are used up).

## Definition of done (from the brief) and where it is proven
- API end to end: integration test from capture to refund to replay (idempotent) to over-refund rejection to foreign
  merchant (404) to support role (403) to refunds_enabled hold (403).
- Concurrency: two simultaneous refunds, refund vs second capture, refund vs void.
- Ledger to the fils: balanced groups, fee revenue never negative per transaction, sum of refunds <= captured, property
  test for the fee reversal over random partial sequences.
- Fees and payouts: batch close with and without refunds, refund after the capture batch was paid, negative net, recalculation
  keeps refunds, split merchant, suspended merchant.
- Webhook: signed `refund.succeeded` envelope delivered once to the merchant's endpoint.
- Timeline, reports, reconciliation: event in the timeline, daily summary, reconciliation explains to zero with refunds.
- Live on Dilmune Cloud: pending instructions.
