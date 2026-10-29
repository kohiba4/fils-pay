package settlement

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/filspay/settlement/internal/splits"
)

// splitParent creates a parent merchant with one child per weight.
func splitParent(t *testing.T, weights []int64) uuid.UUID {
	t.Helper()
	pool := mustPool(t)
	parent := insertActiveMerchant(t, pool, 250)
	for _, w := range weights {
		child := insertActiveMerchant(t, pool, 250)
		if _, err := pool.Exec(context.Background(), `INSERT INTO merchant_split_children (parent_merchant_id, child_merchant_id, split_weight_bps) VALUES ($1,$2,$3)`, parent, child, w); err != nil {
			t.Fatal(err)
		}
	}
	return parent
}

// AUD-009 (Q8): child weights that do not sum to 10,000 bps used to be paid anyway, silently
// stranding or inventing money. The batch must stay unpaid with nothing posted.
func TestSplitPayout_InvalidWeightsAreNotPaid(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	parent := splitParent(t, []int64{5000, 3000}) // 8000 bps
	batchID := insertBatch(t, pool, parent, time.Date(2026, 4, 8, 0, 0, 0, 0, time.UTC), "closed", 1000)

	if _, err := splits.PayoutSplitBatch(ctx, pool, batchID); err != splits.ErrInvalidSplitWeights {
		t.Fatalf("PayoutSplitBatch err = %v, want ErrInvalidSplitWeights", err)
	}
	var status string
	var legs int
	_ = pool.QueryRow(ctx, `SELECT status FROM settlement_batches WHERE id = $1`, batchID).Scan(&status)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ledger_entries WHERE settlement_batch_id = $1`, batchID).Scan(&legs)
	if status != "closed" || legs != 0 {
		t.Errorf("status = %q, ledger legs = %d; want the batch left closed with nothing posted", status, legs)
	}
}

// One misconfigured parent must not abort the whole daily run for everyone else.
func TestRunDailyBatch_SkipsAParentWithInvalidSplitWeights(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	parent := splitParent(t, []int64{4000, 4000})
	date := time.Date(2026, 4, 9, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(date)
	insertCaptureEvent(t, pool, parent, 250, 50_000, start.Add(time.Hour))

	report, err := RunDailyBatch(ctx, pool, date, &parent)
	if err != nil {
		t.Fatalf("RunDailyBatch aborted on an invalid split config: %v", err)
	}
	if len(report.Skipped) != 1 || report.Skipped[0].MerchantID != parent {
		t.Errorf("report.Skipped = %+v, want the invalid parent listed so it is not silently dropped", report.Skipped)
	}
	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM settlement_batches WHERE merchant_id = $1 AND batch_date = $2`, parent, date).Scan(&status)
	if status != "closed" {
		t.Errorf("batch status = %q, want closed (closed but not paid, retried after the config is fixed)", status)
	}
}

// Cache and ledger must both drop by exactly the batch net.
func TestSplitPayout_PaysExactlyNetAndReducesCacheByNet(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	parent := splitParent(t, []int64{5000, 3000, 2000})
	const net = 1_003
	batchID := insertBatch(t, pool, parent, time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC), "closed", net)
	if _, err := pool.Exec(ctx, `INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at) VALUES ($1, 5000, now())`, parent); err != nil {
		t.Fatal(err)
	}
	if _, err := splits.PayoutSplitBatch(ctx, pool, batchID); err != nil {
		t.Fatal(err)
	}
	var debited, allocated, cache int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE(SUM(amount_fils),0) FROM ledger_entries WHERE settlement_batch_id=$1 AND account_id='merchant_payable' AND direction='debit'`, batchID).Scan(&debited)
	_ = pool.QueryRow(ctx, `SELECT COALESCE(SUM(allocated_fils),0) FROM settlement_batch_splits WHERE settlement_batch_id=$1`, batchID).Scan(&allocated)
	_ = pool.QueryRow(ctx, `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id=$1`, parent).Scan(&cache)
	if debited != net || allocated != net || cache != 5000-net {
		t.Errorf("net=%d: ledger debited %d, children allocated %d, cache %d (want %d)", net, debited, allocated, cache, 5000-net)
	}
}

// A child whose share rounds to 0 fils still gets its audit row (no ledger legs: amount_fils > 0 CHECK).
func TestSplitPayout_ZeroShareChildKeepsAnAuditRow(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	parent := splitParent(t, []int64{5000, 5000})
	batchID := insertBatch(t, pool, parent, time.Date(2026, 4, 11, 0, 0, 0, 0, time.UTC), "closed", 1) // 1 fil: one child gets it, one gets 0
	if _, err := splits.PayoutSplitBatch(ctx, pool, batchID); err != nil {
		t.Fatal(err)
	}
	var rows, total int64
	_ = pool.QueryRow(ctx, `SELECT count(*), COALESCE(SUM(allocated_fils),0) FROM settlement_batch_splits WHERE settlement_batch_id = $1`, batchID).Scan(&rows, &total)
	if rows != 2 || total != 1 {
		t.Errorf("settlement_batch_splits rows = %d (want 2), allocated total = %d (want 1)", rows, total)
	}
}

// FP-300 / AUD-054: a split parent whose refunds exceed its captures has a NEGATIVE net. Nothing is allocated or posted,
// and the debt in the cached balance must not be "paid back" by the payout.
func TestSplitPayout_NegativeNetPaysNothingAndKeepsTheDebtInTheCache(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	parent := splitParent(t, []int64{5000, 5000})
	batchID := insertBatch(t, pool, parent, time.Date(2026, 4, 12, 0, 0, 0, 0, time.UTC), "closed", -3_000)
	if _, err := pool.Exec(ctx, `INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at) VALUES ($1, -3000, now())`, parent); err != nil {
		t.Fatal(err)
	}
	if _, err := splits.PayoutSplitBatch(ctx, pool, batchID); err != nil {
		t.Fatal(err)
	}
	var legs, allocated, cache int64
	var status string
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ledger_entries WHERE settlement_batch_id=$1`, batchID).Scan(&legs)
	_ = pool.QueryRow(ctx, `SELECT COALESCE(SUM(allocated_fils),0) FROM settlement_batch_splits WHERE settlement_batch_id=$1`, batchID).Scan(&allocated)
	_ = pool.QueryRow(ctx, `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id=$1`, parent).Scan(&cache)
	_ = pool.QueryRow(ctx, `SELECT status FROM settlement_batches WHERE id=$1`, batchID).Scan(&status)
	if legs != 0 || allocated != 0 || cache != -3_000 || status != "paid" {
		t.Errorf("legs=%d allocated=%d cache=%d status=%s; want 0, 0, -3000 (debt stays visible), paid", legs, allocated, cache, status)
	}
}
