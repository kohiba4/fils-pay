# Architecture and money-flow map (as the code actually behaves)

One Postgres 16 DB shared by: **apps/api** (Fastify; merchant, public checkout, admin, acquirer callbacks, webhook dispatcher in-process), **apps/settlement** (Go daemon + CLI + internal HTTP on :8091), **apps/reporting** (outbox consumer → rollups). apps/web and apps/admin are Vite SPAs over HTTP. `apps/api/src/v1/` is **not registered** in app.ts (dead tree).

## Money flow

```
authorize (api/payments/authorize.ts)
  └─ transactions(authorized) + holds(active, 7d) + transaction_events(authorized)        [no ledger]
capture (api/payments/capture.ts)   ← POST /v1/transactions/:id/capture  | payment-link pay.ts
  ├─ ledger: card_scheme_clearing DR / merchant_payable CR  (gross)
  ├─ ledger: merchant_payable DR / platform_fee_revenue CR  (fee = mdr_at(now) − tier; NO discount)
  ├─ [transactions route only] discountAdjustment.ts: fee_revenue DR / payable CR (discount off FEE)
  ├─ transaction_events(captured, amount, metadata.feeFils)
  └─ outbox transaction.captured ─┬─> webhook dispatcher → merchant
                                  └─> reporting → merchant_daily_volume
void (api/payments/void.ts) → outbox transaction.voided
refund (api/payments/processRefund.ts)  — route is a 501 stub (FP-300)
  └─ ledger: payable DR / clearing CR (gross), fee_revenue DR / payable CR (fee reversal),
     refunds row, transactions.refunded_fils, transaction_events(refund_*), outbox refund.succeeded (undelivered)
acquirer callbacks (api/acquirer/callbacks.ts) → acquirer_callback_notes only (no state change)

CloseBatch (settlement/batch.go) — daemon ~03:15 Bahrain, run-batch CLI, admin run-batch
  ├─ claims capture events in Bahrain-day window (FOR UPDATE), fee per event =
  │    applyRate(amount − applyRate(amount, discount), mdr_at(event) − tier)      [≠ capture fee]
  ├─ net = float32(gross − fee)                                                    [AUD-008]
  ├─ settlement_batches(closed), scheme_export_lines(amount_fils=trunc10, amount=round2(gross))
  ├─ platform_stats counter (BIGINT since migration 0074)                                               [AUD-017]
  ├─ outbox settlement.batch_closed → reporting merchant_payout_trends
  └─ merchant_balances += net                                         [cache]
  (NO ledger legs at close; NO residue legs — ADR-0002 not implemented)
PayoutBatch → ledger payable DR / platform_cash CR (net); batch paid; cache −= net
PayoutSplitBatch → per child applyRate(net, weight) legs on PARENT; remainder dropped  [AUD-009]
EnqueuePayoutNotifications (daemon + CLI, outside tx) → outbox settlement.paid        [AUD-018]
  └─ dispatcher pre-delivery effect → settlement_payout_disbursements (per delivery row)
RecalculateMDR (admin → internal API) → rewrites closed+paid batches, adjustment legs     [AUD-014]
Rebuild balances: CLI = SUM(ledger payable)  |  admin button = SUM(scheme_export_lines)  [AUD-015]
Reconciliation (api/settlement/query.ts): ledger payable − batch net − float-estimated pending
Admin money: credits (ledger, 2nd approver), Adjust balance (cache only), CSV import (ledger + cache)
Scripts: reconcile_march.ts (ledger, non-idempotent), expire_holds.ts (DELETE)
```

## Same rule implemented more than once (variant-analysis checklist)

| Rule | Implementations |
|---|---|
| Fee for a capture | capture.ts · discountAdjustment.ts · settlement discounted_fee.go (CloseBatch) · recalculate_mdr.go · settlement/query.ts `estimateFeeFils` (float) · v1/fees/calculateFee.ts (half-up, dead) · admin/web fee display |
| Rate in force | api fees/feeSchedule.ts · go fee_schedule.go · currentFeeScheduleDisplay.ts (created_at) · recalc (merchants.mdr_bps) · query.ts (merchants.mdr_bps) |
| Volume tier | api platformVolumeTier.ts · go platform_volume.go |
| BD text → fils | packages/money parseBhdToFils · lib/decimal.ts parseDecimalMinor (2dp) · discountAdjustment parseFloat×100 · admin/web `bhd()` helpers |
| Balance rebuild | ledger/rebuild.go (ledger) · ledger/refresh.go (scheme view) · CSV import cache update · Adjust balance |
| Business day | window.go · daemon runIfDue (UTC) · reporting bahrainDate.ts · capture.ts `recordCaptureMetric` (UTC date) · 0072 view · analytics route |
| Allocation | packages/money allocateRemainder · splits/allocate.go & shares.go (applyRate per child) |
| Signature | webhooks/sign.ts (canonical) · dispatcher send (JSONB order) · inboundVerify.ts (stringify, Buffer.compare) |
| Session auth predicate | lookupSession (view, no authenticated) · lookupPendingSession · admin lookupAdminSession · impersonation |
| Payout notification | daemon runIfDue · CLI run-batch |

## Components not yet read in depth (Phase 1)
apps/reporting consumer & rebuild, analytics query, transactions export, webhook archive/replay, KYC upload/thumbnail, business profile PATCH (SQL interpolation note), reporting saved filters (interpolation note), void.ts, credits, admin UI/web checkout code.
