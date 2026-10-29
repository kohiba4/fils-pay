package settlement

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/filspay/settlement/internal/money"
)

// FP-300 PR 2 / AUD-054: refunds must reach the payout.

// insertRefund inserts one refunds row (the same columns processRefund writes) for an existing transaction.
func insertRefund(t *testing.T, pool *pgxpool.Pool, merchantID, txnID uuid.UUID, amount, feeReversed int64, status string, occurredAt time.Time) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(), `
		INSERT INTO refunds (transaction_id, merchant_id, amount_fils, fee_reversed_fils, status, acquirer_reference, reason,
		                     created_by_type, created_by_id, occurred_at)
		VALUES ($1, $2, $3, $4, $5, 'acq-refund', 'test', 'merchant_api_key', $6, $7)
		RETURNING id
	`, txnID, merchantID, amount, feeReversed, status, uuid.New(), occurredAt).Scan(&id)
	if err != nil {
		t.Fatalf("insertRefund: %v", err)
	}
	return id
}

func refundBatchID(t *testing.T, pool *pgxpool.Pool, refundID uuid.UUID) *uuid.UUID {
	t.Helper()
	var id *uuid.UUID
	if err := pool.QueryRow(context.Background(), `SELECT settlement_batch_id FROM refunds WHERE id = $1`, refundID).Scan(&id); err != nil {
		t.Fatalf("read refund batch: %v", err)
	}
	return id
}

type batchRefundRow struct {
	Gross, Fee, Net, Refund, RefundFee int64
	Status                             string
}

func readBatch(t *testing.T, pool *pgxpool.Pool, batchID uuid.UUID) batchRefundRow {
	t.Helper()
	var r batchRefundRow
	err := pool.QueryRow(context.Background(), `
		SELECT gross_fils, fee_fils, net_payout_fils, refund_fils, refund_fee_reversed_fils, status
		  FROM settlement_batches WHERE id = $1`, batchID).Scan(&r.Gross, &r.Fee, &r.Net, &r.Refund, &r.RefundFee, &r.Status)
	if err != nil {
		t.Fatalf("read batch: %v", err)
	}
	return r
}

func cachedBalance(t *testing.T, pool *pgxpool.Pool, merchantID uuid.UUID) int64 {
	t.Helper()
	var v int64
	if err := pool.QueryRow(context.Background(), `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id = $1`, merchantID).Scan(&v); err != nil {
		t.Fatalf("read cache: %v", err)
	}
	return v
}

func TestCloseBatch_RefundReducesTheNetPayout(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	day := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(day)

	txnID, _ := insertCaptureEvent(t, pool, merchantID, 250, 10_000, start.Add(time.Hour))
	refundID := insertRefund(t, pool, merchantID, txnID, 4_000, 100, "succeeded", start.Add(2*time.Hour))

	res, err := CloseBatch(context.Background(), pool, merchantID, day)
	if err != nil {
		t.Fatalf("CloseBatch: %v", err)
	}
	// gross and the scheme file stay captures-only; the refund is its own term of the net
	if res.GrossFils != 10_000 || res.FeeFils != 250 || res.RefundFils != 4_000 || res.RefundFeeReversedFils != 100 {
		t.Fatalf("result = %+v", res)
	}
	if res.NetPayoutFils != 10_000-250-4_000+100 {
		t.Fatalf("net = %d, want 5850", res.NetPayoutFils)
	}
	row := readBatch(t, pool, res.BatchID)
	if row.Net != 5_850 || row.Refund != 4_000 || row.RefundFee != 100 || row.Gross != 10_000 {
		t.Fatalf("stored batch = %+v", row)
	}
	if got := refundBatchID(t, pool, refundID); got == nil || *got != res.BatchID {
		t.Fatalf("refund not stamped with the batch: %v", got)
	}
	var lines int
	var lineSum int64
	if err := pool.QueryRow(context.Background(), `SELECT count(*), COALESCE(SUM(amount_fils),0) FROM scheme_export_lines WHERE settlement_batch_id = $1`, res.BatchID).Scan(&lines, &lineSum); err != nil {
		t.Fatal(err)
	}
	if lines != 1 || lineSum != 10_000 {
		t.Fatalf("scheme export must stay captures-only: %d lines, %d fils", lines, lineSum)
	}
	if got := cachedBalance(t, pool, merchantID); got != 5_850 {
		t.Fatalf("cached balance = %d, want 5850", got)
	}

	// idempotent: closing again subtracts nothing a second time
	again, err := CloseBatch(context.Background(), pool, merchantID, day)
	if err != nil || !again.AlreadyClosed || again.NetPayoutFils != 5_850 {
		t.Fatalf("re-close = %+v, %v", again, err)
	}
	if got := cachedBalance(t, pool, merchantID); got != 5_850 {
		t.Fatalf("cached balance after re-close = %d", got)
	}
}

