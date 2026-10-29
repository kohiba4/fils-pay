package settlement

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// resetPlatformStats puts the single counter row back at zero, mirroring
// what db/seed/generate.ts's own TRUNCATE + re-INSERT does on every seed.
func resetPlatformStats(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		UPDATE platform_stats SET total_processed_fils = 0, updated_at = now() WHERE id = 1
	`)
	if err != nil {
		t.Fatalf("resetPlatformStats: %v", err)
	}
}

// TestRecordPlatformProcessedVolume_SmallValuesExact proves the
// accumulator is wired correctly: three successive batch closes land on
// the exact integer sum of their gross figures.
func TestRecordPlatformProcessedVolume_SmallValuesExact(t *testing.T) {
	pool := mustPool(t)
	ctx := context.Background()
	resetPlatformStats(t, pool)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for _, gross := range []int64{1_000_000, 2_500_000, 47_500_000} {
		current, err := ReadAndLockPlatformProcessedFils(ctx, tx)
		if err != nil {
			t.Fatalf("ReadAndLockPlatformProcessedFils: %v", err)
		}
		if err := RecordPlatformProcessedVolume(ctx, tx, current, gross); err != nil {
			t.Fatalf("RecordPlatformProcessedVolume(%d): %v", gross, err)
		}
	}

	var got int64
	err = tx.QueryRow(ctx, `SELECT total_processed_fils FROM platform_stats WHERE id = 1`).Scan(&got)
	if err != nil {
		t.Fatalf("read back total: %v", err)
	}
	if got != 51_000_000 {
		t.Fatalf("total_processed_fils = %v, want exactly 51000000 (1000000 + 2500000 + 47500000)", got)
	}
}

// TestVolumeTierMdrBonusBps_BelowAndAtThreshold proves the tier comparison
// is correct on both sides of the threshold.
// MK: no test above the threshold, or near int32 max. TODO
func TestVolumeTierMdrBonusBps_BelowAndAtThreshold(t *testing.T) {
	if got := VolumeTierMdrBonusBps(0); got != 0 {
		t.Errorf("zero volume: got %d, want 0", got)
	}
	if got := VolumeTierMdrBonusBps(1_999_999_999); got != 0 {
		t.Errorf("just below threshold: got %d, want 0", got)
	}
	if got := VolumeTierMdrBonusBps(2_000_000_000); got != 15 {
		t.Errorf("exactly at threshold: got %d, want 15", got)
	}
}

// AUD-017: the lifetime counter is in FILS and must be 64-bit. int32 wraps at 2,147,483,647 fils
// (about 2.15M BD), only ~147M fils above the 2,000,000,000 tier threshold, and the column was INTEGER
// although two comments claimed BIGINT.
func TestVolumeTierMdrBonusBps_AboveInt32Max(t *testing.T) {
	if got := VolumeTierMdrBonusBps(3_000_000_000); got != 15 {
		t.Errorf("VolumeTierMdrBonusBps(3e9) = %d, want 15 (tier stays on above 2^31)", got)
	}
	if got := VolumeTierMdrBonusBps(1_999_999_999); got != 0 {
		t.Errorf("VolumeTierMdrBonusBps(1,999,999,999) = %d, want 0", got)
	}
}

func TestPlatformStatsCounterColumnIsBigint(t *testing.T) {
	pool := mustPool(t)
	var typ string
	if err := pool.QueryRow(context.Background(),
		`SELECT data_type FROM information_schema.columns WHERE table_name = 'platform_stats' AND column_name = 'total_processed_fils'`).Scan(&typ); err != nil {
		t.Fatal(err)
	}
	if typ != "bigint" {
		t.Errorf("platform_stats.total_processed_fils is %q, want bigint", typ)
	}
}
