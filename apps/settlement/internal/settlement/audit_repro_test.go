package settlement

// Phase-1 repro tests for audit Track A findings. Each test is written to
// FAIL against the current code and PASS once the named finding is fixed
// (docs/audit/findings/AUD-0xx-*.md). They need DATABASE_URL like the other
// DB tests in this package. Tests use new random merchants only.

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/filspay/settlement/internal/ledger"
	"github.com/filspay/settlement/internal/money"
	"github.com/filspay/settlement/internal/splits"
)

// AUD-008: NetPayableFils must be exact integer subtraction.
func TestRepro_AUD008_NetPayableFilsIsExactIntegerSubtraction(t *testing.T) {
	cases := []struct{ gross, fee money.Fils }{
		{20_000_123, 550_003},
		{123_456_789, 3_395_061},
		{987_654_321, 27_160_494},
		{4_750, 119},
	}
	for _, c := range cases {
		if got, want := NetPayableFils(c.gross, c.fee), c.gross-c.fee; got != want {
			t.Errorf("NetPayableFils(%d, %d) = %d, want %d (off by %d fils)", c.gross, c.fee, got, want, got-want)
		}
	}
}

// AUD-010: the scheme line's 2dp `amount` must be the truncated amount_fils / 1000.
func TestRepro_AUD010_SchemeLineAmountIsTruncatedNotRounded(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	date := time.Date(2026, 4, 3, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(date)
	insertCaptureEvent(t, pool, merchantID, 250, 93_279, start.Add(time.Hour))

	res, err := CloseBatch(ctx, pool, merchantID, date)
	if err != nil {
		t.Fatalf("CloseBatch: %v", err)
	}
	var amountFils int64
	var amount string
	if err := pool.QueryRow(ctx,
		`SELECT amount_fils, amount::text FROM scheme_export_lines WHERE settlement_batch_id = $1`, res.BatchID,
	).Scan(&amountFils, &amount); err != nil {
		t.Fatal(err)
	}
	if amountFils != 93_270 {
		t.Fatalf("amount_fils = %d, want 93270", amountFils)
	}
	if amount != "93.27" {
		t.Errorf("scheme amount = %s, want 93.27 (truncated); file would overstate by 0.01 BD", amount)
	}
}

// AUD-014: recalculating MDR must not rewrite a PAID batch's stored figures.
func TestRepro_AUD014_RecalculateMDRDoesNotRewritePaidBatch(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	date := time.Date(2026, 4, 4, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(date)
	insertCaptureEvent(t, pool, merchantID, 250, 100_000, start.Add(time.Hour))

	closed, err := CloseBatch(ctx, pool, merchantID, date)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PayoutBatch(ctx, pool, closed.BatchID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE merchants SET mdr_bps = 400 WHERE id = $1`, merchantID); err != nil {
		t.Fatal(err)
	}
	if _, err := RecalculateMDR(ctx, pool, merchantID, date, date.AddDate(0, 0, 1)); err != nil {
		t.Fatal(err)
	}
	var fee, net int64
	if err := pool.QueryRow(ctx, `SELECT fee_fils, net_payout_fils FROM settlement_batches WHERE id = $1`, closed.BatchID).Scan(&fee, &net); err != nil {
		t.Fatal(err)
	}
	if fee != int64(closed.FeeFils) || net != int64(closed.NetPayoutFils) {
		t.Errorf("paid batch rewritten: fee %d -> %d, net %d -> %d (bank already received %d)",
			closed.FeeFils, fee, closed.NetPayoutFils, net, closed.NetPayoutFils)
	}
}

// AUD-018: concurrent notification scans must enqueue exactly one event per batch.
// outbox_events has NO unique index on (event_type, aggregate_id) despite a
// code comment claiming one, so overlapping check-then-insert scans duplicate.
func TestRepro_AUD018_ConcurrentPayoutNotificationsEnqueueOnce(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	var batchIDs []uuid.UUID
	for i := 0; i < 40; i++ {
		d := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, i)
		batchIDs = append(batchIDs, insertBatch(t, pool, merchantID, d, "paid", 471_300))
	}

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, _ = EnqueuePayoutNotifications(ctx, pool)
		}()
	}
	close(start)
	wg.Wait()

	dups, extra := 0, 0
	for _, id := range batchIDs {
		if n := countPaidEvents(t, pool, id); n != 1 {
			dups++
			extra += n - 1
		}
	}
	if dups > 0 {
		t.Errorf("%d of %d batches got a duplicate settlement.paid event (%d extra events)", dups, len(batchIDs), extra)
	}
}

// AUD-017: the platform volume counter must not wrap negative.
func TestRepro_AUD017_PlatformVolumeCounterDoesNotOverflow(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	const nearMax int32 = 2_147_000_000
	if _, err := tx.Exec(ctx, `UPDATE platform_stats SET total_processed_fils = $1 WHERE id = 1`, nearMax); err != nil {
		t.Fatal(err)
	}
	cur, err := ReadAndLockPlatformProcessedFils(ctx, tx)
	if err != nil {
		t.Fatal(err)
	}
	if err := RecordPlatformProcessedVolume(ctx, tx, cur, 1_000_000); err != nil {
		t.Logf("write failed: %v", err)
	}
	var stored int64
	if err := tx.QueryRow(ctx, `SELECT total_processed_fils FROM platform_stats WHERE id = 1`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored < int64(nearMax) {
		t.Errorf("counter went from %d to %d after adding 1,000,000 fils (int32 wrap-around)", nearMax, stored)
	}
}

// AUD-009: split child shares must sum exactly to the batch net payout.
func TestRepro_AUD009_SplitPayoutAllocatesExactlyTheNet(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	parent := insertActiveMerchant(t, pool, 250)
	weights := []int64{5000, 3000, 2000}
	for _, w := range weights {
		child := insertActiveMerchant(t, pool, 250)
		if _, err := pool.Exec(ctx, `INSERT INTO merchant_split_children (parent_merchant_id, child_merchant_id, split_weight_bps) VALUES ($1,$2,$3)`, parent, child, w); err != nil {
			t.Fatal(err)
		}
	}
	const net = 1_001 // 500.5 / 300.3 / 200.2 -> independent rounding gives 1000
	batchID := insertBatch(t, pool, parent, time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC), "closed", net)

	if _, err := splits.PayoutSplitBatch(ctx, pool, batchID); err != nil {
		t.Fatal(err)
	}
	var allocated, debited int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE(SUM(allocated_fils),0) FROM settlement_batch_splits WHERE settlement_batch_id = $1`, batchID).Scan(&allocated)
	_ = pool.QueryRow(ctx, `SELECT COALESCE(SUM(amount_fils),0) FROM ledger_entries WHERE settlement_batch_id = $1 AND account_id='merchant_payable' AND direction='debit'`, batchID).Scan(&debited)
	if allocated != net || debited != net {
		t.Errorf("net=%d but children allocated=%d and ledger debited=%d (stranded %d fils in payable)", net, allocated, debited, net-debited)
	}
}

// AUD-015: the admin rebuild (RefreshBalanceCache) must agree with the ledger rebuild.
func TestRepro_AUD015_RefreshBalanceCacheMatchesLedgerRebuild(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	merchantID := insertActiveMerchant(t, pool, 250)
	date := time.Date(2026, 4, 7, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(date)
	insertCaptureEvent(t, pool, merchantID, 250, 1_000_000, start.Add(time.Hour))

	want, err := ledger.RebuildMerchantBalance(ctx, pool, merchantID)
	if err != nil {
		t.Fatal(err)
	}
	diffs, err := ledger.RefreshBalanceCache(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	var cached int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE(cached_payable_fils,0) FROM merchant_balances WHERE merchant_id = $1`, merchantID).Scan(&cached)
	_ = diffs
	if money.Fils(cached) != want {
		t.Errorf("admin rebuild cached %d, ledger says %d", cached, want)
	}
}

var _ = uuid.Nil
