package internalapi

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
)

// AUD-015: the admin "Rebuild cached balances" endpoint must rebuild from the ledger
// (the same source as the `settlement rebuild-balances` CLI), not from the
// scheme-export lines. Here the two sources DISAGREE on purpose: the ledger says
// 10,000 (a 12,000 capture minus a 2,000 payout) while the batch's scheme line says 12,000.
func TestRebuildBalances_UsesLedgerNotSchemeExport(t *testing.T) {
	pool := mustPool(t)
	server := newTestServer(t, pool)
	ctx := context.Background()

	merchantID := insertActiveMerchant(t, pool)
	insertCaptureEvent(t, pool, merchantID, 12000, time.Date(2026, 4, 13, 9, 0, 0, 0, time.UTC))

	// A 2,000 payout leg pair: payable debit / cash credit. Ledger payable is now 10,000.
	if _, err := pool.Exec(ctx, `
		INSERT INTO ledger_entries (entry_group_id, merchant_id, account_id, direction, amount_fils, occurred_at, description)
		VALUES ($1, $2, 'merchant_payable', 'debit', 2000, now(), 'payout'),
		       ($1, $2, 'platform_cash',    'credit', 2000, now(), 'payout')
	`, uuid.New(), merchantID); err != nil {
		t.Fatalf("seed payout legs: %v", err)
	}

	// The scheme-export view (what the old button read) says 12,000.
	var batchID uuid.UUID
	if err := pool.QueryRow(ctx, `
		INSERT INTO settlement_batches (merchant_id, batch_date, status, gross_fils, fee_fils, net_payout_fils, closed_at)
		VALUES ($1, '2026-04-13', 'closed', 12000, 0, 12000, now()) RETURNING id
	`, merchantID).Scan(&batchID); err != nil {
		t.Fatalf("seed batch: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO scheme_export_lines (settlement_batch_id, transaction_id, amount_fils, line_sequence)
		SELECT $1, id, 12000, 1 FROM transactions WHERE merchant_id = $2 LIMIT 1
	`, batchID, merchantID); err != nil {
		t.Fatalf("seed scheme line: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at) VALUES ($1, 999999, now())
		ON CONFLICT (merchant_id) DO UPDATE SET cached_payable_fils = 999999
	`, merchantID); err != nil {
		t.Fatalf("seed drifted cache: %v", err)
	}

	resp := post(t, server, "/internal/rebuild-balances", "Bearer "+testToken, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var diffs map[string]rebuildDiffResponse
	decodeJSON(t, resp, &diffs)

	diff, ok := diffs[merchantID.String()]
	if !ok {
		t.Fatalf("no diff entry for merchant %s", merchantID)
	}
	if diff.Before != 999999 {
		t.Errorf("before = %d, want 999999", diff.Before)
	}
	if diff.After != 10000 {
		t.Errorf("after = %d, want 10000 (ledger payable); the scheme-export total is 12000", diff.After)
	}
	var persisted int64
	if err := pool.QueryRow(ctx, `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id = $1`, merchantID).Scan(&persisted); err != nil {
		t.Fatal(err)
	}
	if persisted != 10000 {
		t.Errorf("persisted cached_payable_fils = %d, want 10000", persisted)
	}
}
