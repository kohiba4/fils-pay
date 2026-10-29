package settlement

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// AUD-018: the database itself must refuse a second settlement.paid event for the same batch.
// (A code comment claimed a unique index on (event_type, aggregate_id) existed; it did not, so two
// processes that both passed the NOT EXISTS check both inserted.)
func TestSettlementPaidEventIsUniquePerBatch(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	batchID := insertBatch(t, pool, merchantID, time.Date(2026, 4, 16, 0, 0, 0, 0, time.UTC), "paid", 1000)

	insert := func() error {
		_, err := pool.Exec(ctx, `
			INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload)
			VALUES ('settlement.paid', 'settlement_batch', $1, '{}'::jsonb)`, batchID)
		return err
	}
	if err := insert(); err != nil {
		t.Fatalf("first insert: %v", err)
	}
	err := insert()
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		t.Fatalf("second settlement.paid event for the same batch: err = %v, want unique violation 23505", err)
	}
}

// Other event types may legitimately repeat for one aggregate (e.g. several captures of one transaction
// are separate transaction.captured events), so the uniqueness is scoped to settlement.paid only.
func TestOtherOutboxEventsMayRepeatForAnAggregate(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	batchID := insertBatch(t, pool, merchantID, time.Date(2026, 4, 17, 0, 0, 0, 0, time.UTC), "closed", 1000)
	for i := 0; i < 2; i++ {
		if _, err := pool.Exec(ctx, `
			INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload)
			VALUES ('settlement.batch_closed', 'settlement_batch', $1, '{}'::jsonb)`, batchID); err != nil {
			t.Fatalf("insert %d of a non-unique event type failed: %v", i+1, err)
		}
	}
}
