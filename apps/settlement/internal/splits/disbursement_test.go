package splits

// AUD-018 (part 2): a split parent's paid batch also gets exactly one
// disbursement record, written by the split payout transaction.

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPayoutSplitBatch_RecordsOneDisbursement(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	merchant := func(name string) uuid.UUID {
		var id uuid.UUID
		if err := pool.QueryRow(ctx, `INSERT INTO merchants (display_name, mdr_bps, status, test_mode) VALUES ($1, 250, 'active', false) RETURNING id`,
			name+"-"+uuid.New().String()).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	parent, c1, c2 := merchant("split-parent"), merchant("split-c1"), merchant("split-c2")
	for _, c := range []uuid.UUID{c1, c2} {
		if _, err := pool.Exec(ctx, `INSERT INTO merchant_split_children (parent_merchant_id, child_merchant_id, split_weight_bps) VALUES ($1, $2, 5000)`, parent, c); err != nil {
			t.Fatal(err)
		}
	}
	var batchID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO settlement_batches (merchant_id, batch_date, status, gross_fils, fee_fils, net_payout_fils)
		VALUES ($1, '2026-04-06', 'closed', 10001, 0, 10001) RETURNING id`, parent).Scan(&batchID); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := PayoutSplitBatch(ctx, pool, batchID); err != nil {
			t.Fatalf("PayoutSplitBatch #%d: %v", i+1, err)
		}
	}
	var n int
	var amount int64
	if err := pool.QueryRow(ctx, `SELECT count(*), COALESCE(max(amount_fils), 0) FROM settlement_payout_disbursements
		WHERE settlement_batch_id = $1 AND duplicate_of_disbursement_id IS NULL`, batchID).Scan(&n, &amount); err != nil {
		t.Fatal(err)
	}
	if n != 1 || amount != 10001 {
		t.Fatalf("want one disbursement of 10001 fils for the split batch, got n=%d amount=%d", n, amount)
	}
}