func TestCloseBatch_RefundSelectionRules(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	day := time.Date(2026, 4, 2, 0, 0, 0, 0, time.UTC)
	start, end := BusinessDayWindow(day)

	txnID, _ := insertCaptureEvent(t, pool, merchantID, 250, 10_000, start.Add(time.Hour))
	older := insertRefund(t, pool, merchantID, txnID, 1_000, 25, "succeeded", start.Add(-72*time.Hour)) // never batched: no lower bound
	inside := insertRefund(t, pool, merchantID, txnID, 2_000, 50, "succeeded", start.Add(3*time.Hour))
	failed := insertRefund(t, pool, merchantID, txnID, 500, 12, "failed", start.Add(4*time.Hour))
	later := insertRefund(t, pool, merchantID, txnID, 700, 17, "succeeded", end.Add(time.Minute)) // belongs to a later day

	res, err := CloseBatch(context.Background(), pool, merchantID, day)
	if err != nil {
		t.Fatalf("CloseBatch: %v", err)
	}
	if res.RefundFils != 3_000 || res.RefundFeeReversedFils != 75 {
		t.Fatalf("picked up refund %d / reversed %d, want 3000 / 75", res.RefundFils, res.RefundFeeReversedFils)
	}
	for name, id := range map[string]uuid.UUID{"older": older, "inside": inside} {
		if got := refundBatchID(t, pool, id); got == nil || *got != res.BatchID {
			t.Errorf("%s refund should be in the batch", name)
		}
	}
	for name, id := range map[string]uuid.UUID{"failed": failed, "later": later} {
		if got := refundBatchID(t, pool, id); got != nil {
			t.Errorf("%s refund must stay unbatched", name)
		}
	}
}

func TestCloseBatch_RefundOnlyBatchHasNegativeNetAndPaysNothing(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	d1 := time.Date(2026, 4, 3, 0, 0, 0, 0, time.UTC)
	d2 := d1.AddDate(0, 0, 1)
	s1, _ := BusinessDayWindow(d1)
	s2, _ := BusinessDayWindow(d2)

	txnID, _ := insertCaptureEvent(t, pool, merchantID, 250, 10_000, s1.Add(time.Hour))
	if _, err := CloseBatch(context.Background(), pool, merchantID, d1); err != nil {
		t.Fatal(err)
	}
	insertRefund(t, pool, merchantID, txnID, 10_000, 250, "succeeded", s2.Add(time.Hour)) // refund the day after

	res, err := CloseBatch(context.Background(), pool, merchantID, d2)
	if err != nil {
		t.Fatalf("CloseBatch: %v", err)
	}
	if res.GrossFils != 0 || res.NetPayoutFils != -9_750 {
		t.Fatalf("result = %+v, want gross 0 and net -9750", res)
	}
	// 9.750 owed to the merchant from day 1 minus the refund: cache shows the real position, 0
	if got := cachedBalance(t, pool, merchantID); got != 0 {
		t.Fatalf("cached balance after both closes = %d, want 0", got)
	}

	// the negative batch pays nothing: no payout ledger legs, balance cache untouched, no settlement.paid
	pay, err := PayoutBatch(context.Background(), pool, res.BatchID)
	if err != nil {
		t.Fatalf("PayoutBatch: %v", err)
	}
	if pay.AlreadyPaid || pay.NotClosed {
		t.Fatalf("payout = %+v", pay)
	}
	var legs int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM ledger_entries WHERE settlement_batch_id = $1`, res.BatchID).Scan(&legs); err != nil {
		t.Fatal(err)
	}
	if legs != 0 {
		t.Fatalf("a negative-net batch must post no payout legs, got %d", legs)
	}
	if got := cachedBalance(t, pool, merchantID); got != 0 {
		t.Fatalf("cached balance after the negative batch is 'paid' = %d, want unchanged 0 (the debt must stay visible, never be paid back into the cache)", got)
	}
	if row := readBatch(t, pool, res.BatchID); row.Status != "paid" || row.Net != -9_750 {
		t.Fatalf("batch = %+v", row)
	}
	if _, err := EnqueuePayoutNotifications(context.Background(), pool); err != nil {
		t.Fatalf("EnqueuePayoutNotifications: %v", err)
	}
	var events int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM outbox_events WHERE event_type = 'settlement.paid' AND aggregate_id = $1`, res.BatchID).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if events != 0 {
		t.Fatalf("no settlement.paid for a negative net, got %d", events)
	}
}

