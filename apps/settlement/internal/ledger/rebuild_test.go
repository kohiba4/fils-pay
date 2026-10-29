package ledger

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func mustPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL not set; skipping DB-backed test (run against a real, migrated Postgres)")
	}
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		t.Fatalf("failed to connect to DATABASE_URL: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func insertActiveMerchant(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(), `
		INSERT INTO merchants (display_name, mdr_bps, status, test_mode)
		VALUES ($1, 250, 'active', false)
		RETURNING id
	`, "rebuild-test-"+uuid.New().String()).Scan(&id)
	if err != nil {
		t.Fatalf("insertActiveMerchant: %v", err)
	}
	return id
}

// postLedgerLeg inserts one balanced two-leg ledger_entries group touching
// merchant_payable on one side, mirroring the gross leg of a real capture.
func postLedgerLeg(t *testing.T, pool *pgxpool.Pool, merchantID uuid.UUID, direction string, amountFils int64) {
	t.Helper()
	groupID := uuid.New()
	other := "card_scheme_clearing"
	otherDirection := "debit"
	if direction == "debit" {
		otherDirection = "credit"
	}
	_, err := pool.Exec(context.Background(), `
		INSERT INTO ledger_entries (entry_group_id, merchant_id, account_id, direction, amount_fils, occurred_at, description)
		VALUES
		  ($1, $2, 'merchant_payable', $3, $4, now(), 'test leg'),
		  ($1, $2, $5, $6, $4, now(), 'test leg (other side)')
	`, groupID, merchantID, direction, amountFils, other, otherDirection)
	if err != nil {
		t.Fatalf("postLedgerLeg: %v", err)
	}
}

func TestRebuildMerchantBalance_MatchesDirectSummation(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool)

	// Credits increase the merchant_payable liability (money owed to the
	// merchant); debits reduce it (fees, payouts).
	postLedgerLeg(t, pool, merchantID, "credit", 10000)
	postLedgerLeg(t, pool, merchantID, "credit", 5000)
	postLedgerLeg(t, pool, merchantID, "debit", 375) // e.g. an MDR fee
	postLedgerLeg(t, pool, merchantID, "debit", 2000)

	want := int64(10000 + 5000 - 375 - 2000)

	got, err := RebuildMerchantBalance(context.Background(), pool, merchantID)
	if err != nil {
		t.Fatalf("RebuildMerchantBalance: %v", err)
	}
	if int64(got) != want {
		t.Errorf("RebuildMerchantBalance = %d, want %d", got, want)
	}

	// Cross-check against a raw direct-summation query independent of the
	// function under test.
	var direct int64
	err = pool.QueryRow(context.Background(), `
		SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END), 0)
		  FROM ledger_entries WHERE merchant_id = $1 AND account_id = 'merchant_payable'
	`, merchantID).Scan(&direct)
	if err != nil {
		t.Fatalf("direct summation query: %v", err)
	}
	if int64(got) != direct {
		t.Errorf("RebuildMerchantBalance (%d) disagrees with direct summation (%d)", got, direct)
	}
}

func TestRebuildMerchantBalance_ZeroActivity(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool)

	got, err := RebuildMerchantBalance(context.Background(), pool, merchantID)
	if err != nil {
		t.Fatalf("RebuildMerchantBalance: %v", err)
	}
	if got != 0 {
		t.Errorf("RebuildMerchantBalance for a merchant with no ledger activity = %d, want 0", got)
	}
}

// FH: duplicate of the export test? delete one rebuild impl -- claude suggests keeping FromExport as "more authoritative"
func TestRebuildAllBalances_OverwritesDriftedCache(t *testing.T) {
	pool := mustPool(t)
	merchantID := insertActiveMerchant(t, pool)

	postLedgerLeg(t, pool, merchantID, "credit", 20000)
	postLedgerLeg(t, pool, merchantID, "debit", 500)
	wantBalance := int64(20000 - 500)

	// Seed a deliberately WRONG cached value, simulating drift (a crash
	// between CloseBatch and PayoutBatch, or any other cause) —
	// RebuildAllBalances must overwrite it with the true, ledger-derived
	// figure, not merely apply a delta.
	_, err := pool.Exec(context.Background(), `
		INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at)
		VALUES ($1, 999999, now())
	`, merchantID)
	if err != nil {
		t.Fatalf("seed drifted cache: %v", err)
	}

	diffs, err := RebuildAllBalances(context.Background(), pool)
	if err != nil {
		t.Fatalf("RebuildAllBalances: %v", err)
	}

	diff, ok := diffs[merchantID]
	if !ok {
		t.Fatalf("RebuildAllBalances did not return a diff for merchant %s", merchantID)
	}
	if diff.CachedBefore != 999999 {
		t.Errorf("diff.CachedBefore = %d, want 999999 (the drifted value)", diff.CachedBefore)
	}
	if int64(diff.Rebuilt) != wantBalance {
		t.Errorf("diff.Rebuilt = %d, want %d", diff.Rebuilt, wantBalance)
	}
	if !diff.Changed() {
		t.Error("diff.Changed() = false, want true (cached value was drifted)")
	}

	var persisted int64
	err = pool.QueryRow(context.Background(), `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id = $1`, merchantID).Scan(&persisted)
	if err != nil {
		t.Fatalf("query persisted balance: %v", err)
	}
	if persisted != wantBalance {
		t.Errorf("persisted cached_payable_fils = %d, want %d (RebuildAllBalances must overwrite, not merely diff)", persisted, wantBalance)
	}
}

// AUD-015 re-attack: concurrent rebuilds (e.g. two support users clicking the button, or the
// button during the CLI) that must INSERT overlapping new cache rows must not deadlock.
func TestRebuildAllBalances_ConcurrentRunsDoNotDeadlock(t *testing.T) {
	pool := mustPool(t)
	for i := 0; i < 40; i++ {
		postLedgerLeg(t, pool, insertActiveMerchant(t, pool), "credit", 1000+int64(i)) // no cache row yet
	}
	errs := make(chan error, 8)
	start := make(chan struct{})
	for i := 0; i < 8; i++ {
		go func() {
			<-start
			_, err := RebuildAllBalances(context.Background(), pool)
			errs <- err
		}()
	}
	close(start)
	for i := 0; i < 8; i++ {
		if err := <-errs; err != nil {
			t.Errorf("concurrent RebuildAllBalances failed: %v", err)
		}
	}
}

// Review follow-up (AUD-015): a merchant that has a cache row but no merchant_payable ledger rows
// rebuilds to 0, and a negative ledger balance is preserved (signed sum).
func TestRebuildAllBalances_CacheOnlyMerchantBecomesZero(t *testing.T) {
	pool := mustPool(t)
	m := insertActiveMerchant(t, pool)
	if _, err := pool.Exec(context.Background(), `INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at) VALUES ($1, 4242, now())`, m); err != nil {
		t.Fatal(err)
	}
	diffs, err := RebuildAllBalances(context.Background(), pool)
	if err != nil {
		t.Fatal(err)
	}
	d, ok := diffs[m]
	if !ok || d.CachedBefore != 4242 || d.Rebuilt != 0 || !d.Changed() {
		t.Fatalf("diff = %+v (present=%v), want before 4242 after 0 changed", d, ok)
	}
}

func TestRebuildAllBalances_NegativeBalanceIsPreserved(t *testing.T) {
	pool := mustPool(t)
	m := insertActiveMerchant(t, pool)
	postLedgerLeg(t, pool, m, "debit", 700) // payable debited with no credit: -700
	diffs, err := RebuildAllBalances(context.Background(), pool)
	if err != nil {
		t.Fatal(err)
	}
	if got := diffs[m].Rebuilt; got != -700 {
		t.Fatalf("rebuilt = %d, want -700", got)
	}
	var persisted int64
	if err := pool.QueryRow(context.Background(), `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id=$1`, m).Scan(&persisted); err != nil || persisted != -700 {
		t.Fatalf("persisted = %d (err %v), want -700", persisted, err)
	}
}

// AUD-049: `rebuild-balances --merchant` used to print the ledger sum and write nothing.
func TestRebuildOneMerchantBalance_WritesOnlyThatMerchant(t *testing.T) {
	pool := mustPool(t)
	target := insertActiveMerchant(t, pool)
	other := insertActiveMerchant(t, pool)

	postLedgerLeg(t, pool, target, "credit", 12000)
	postLedgerLeg(t, pool, target, "debit", 2000)
	postLedgerLeg(t, pool, other, "credit", 7000)
	for _, id := range []uuid.UUID{target, other} {
		if _, err := pool.Exec(context.Background(), `INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at) VALUES ($1, 999999, now())`, id); err != nil {
			t.Fatalf("seed drifted cache: %v", err)
		}
	}

	diff, err := RebuildOneMerchantBalance(context.Background(), pool, target)
	if err != nil {
		t.Fatalf("RebuildOneMerchantBalance: %v", err)
	}
	if diff.CachedBefore != 999999 || diff.Rebuilt != 10000 || !diff.Changed() {
		t.Errorf("diff = %+v, want before 999999, rebuilt 10000, changed", diff)
	}

	cache := func(id uuid.UUID) int64 {
		var v int64
		if err := pool.QueryRow(context.Background(), `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id = $1`, id).Scan(&v); err != nil {
			t.Fatalf("read cache: %v", err)
		}
		return v
	}
	if got := cache(target); got != 10000 {
		t.Errorf("target cache = %d, want 10000 (the --merchant rebuild must write it)", got)
	}
	if got := cache(other); got != 999999 {
		t.Errorf("other merchant cache = %d, want 999999 (must be untouched)", got)
	}
}

func TestRebuildOneMerchantBalance_CreatesMissingCacheRow(t *testing.T) {
	pool := mustPool(t)
	id := insertActiveMerchant(t, pool)
	postLedgerLeg(t, pool, id, "credit", 4200)

	diff, err := RebuildOneMerchantBalance(context.Background(), pool, id)
	if err != nil {
		t.Fatalf("RebuildOneMerchantBalance: %v", err)
	}
	if diff.CachedBefore != 0 || diff.Rebuilt != 4200 {
		t.Errorf("diff = %+v, want before 0, rebuilt 4200", diff)
	}
	var v int64
	if err := pool.QueryRow(context.Background(), `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id = $1`, id).Scan(&v); err != nil || v != 4200 {
		t.Errorf("cache row = %d (err %v), want 4200", v, err)
	}
}

func TestRebuildOneMerchantBalance_NoActivityGetsZeroRow_UnknownMerchantFails(t *testing.T) {
	pool := mustPool(t)
	id := insertActiveMerchant(t, pool)

	diff, err := RebuildOneMerchantBalance(context.Background(), pool, id)
	if err != nil {
		t.Fatalf("RebuildOneMerchantBalance: %v", err)
	}
	if diff.CachedBefore != 0 || diff.Rebuilt != 0 {
		t.Errorf("diff = %+v, want zero", diff)
	}
	var n int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM merchant_balances WHERE merchant_id = $1`, id).Scan(&n); err != nil || n != 1 {
		t.Errorf("cache rows = %d (err %v), want exactly 1", n, err)
	}

	// A merchant id that does not exist is an error (foreign key), not a silent success.
	if _, err := RebuildOneMerchantBalance(context.Background(), pool, uuid.New()); err == nil {
		t.Error("unknown merchant: want an error, got nil")
	}
}
