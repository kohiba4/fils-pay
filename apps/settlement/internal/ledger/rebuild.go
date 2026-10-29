// Package ledger rebuilds merchant_balances from ledger_entries. Nothing
// runs it automatically — the incremental path is in internal/balances. It is
// used by the manual `rebuild-balances` CLI subcommand AND by the admin
// console's "Rebuild cached balances" button (/internal/rebuild-balances),
// which share RebuildAllBalances (ADR-0007).
package ledger

import (
	"context"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/filspay/settlement/internal/money"
)

// RebuildMerchantBalance READS merchantID's balance from ledger_entries and
// writes nothing. To refresh the cache for one merchant use
// RebuildOneMerchantBalance (AUD-049).
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
	return rebuildBalances(ctx, db, nil)
}

// RebuildOneMerchantBalance is RebuildAllBalances restricted to one merchant
// (`rebuild-balances --merchant`): same ledger source, same locking, and it
// writes the cache row (AUD-049: it used to print the ledger sum and write
// nothing). Other merchants' cache rows are not read or touched.
func RebuildOneMerchantBalance(ctx context.Context, db *pgxpool.Pool, merchantID uuid.UUID) (RebuildDiff, error) {
	diffs, err := rebuildBalances(ctx, db, &merchantID)
	if err != nil {
		return RebuildDiff{}, err
	}
	return diffs[merchantID], nil
}

// rebuildBalances is the one implementation behind both entry points; only == nil rebuilds every merchant.
func rebuildBalances(ctx context.Context, db *pgxpool.Pool, only *uuid.UUID) (map[uuid.UUID]RebuildDiff, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("ledger: rebuildBalances: begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// This transaction locks every cache row, so a clash with a long-running writer (a close, a CSV import
	// holding rows in another order) must fail fast with an error the admin can retry, not hang the
	// console or deadlock-abort the other writer unpredictably.
	if _, err := tx.Exec(ctx, `SET LOCAL lock_timeout = '10s'`); err != nil {
		return nil, fmt.Errorf("ledger: rebuildBalances: set lock_timeout: %w", err)
	}

	before := make(map[uuid.UUID]int64)
	rows, err := tx.Query(ctx, `
		SELECT merchant_id, cached_payable_fils FROM merchant_balances
		 WHERE ($1::uuid IS NULL OR merchant_id = $1) ORDER BY merchant_id FOR UPDATE
	`, only)
	if err != nil {
		return nil, fmt.Errorf("ledger: rebuildBalances: lock cached balances: %w", err)
	}
	for rows.Next() {
		var id uuid.UUID
		var cached int64
		if err := rows.Scan(&id, &cached); err != nil {
			rows.Close()
			return nil, fmt.Errorf("ledger: rebuildBalances: scan cached balance: %w", err)
		}
		before[id] = cached
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ledger: rebuildBalances: iterate cached balances: %w", err)
	}
	rows.Close()

	rebuilt := make(map[uuid.UUID]int64)
	rows, err = tx.Query(ctx, `
		SELECT merchant_id, SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END)
		  FROM ledger_entries
		 WHERE account_id = 'merchant_payable' AND ($1::uuid IS NULL OR merchant_id = $1)
		 GROUP BY merchant_id
	`, only)
	if err != nil {
		return nil, fmt.Errorf("ledger: rebuildBalances: aggregate ledger: %w", err)
	}
	for rows.Next() {
		var id uuid.UUID
		var net int64
		if err := rows.Scan(&id, &net); err != nil {
			rows.Close()
			return nil, fmt.Errorf("ledger: rebuildBalances: scan ledger total: %w", err)
		}
		rebuilt[id] = net
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ledger: rebuildBalances: iterate ledger totals: %w", err)
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

	if only != nil {
		// A merchant with neither a cache row nor ledger activity still gets its (zero) row.
		if _, ok := diffs[*only]; !ok {
			diffs[*only] = RebuildDiff{MerchantID: *only}
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
			return nil, fmt.Errorf("ledger: rebuildBalances: write rebuilt balances: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("ledger: rebuildBalances: commit: %w", err)
	}
	return diffs, nil
}
