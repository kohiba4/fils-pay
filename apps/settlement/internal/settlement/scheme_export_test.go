package settlement

import (
	"context"
	"reflect"
	"regexp"
	"sort"
	"testing"
	"time"

	"github.com/filspay/settlement/internal/money"
)

var twoDecimalPlaces = regexp.MustCompile(`^\d+\.\d{2}$`)

// TestSchemeExportAmountHasTwoDecimals pins the acquirer-format promise
// scheme_export_lines.amount carries: every line handed to the clearing
// file is quoted in BD at exactly the two decimal places the scheme
// accepts — no third digit, no bare integer, no trailing-zero loss.
// The regex alone is not enough: 4747 fils must export as "4.74" (truncated, ADR-0002), not "4.75" (AUD-010).
func TestSchemeExportAmountHasTwoDecimals(t *testing.T) {
	pool := mustPool(t)
	const mdrBps = 250
	merchantID := insertActiveMerchant(t, pool, mdrBps)
	businessDate := time.Date(2026, 3, 24, 0, 0, 0, 0, time.UTC)
	start, _ := BusinessDayWindow(businessDate)

	for i, amount := range []money.Fils{4747, 1005, 4740, 12344} {
		insertCaptureEvent(t, pool, merchantID, mdrBps, amount, start.Add(time.Duration(i+1)*time.Hour))
	}

	result, err := CloseBatch(context.Background(), pool, merchantID, businessDate)
	if err != nil {
		t.Fatalf("CloseBatch: %v", err)
	}

	lines, err := LoadSchemeExportLines(context.Background(), pool, result.BatchID)
	if err != nil {
		t.Fatalf("LoadSchemeExportLines: %v", err)
	}
	if len(lines) != 4 {
		t.Fatalf("expected 4 exported lines, got %d", len(lines))
	}
	for _, line := range lines {
		if !twoDecimalPlaces.MatchString(line.Amount) {
			t.Errorf("line %d amount = %q, want exactly two decimal places", line.LineSequence, line.Amount)
		}
	}
	// Exact values: truncated to 10 fils (4747->4.74, 1005->1.00, 4740->4.74, 12344->12.34), never rounded up.
	// (Line order follows the random transaction uuid, so compare as a sorted set.)
	var got []string
	for _, line := range lines {
		got = append(got, line.Amount)
	}
	sort.Strings(got)
	want := []string{"1.00", "12.34", "4.74", "4.74"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("exported amounts = %v, want %v", got, want)
	}
}
