# AUD-054 — Refunds never reach a payout: batch close ignores refunds

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / settlement |
| Status | **partially fixed** (branch `feat/FP-300-settlement-refunds`): refunds now reduce the payout; recovery of a negative net is open (Q13, finance); the route stays OFF by default until then |
| Fix commit | see `git log feat/FP-300-settlement-refunds` |

## Summary
`CloseBatch` selects only `captured`/`partially_captured` events. A refund reverses the merchant's ledger balance at refund time but never reduces any batch's `net_payout_fils`, the cached balance, the scheme/payout reports or the reconciliation pending figure.

## Location
apps/settlement/internal/settlement/batch.go (`CloseBatch` event selection, net = gross - fee), recalculate_mdr.go (`newNetPayout := gross - newFee`, event sum without a type filter), apps/api/src/settlement/query.ts (pending query selects captures only; the comment claiming refund legs are included in pending is false).

## Root cause
Refunds were designed with a `refunds.settlement_batch_id` column and an "unbatched refunds" index (0042) but the batch close never reads them; the 2026-06-02 sync planned to "subtract refunds in the report and leave the batch alone", which pays merchants for refunded sales.

## Reproduction
Traced in code (the refund route was a 501 stub until FP-300 PR 1, so this was latent). Becomes real the moment refunds work: capture 10.000, refund 4.000, close the batch: net payout is still 10.000 less fee.

## Impact
The platform refunds the cardholder and still pays the merchant in full: direct financial loss, and the ledger (merchant_payable reduced) and the payout (not reduced) disagree, so reconciliation cannot tie out. Refunds must not go live anywhere before this is fixed: `POST /v1/refunds` is therefore off by default (`REFUNDS_ENABLED`, 503 `refunds_disabled`); PR 2 does not flip the default because a negative net is not yet recovered (Q13).

## Fix
Migration 0091 adds `settlement_batches.refund_fils` and `refund_fee_reversed_fils` (`NOT NULL DEFAULT 0`, so history is unchanged). `CloseBatch` selects, under `FOR UPDATE`, the merchant's succeeded refunds with no batch and `occurred_at < end of the business day` (no lower bound, so a refund that missed its day is absorbed by the next batch closed), stores them as their own terms and freezes `net_payout_fils = gross - fee - refund_fils + refund_fee_reversed_fils`; the refunds are stamped with the batch id in the same transaction (so a re-close subtracts nothing twice) and `gross_fils` and the scheme export stay captures-only. The net can be **negative** (refunds above the day's captures): `PayoutBatch` and `PayoutSplitBatch` pay nothing for it, post no legs, and do NOT call `ApplyPayout` with the negative amount (that would "pay the debt back" into `merchant_balances`); the cached balance shows the debt, `settlement.paid` is not enqueued. `RecalculateMDR` keeps the refund terms in the recomputed net and prices only capture events. A merchant that is suspended or in test mode is not closed, so its refunds wait (a test-mode merchant is never settled, same as its captures). The `settlement.batch_closed` payload gets `refundFils` / `refundFeeReversedFils`; `SettlementBatchDto`, the admin merchant detail API (`admin/merchants.ts`) and the web batch pages show them (the admin console UI and the reporting payout-trend rows do not yet carry the refund columns, so a trend row no longer satisfies gross - fee = net); the web `bhd()` helper now accepts negative amounts (a refund-only batch or a negative reconciliation figure used to throw and blank the page). Reconciliation: `refundTimingFils` = refunds made in the window (by `occurred_at`) minus refunds absorbed by batches dated in the window, exact integer SQL, deducted inside `pendingUnbatchedFils`. Proven by tests: refund batched the same day, refund pending, and refund made on day D and absorbed by the batch of D+1 (timing +3.900 for D, -3.900 for D+1, both gaps 0). Not claimed: windows after a paid day still see that day's payout leg on the ledger side (pre-existing), so "explained to zero" holds for single-day windows that do not include a previous day's payout. `REFUNDS_ENABLED` stays OFF by default (the review showed that a negative net is otherwise forgiven).

Tests: Go `refund_settlement_test.go` (net reduced and refunds stamped, scheme export captures-only, idempotent re-close, selection rules: older/unbatched yes, failed no, next day no, refund-only negative batch pays nothing and keeps the cache, suspended merchant keeps refunds unbatched then absorbs them on reactivation, RecalculateMDR keeps refund terms) + `TestSplitPayout_NegativeNetPaysNothingAndKeepsTheDebtInTheCache`; API `settlement.test.ts` (3 reconciliation tests with refunds, DTO fields; the batch-close helper mirrors the Go pickup); web `bhd` negative test. Tests changed: the TS `closeAndPayoutBatch` test helper (it mirrors CloseBatch, so it now mirrors the refund pickup too); no assertion was edited.

## Re-attack notes
Open points, stated rather than hidden: (1) **Q13 (finance)**: a negative net is recorded and not recovered automatically, a later positive batch is still paid in full; the debt is visible in the cached balance and in `net_payout_fils < 0`, and needs a collection/netting policy before refunds exceed a merchant's sales in practice. (2) `RecalculateMDR` does not re-derive the fee given back on refunds (frozen at what was reversed), so recalculating a capture day at a new rate leaves a small explainable difference in the later refund batch. (3) Burden of a negative or reduced net on a split parent is shared by weight. (4) The cached balance keeps AUD-048's definition. (5) Reconciliation windows still see the previous day's payout leg (pre-existing). (6) Deploy order: migration 0091 and the daemon with the API. (7) From the review: a refund that starts before midnight and commits after the daily close (it holds the transaction lock across the acquirer call, `occurred_at` is the start time) is not seen by that close; the next close absorbs it (no lower bound), one day later, never lost and never counted twice. (8) A new DB CHECK for the net identity was not added. (9) The platform volume tier ignores refunds (finance question). (10) Reporting trends and the admin UI do not show refund columns yet; the batch detail transaction list does not list absorbed refunds.

## Related
AUD-016, AUD-048, FP-300
