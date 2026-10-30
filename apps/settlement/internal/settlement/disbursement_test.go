package settlement

// AUD-018 (part 2): a paid batch's disbursement record is written by the payout
// transaction itself, not by webhook delivery, so it exists for merchants with
// no webhook endpoint, exactly once per batch, and never without the payout.

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func disbursementRows(t *testing.T, pool *pgxpool.Pool, batchID uuid.UUID) (n int, amount int64) {
	t.Helper()
	err := pool.QueryRow(context.Background(), `
		SELECT count(*), COALESCE(max(amount_fils), 0) FROM settlement_payout_disbursements
		 WHERE settlement_batch_id = $1 AND duplicate_of_disbursement_id IS NULL`, batchID).Scan(&n, &amount)
	if err != nil {
		t.Fatalf("count disbursements: %v", err)
	}
	return n, amount
}

func TestPayoutBatch_RecordsOneDisbursementWithoutAnyWebhookEndpoint(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	batchID := insertBatch(t, pool, merchantID, time.Date(2026, 4, 2, 0, 0, 0, 0, time.UTC), "closed", 12_345)

	if _, err := PayoutBatch(context.Background(), pool, batchID); err != nil {
		t.Fatalf("PayoutBatch: %v", err)
	}
	n, amount := disbursementRows(t, pool, batchID)
	if n != 1 || amount != 12_345 {
		t.Fatalf("want one disbursement of 12345 fils written with the payout, got n=%d amount=%d", n, amount)
	}
	if _, err := PayoutBatch(context.Background(), pool, batchID); err != nil {
		t.Fatalf("re-pay: %v", err)
	}
	if n, _ := disbursementRows(t, pool, batchID); n != 1 {
		t.Fatalf("re-pay must not add a disbursement, got %d", n)
	}
}

func TestPayoutBatch_ConcurrentPayoutsRecordOneDisbursement(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	batchID := insertBatch(t, pool, merchantID, time.Date(2026, 4, 3, 0, 0, 0, 0, time.UTC), "closed", 5_000)
	var wg sync.WaitGroup
	errs := make(chan error, 5)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := PayoutBatch(context.Background(), pool, batchID); err != nil {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent PayoutBatch: %v", err)
	}
	if n, _ := disbursementRows(t, pool, batchID); n != 1 {
		t.Fatalf("want exactly one disbursement after 5 concurrent payouts, got %d", n)
	}
}

func TestPayoutBatch_ZeroNetRecordsNoDisbursement(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	batchID := insertBatch(t, pool, merchantID, time.Date(2026, 4, 4, 0, 0, 0, 0, time.UTC), "closed", 0)
	if _, err := PayoutBatch(context.Background(), pool, batchID); err != nil {
		t.Fatalf("PayoutBatch: %v", err)
	}
	if n, _ := disbursementRows(t, pool, batchID); n != 0 {
		t.Fatalf("a zero-net batch carries no payout instruction, got %d disbursements", n)
	}
}

func TestPayoutBatch_UnpaidBatchHasNoDisbursement(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool, 250)
	batchID := insertBatch(t, pool, merchantID, time.Date(2026, 4, 5, 0, 0, 0, 0, time.UTC), "open", 9_000)
	res, err := PayoutBatch(context.Background(), pool, batchID)
	if err != nil {
		t.Fatalf("PayoutBatch: %v", err)
	}
	if !res.NotClosed {
		t.Fatal("an open batch must not be paid")
	}
	if n, _ := disbursementRows(t, pool, batchID); n != 0 {
		t.Fatalf("no disbursement for a batch that was never paid, got %d", n)
	}
}
