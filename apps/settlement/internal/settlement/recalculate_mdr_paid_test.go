package settlement

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// closedAndPaidBatch closes and pays one batch of a single 100,000-fil capture at 2.50% (fee 2,500).
func closedAndPaidBatch(t *testing.T, mdrBps int64) (merchantID, batchID uuid.UUID, date time.Time) {
	t.Helper()
	pool := mustPool(t)
	ctx := context.Background()
	merchantID = insertActiveMerchant(t, pool, mdrBps)
	date = time.Date(2026, 4, 14, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(date)
	insertCaptureEvent(t, pool, merchantID, mdrBps, 100_000, start.Add(time.Hour))
	closed, err := CloseBatch(ctx, pool, merchantID, date)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PayoutBatch(ctx, pool, closed.BatchID); err != nil {
		t.Fatal(err)
	}
	return merchantID, closed.BatchID, date
}

func setMdr(t *testing.T, merchantID uuid.UUID, bps int64) {
	t.Helper()
	if _, err := mustPool(t).Exec(context.Background(), `UPDATE merchants SET mdr_bps = $2 WHERE id = $1`, merchantID, bps); err != nil {
		t.Fatal(err)
	}
}

// adjustmentNet returns the net amount the recalculation posted against this batch's merchant_payable
// (debits positive: the merchant owes more).
func adjustmentNet(t *testing.T, batchID uuid.UUID) (legs int, net int64) {
	t.Helper()
	err := mustPool(t).QueryRow(context.Background(), `
		SELECT count(*), COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_fils ELSE -amount_fils END), 0)
		  FROM ledger_entries
		 WHERE settlement_batch_id = $1 AND account_id = 'merchant_payable' AND description = 'MDR recalculation adjustment'
	`, batchID).Scan(&legs, &net)
	if err != nil {
		t.Fatal(err)
	}
	return legs, net
}

// AUD-014 (Q3): a PAID batch is not rewritten, but the fee difference is still posted to the ledger once.
func TestRecalculateMDR_PaidBatchGetsAnAdjustmentNotARewrite(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID, batchID, date := closedAndPaidBatch(t, 250)
	setMdr(t, merchantID, 400) // fee 2,500 -> 4,000

	res, err := RecalculateMDR(ctx, pool, merchantID, date, date.AddDate(0, 0, 1))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Adjusted) != 1 || res.Adjusted[0].Status != "paid" || res.Adjusted[0].OldFeeFils != 2500 || res.Adjusted[0].NewFeeFils != 4000 || res.Adjusted[0].DiffFils != 1500 {
		t.Fatalf("Adjusted = %+v, want one paid batch 2500 -> 4000 (diff 1500)", res.Adjusted)
	}
	var fee, net int64
	_ = pool.QueryRow(ctx, `SELECT fee_fils, net_payout_fils FROM settlement_batches WHERE id = $1`, batchID).Scan(&fee, &net)
	if fee != 2500 || net != 97_500 {
		t.Errorf("paid batch row changed: fee %d net %d, want 2500 / 97500 (what the bank received)", fee, net)
	}
	if legs, n := adjustmentNet(t, batchID); legs != 1 || n != 1500 {
		t.Errorf("adjustment legs = %d, net = %d, want 1 leg of +1500 on merchant_payable", legs, n)
	}
}

// Re-running (finance does it "after every rate change") must not post the same adjustment twice,
// and a later rate change is measured against the fee already adjusted to.
func TestRecalculateMDR_PaidBatchAdjustmentIsIdempotentAndCumulative(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID, batchID, date := closedAndPaidBatch(t, 250)
	from, to := date, date.AddDate(0, 0, 1)

	setMdr(t, merchantID, 400)
	if _, err := RecalculateMDR(ctx, pool, merchantID, from, to); err != nil {
		t.Fatal(err)
	}
	again, err := RecalculateMDR(ctx, pool, merchantID, from, to)
	if err != nil {
		t.Fatal(err)
	}
	if len(again.Adjusted) != 0 {
		t.Errorf("second run adjusted %+v, want nothing (same rate)", again.Adjusted)
	}
	if legs, n := adjustmentNet(t, batchID); legs != 1 || n != 1500 {
		t.Errorf("after a rerun: legs = %d, net = %d, want 1 / +1500", legs, n)
	}

	setMdr(t, merchantID, 300) // back down: fee 3,000, so total adjustment vs the paid 2,500 is +500
	third, err := RecalculateMDR(ctx, pool, merchantID, from, to)
	if err != nil {
		t.Fatal(err)
	}
	if len(third.Adjusted) != 1 || third.Adjusted[0].OldFeeFils != 4000 || third.Adjusted[0].NewFeeFils != 3000 || third.Adjusted[0].DiffFils != -1000 {
		t.Fatalf("third run Adjusted = %+v, want 4000 -> 3000 (diff -1000)", third.Adjusted)
	}
	if _, n := adjustmentNet(t, batchID); n != 500 {
		t.Errorf("cumulative adjustment = %d, want +500 (3000 owed - 2500 paid)", n)
	}
}

// Review of AUD-014 (found by the independent reviewer): a batch rewritten while still CLOSED already
// has that adjustment folded into its row; after it is paid, a further recalculation must measure
// against the row, not row + the earlier ledger adjustments (that counted the 1,500 twice).
func TestRecalculateMDR_RewrittenWhileClosedThenPaidThenRecalculated(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	date := time.Date(2026, 4, 15, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(date)
	insertCaptureEvent(t, pool, merchantID, 250, 100_000, start.Add(time.Hour))
	closed, err := CloseBatch(ctx, pool, merchantID, date) // fee 2,500
	if err != nil {
		t.Fatal(err)
	}
	from, to := date, date.AddDate(0, 0, 1)

	setMdr(t, merchantID, 400) // while CLOSED: row is rewritten to fee 4,000, ledger +1,500
	if _, err := RecalculateMDR(ctx, pool, merchantID, from, to); err != nil {
		t.Fatal(err)
	}
	if _, err := PayoutBatch(ctx, pool, closed.BatchID); err != nil { // bank receives 96,000
		t.Fatal(err)
	}

	setMdr(t, merchantID, 300) // true fee 3,000
	res, err := RecalculateMDR(ctx, pool, merchantID, from, to)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Adjusted) != 1 || res.Adjusted[0].OldFeeFils != 4000 || res.Adjusted[0].NewFeeFils != 3000 || res.Adjusted[0].DiffFils != -1000 {
		t.Fatalf("Adjusted = %+v, want 4000 -> 3000 (diff -1000), the fee the bank was paid against", res.Adjusted)
	}
	if _, n := adjustmentNet(t, closed.BatchID); n != 500 {
		t.Errorf("total adjustment on the batch = %d, want +500 (3000 owed - 2500 originally closed)", n)
	}
}
