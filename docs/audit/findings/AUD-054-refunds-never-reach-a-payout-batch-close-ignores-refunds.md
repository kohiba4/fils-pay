# AUD-054 — Refunds never reach a payout: batch close ignores refunds

| Field | Value |
|---|---|
| Owner | A |
| Severity | **High** |
| Category | money / settlement |
| Status | open (FP-300 PR 2; plan in FP-300-PLAN.md) |
| Fix commit | — |

## Summary
`CloseBatch` selects only `captured`/`partially_captured` events. A refund reverses the merchant's ledger balance at refund time but never reduces any batch's `net_payout_fils`, the cached balance, the scheme/payout reports or the reconciliation pending figure.

## Location
apps/settlement/internal/settlement/batch.go (`CloseBatch` event selection, net = gross - fee), recalculate_mdr.go (`newNetPayout := gross - newFee`, event sum without a type filter), apps/api/src/settlement/query.ts (pending query selects captures only; the comment claiming refund legs are included in pending is false).

## Root cause
Refunds were designed with a `refunds.settlement_batch_id` column and an "unbatched refunds" index (0042) but the batch close never reads them; the 2026-06-02 sync planned to "subtract refunds in the report and leave the batch alone", which pays merchants for refunded sales.

## Reproduction
Traced in code (the refund route was a 501 stub until FP-300 PR 1, so this was latent). Becomes real the moment refunds work: capture 10.000, refund 4.000, close the batch: net payout is still 10.000 less fee.

## Impact
The platform refunds the cardholder and still pays the merchant in full: direct financial loss, and the ledger (merchant_payable reduced) and the payout (not reduced) disagree, so reconciliation cannot tie out. Refunds must not go live anywhere before this is fixed: `POST /v1/refunds` is therefore off by default (`REFUNDS_ENABLED`, 503 `refunds_disabled`) until PR 2 flips the default.

## Fix (proposed)
See docs/audit/FP-300-PLAN.md (PR 2): `refund_fils` / `refund_fee_reversed_fils` on `settlement_batches`, pickup of succeeded unbatched refunds with `occurred_at < windowEnd`, RecalculateMDR keeps the refund terms and filters events by type, exact pending refunds for reconciliation, additive API/payload fields. Open finance decision Q13: negative net (no netting vs cap payouts at the balance).

## Re-attack notes
_To be filled after the fix._

## Related
AUD-016, AUD-048, FP-300
