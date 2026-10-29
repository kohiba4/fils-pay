package settlement

import (
	"context"
	"testing"
	"time"

	"github.com/filspay/settlement/internal/money"
)

// TestUpdateLifetimePayoutMonitoringEstimate_SmallValuesExact proves the
// accumulator is wired correctly: three successive payouts land on the
// exact sum of their net figures.
func TestUpdateLifetimePayoutMonitoringEstimate_SmallValuesExact(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for _, net := range []money.Fils{1_000, 2_500, 47_500} {
		if err := UpdateLifetimePayoutMonitoringEstimate(ctx, tx, merchantID, net); err != nil {
			t.Fatalf("UpdateLifetimePayoutMonitoringEstimate(%d): %v", net, err)
		}
	}

	var got int64
	err = tx.QueryRow(ctx, `
		SELECT lifetime_net_payout_monitoring_estimate FROM merchants WHERE id = $1
	`, merchantID).Scan(&got)
	if err != nil {
		t.Fatalf("read back estimate: %v", err)
	}
	if got != 51_000 {
		t.Fatalf("lifetime_net_payout_monitoring_estimate = %v, want exactly 51000 (1000 + 2500 + 47500)", got)
	}
}

// AUD-033: a REAL (float32) accumulator stops adding small payouts once the total is large
// (above 2^24 fils it cannot even represent every integer). 40 BD paid on top of 1,000,000 BD
// of lifetime payouts must still be counted, exactly.
func TestUpdateLifetimePayoutMonitoringEstimate_LargeTotalsStayExact(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	want := int64(0)
	for _, net := range []money.Fils{1_000_000_000, 40_001, 1, 3, 40_001} {
		if err := UpdateLifetimePayoutMonitoringEstimate(ctx, tx, merchantID, net); err != nil {
			t.Fatalf("UpdateLifetimePayoutMonitoringEstimate(%d): %v", net, err)
		}
		want += int64(net)
	}

	var got int64
	if err := tx.QueryRow(ctx, `SELECT lifetime_net_payout_monitoring_estimate FROM merchants WHERE id = $1`, merchantID).Scan(&got); err != nil {
		t.Fatalf("read back estimate: %v", err)
	}
	if got != want {
		t.Fatalf("lifetime estimate = %d, want exactly %d", got, want)
	}
}

func TestEstimateMonthlyPayout_ExactIntegerSumOfRecentPaidBatches(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	day := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	insertBatch(t, pool, merchantID, day, "paid", 1_000_000_001)
	insertBatch(t, pool, merchantID, day.AddDate(0, 0, 1), "paid", 7)
	insertBatch(t, pool, merchantID, day.AddDate(0, 0, 2), "closed", 555) // not paid: excluded

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	got, err := EstimateMonthlyPayout(ctx, tx, merchantID)
	if err != nil {
		t.Fatalf("EstimateMonthlyPayout: %v", err)
	}
	if got != 1_000_000_008 {
		t.Fatalf("EstimateMonthlyPayout = %d, want 1000000008", got)
	}
}
