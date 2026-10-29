// Package ledger rebuilds merchant_balances from ledger_entries. Nothing
// automatic calls this — the incremental path is in internal/balances.
// This is for the manual `rebuild-balances` CLI subcommand.
package ledger

import (
	"context"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/filspay/settlement/internal/money"
)

// RebuildMerchantBalance recomputes merchantID's cached balance from
// ledger_entries. CLI-only; the incremental path is in internal/balances.
func RebuildMerchantBalance(ctx context.Context, db *pgxpool.Pool, merchantID uuid.UUID) (money.Fils, error) {
	var balance int64
	err := db.QueryRow(ctx, `
		SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END), 0)
		  FROM ledger_entries
		 WHERE merchant_id = $1 AND account_id = 'merchant_payable'
	`, merchantID).Scan(&balance)
	if err != nil {
		return 0, fmt.Errorf("ledger: RebuildMerchantBalance(%s): %w", merchantID, err)
	}
	return money.Fils(balance), nil
}

// RebuildDiff is the before/after state for one merchant, printed by the
// rebuild-balances CLI subcommand so an operator sees exactly what
// changed.
//
// Changed reports drift against the ledger: a false result means the cache
// already matched ledger_entries for that merchant.
type RebuildDiff struct {
	MerchantID   uuid.UUID
	CachedBefore money.Fils
	Rebuilt      money.Fils
}

// Changed reports whether the cached value differed from the rebuilt,
// authoritative one.
func (d RebuildDiff) Changed() bool {
	return d.CachedBefore != d.Rebuilt
}

// RebuildAllBalances recomputes every merchant's cached balance from
// ledger_entries (the authoritative record) and overwrites merchant_balances in
// one transaction. It is the single rebuild used by both the
// `rebuild-balances` CLI and the admin console's "Rebuild cached balances"
// button (AUD-015: the button used to sum scheme_export_lines instead).
//
// Existing cache rows are locked first (stable order), so a concurrent batch
// close/payout waits for the overwrite instead of interleaving with it, and the
// ledger is aggregated in ONE query rather than one query per merchant, which
// keeps the HTTP-triggered rebuild fast on a large ledger. Returns the full
// before/after map so callers can print exactly what changed.
func RebuildAllBalances(ctx context.Context, db *pgxpool.Pool) (map[uuid.UUID]RebuildDiff, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("ledger: RebuildAllBalances: begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	before := make(map[uuid.UUID]int64)
	rows, err := tx.Query(ctx, `
		SELECT merchant_id, cached_payable_fils FROM merchant_balances ORDER BY merchant_id FOR UPDATE
	`)
	if err != nil {
		return nil, fmt.Errorf("ledger: RebuildAllBalances: lock cached balances: %w", err)
	}
	for rows.Next() {
		var id uuid.UUID
		var cached int64
		if err := rows.Scan(&id, &cached); err != nil {
			rows.Close()
			return nil, fmt.Errorf("ledger: RebuildAllBalances: scan cached balance: %w", err)
		}
		before[id] = cached
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ledger: RebuildAllBalances: iterate cached balances: %w", err)
	}
	rows.Close()

	rebuilt := make(map[uuid.UUID]int64)
	rows, err = tx.Query(ctx, `
		SELECT merchant_id, SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END)
		  FROM ledger_entries
		 WHERE account_id = 'merchant_payable'
		 GROUP BY merchant_id
	`)
	if err != nil {
		return nil, fmt.Errorf("ledger: RebuildAllBalances: aggregate ledger: %w", err)
	}
	for rows.Next() {
		var id uuid.UUID
		var net int64
		if err := rows.Scan(&id, &net); err != nil {
			rows.Close()
			return nil, fmt.Errorf("ledger: RebuildAllBalances: scan ledger total: %w", err)
		}
		rebuilt[id] = net
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ledger: RebuildAllBalances: iterate ledger totals: %w", err)
	}
	rows.Close()

	// Every merchant that has a cache row OR ledger activity; a merchant present
	// only in the cache rebuilds to 0 (no payable entries).
	diffs := make(map[uuid.UUID]RebuildDiff, len(before)+len(rebuilt))
	for id, cached := range before {
		diffs[id] = RebuildDiff{MerchantID: id, CachedBefore: money.Fils(cached), Rebuilt: money.Fils(rebuilt[id])}
	}
	for id, net := range rebuilt {
		if _, seen := before[id]; !seen {
			diffs[id] = RebuildDiff{MerchantID: id, CachedBefore: 0, Rebuilt: money.Fils(net)}
		}
	}

	if len(diffs) > 0 {
		// Insert in a deterministic order so two overlapping rebuilds can never
		// take row locks in opposite orders (Go map iteration order is random).
		ids := make([]string, 0, len(diffs))
		for id := range diffs {
			ids = append(ids, id.String())
		}
		sort.Strings(ids)
		amounts := make([]int64, 0, len(ids))
		for _, idStr := range ids {
			amounts = append(amounts, int64(diffs[uuid.MustParse(idStr)].Rebuilt))
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at)
			SELECT t.merchant_id, t.amount, now()
			  FROM unnest($1::uuid[], $2::bigint[]) AS t(merchant_id, amount)
			ON CONFLICT (merchant_id) DO UPDATE
			  SET cached_payable_fils = EXCLUDED.cached_payable_fils, updated_at = now()
		`, ids, amounts)
		if err != nil {
			return nil, fmt.Errorf("ledger: RebuildAllBalances: write rebuilt balances: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("ledger: RebuildAllBalances: commit: %w", err)
	}
	return diffs, nil
}
