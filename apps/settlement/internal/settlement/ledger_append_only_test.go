package settlement

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// AUD-034: migration 0007 claims ledger entries are immutable ("an edited or removed leg unbalances its
// group and the commit is rejected"). That is false for any change that keeps a group balanced, e.g.
// deleting BOTH legs of a group: the deferred trigger sums an empty group to zero and lets it commit.
func seedBalancedGroup(t *testing.T) (merchantID, groupID uuid.UUID) {
	t.Helper()
	pool := mustPool(t)
	merchantID = insertActiveMerchant(t, pool, 250)
	groupID = uuid.New()
	if _, err := pool.Exec(context.Background(), `
		INSERT INTO ledger_entries (entry_group_id, merchant_id, account_id, direction, amount_fils, occurred_at, description)
		VALUES ($1, $2, 'card_scheme_clearing', 'debit',  5000, $3, 'append-only test'),
		       ($1, $2, 'merchant_payable',     'credit', 5000, $3, 'append-only test')`,
		groupID, merchantID, time.Now()); err != nil {
		t.Fatalf("seed balanced group: %v", err)
	}
	return merchantID, groupID
}

func TestLedgerEntriesCannotBeDeleted(t *testing.T) {
	pool := mustPool(t)
	_, groupID := seedBalancedGroup(t)
	if _, err := pool.Exec(context.Background(), `DELETE FROM ledger_entries WHERE entry_group_id = $1`, groupID); err == nil {
		t.Fatal("deleting a whole balanced ledger group succeeded; the ledger must be append-only")
	}
	var n int
	_ = pool.QueryRow(context.Background(), `SELECT count(*) FROM ledger_entries WHERE entry_group_id = $1`, groupID).Scan(&n)
	if n != 2 {
		t.Errorf("legs left = %d, want 2", n)
	}
}

func TestLedgerEntriesCannotBeUpdated(t *testing.T) {
	pool := mustPool(t)
	_, groupID := seedBalancedGroup(t)
	// A change that keeps the group balanced: shift both legs by the same amount.
	if _, err := pool.Exec(context.Background(), `UPDATE ledger_entries SET amount_fils = 9000 WHERE entry_group_id = $1`, groupID); err == nil {
		t.Fatal("rewriting the amounts of a balanced ledger group succeeded; the ledger must be append-only")
	}
	if _, err := pool.Exec(context.Background(), `UPDATE ledger_entries SET description = 'edited' WHERE entry_group_id = $1`, groupID); err == nil {
		t.Fatal("editing a ledger leg succeeded; the ledger must be append-only")
	}
}

// New balanced groups must still be insertable, and an unbalanced insert must still be rejected at commit.
func TestLedgerStillAcceptsBalancedInsertsAndRejectsUnbalanced(t *testing.T) {
	pool := mustPool(t)
	_, _ = seedBalancedGroup(t) // a balanced insert works
	merchantID := insertActiveMerchant(t, pool, 250)
	_, err := pool.Exec(context.Background(), `
		INSERT INTO ledger_entries (entry_group_id, merchant_id, account_id, direction, amount_fils, occurred_at, description)
		VALUES ($1, $2, 'merchant_payable', 'credit', 100, now(), 'unbalanced')`, uuid.New(), merchantID)
	if err == nil {
		t.Fatal("an unbalanced ledger group was accepted")
	}
}
