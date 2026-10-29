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
- Fee already charged is read from the ledger (`platform_fee_revenue` credits for the transaction). This is the right
  source (not `merchants.mdr_bps`), but it inherits AUD-016 (pay-link captures skip the discount) until that is fixed.

## Work breakdown (one PR each, in this order)
| PR | Scope | Findings | Owner |
|---|---|---|---|
| 1 | Route `POST /v1/refunds` wired: merchant-scoped lookup (404 for foreign), writer role gate, required `Idempotency-Key` header (the stub's drafted handler used a random key per request = no idempotency), `reason` default, ceiling = captured - refunded, concurrency-safe (reservation or lock), cumulative fee reversal, migration for CHECK `refunded_fils <= captured_fils`, fix the 11 failing tests | AUD-003, 004, 005, 027, 029 | shared (route is Track B's file, taken by A because the teammate has not started; tagged) |
| 2 | Settlement: closing a batch subtracts the merchant's unbatched refunds (net = gross - fee - refunds + fee reversed), marks `refunds.settlement_batch_id`, carry-forward if the net would go negative, payout/balance cache, MDR recalculation, batch payload, reconciliation query | new finding AUD-053 (refunds never reach a payout) | A |
| 3 | `refund.succeeded` webhook envelope + dispatcher eligibility, reporting consumer + daily refund summary, fix 0072 view, `refundedFils` in the transaction DTO, timeline | AUD-028, 030 | A (dispatcher file is shared with Track B's AUD-018/019/020/021: small, additive change) |
| 4 | Web: wire `RefundDrawer` to `/v1/refunds` with a stable idempotency key per attempt, integer fils parsing, role gate, refetch; API.md / ARCHITECTURE / ADMIN docs | brief: "through the API", dashboard | A |
| 5 | Dilmune Cloud deployment | AUD-035 | waits for the user's instructions (Q10) |

## Decisions needed (proposed defaults; finance/user to confirm, none blocks PR 1)
- **Q13 — how a refund reaches a payout.** Proposed: batch gets two new columns (`refund_fils`, `refund_fee_reversed_fils`);
  `gross_fils` and the scheme export stay captures-only (they must keep matching the scheme file), and
  `net_payout_fils = gross - fee - refund_fils + refund_fee_reversed_fils`. Refunds are picked up by the first batch closed
  after they are made. **If that would make a batch's net negative**, the refunds that do not fit stay unbatched and carry
  forward to the next batch (a payout is never negative, the merchant is never paid money they owe back). Alternative:
  allow negative nets and collect from the merchant (needs a collections process the system does not have).
- **Q14 — concurrency design.** Proposed: a `pending` refund row reserves the amount (counted in the ceiling) before the
  acquirer call, finalized to `succeeded`/`failed` after it. Alternative: hold a row lock across the acquirer call
  (simpler, but a DB connection is held during an external call). Decided during PR 1 after reading how capture locks (R-04).
- **Q15 — refund summary view.** 0072 is a materialized view nobody refreshes and with a wrong join. Proposed: replace it
  by a plain view with the correct join.
- Fee reversal on a refund: proportional and cumulative, `reversal(total) = round(fee * refundedTotal / captured)`;
  each refund reverses the difference to what was already reversed, so the sum never exceeds the fee (AUD-029). Rounding
  rule: same as the platform's (half-up on integers), to be pinned by property tests.

## Definition of done (from the brief) and where it is proven
- API end to end: integration test from capture to refund to replay (idempotent) to over-refund rejection.
- Ledger to the fils: balanced groups, fee revenue never negative per transaction, sum of refunds <= captured.
- Fees and payouts: batch close with and without refunds; negative-net carry-forward; MDR recalculation keeps refunds.
- Webhook: signed `refund.succeeded` envelope delivered once to the merchant's endpoint.
- Timeline, reports, reconciliation: event in the transaction timeline, daily summary, reconciliation explains to zero.
- Live on Dilmune Cloud: pending instructions.