func TestCloseBatch_IneligibleMerchantKeepsRefundsUnbatched(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	day := time.Date(2026, 4, 5, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(day)
	txnID, _ := insertCaptureEvent(t, pool, merchantID, 250, 10_000, start.Add(time.Hour))
	refundID := insertRefund(t, pool, merchantID, txnID, 1_000, 25, "succeeded", start.Add(2*time.Hour))
	if _, err := pool.Exec(context.Background(), `UPDATE merchants SET status = 'suspended' WHERE id = $1`, merchantID); err != nil {
		t.Fatal(err)
	}

	if _, err := CloseBatch(context.Background(), pool, merchantID, day); !errors.Is(err, ErrMerchantNotEligible) {
		t.Fatalf("err = %v, want ErrMerchantNotEligible", err)
	}
	if got := refundBatchID(t, pool, refundID); got != nil {
		t.Fatal("a suspended merchant's refund must wait unbatched")
	}
	// reactivated: the next close picks it up
	if _, err := pool.Exec(context.Background(), `UPDATE merchants SET status = 'active' WHERE id = $1`, merchantID); err != nil {
		t.Fatal(err)
	}
	res, err := CloseBatch(context.Background(), pool, merchantID, day)
	if err != nil || res.RefundFils != 1_000 {
		t.Fatalf("after reactivation: %+v, %v", res, err)
	}
}

func TestRecalculateMDR_KeepsTheRefundTermsInTheNet(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	day := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(day)
	txnID, _ := insertCaptureEvent(t, pool, merchantID, 250, 10_000, start.Add(time.Hour))
	insertRefund(t, pool, merchantID, txnID, 4_000, 100, "succeeded", start.Add(2*time.Hour))
	res, err := CloseBatch(context.Background(), pool, merchantID, day)
	if err != nil || res.NetPayoutFils != 5_850 {
		t.Fatalf("close: %+v, %v", res, err)
	}

	if _, err := pool.Exec(context.Background(), `UPDATE merchants SET mdr_bps = 300 WHERE id = $1`, merchantID); err != nil {
		t.Fatal(err)
	}
	recalc, err := RecalculateMDR(context.Background(), pool, merchantID, day, day.AddDate(0, 0, 1))
	if err != nil || len(recalc.Adjusted) != 1 {
		t.Fatalf("recalc: %+v, %v", recalc, err)
	}
	row := readBatch(t, pool, res.BatchID)
	// fee 300 on 10.000; the refund terms are NOT dropped: 10000 - 300 - 4000 + 100
	if row.Fee != 300 || row.Net != 5_800 || row.Refund != 4_000 || row.RefundFee != 100 {
		t.Fatalf("batch after recalculation = %+v, want fee 300, net 5800 (refund terms kept)", row)
	}
	if got := cachedBalance(t, pool, merchantID); got != 5_800 {
		t.Fatalf("cached balance = %d, want 5800", got)
	}
	var _ money.Fils
}
