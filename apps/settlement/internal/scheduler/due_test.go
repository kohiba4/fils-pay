package scheduler

import (
	"testing"
	"time"
)

// AUD-025: the daily close is due DaemonRunDelayMinutes after Asia/Bahrain midnight (UTC+3). The old
// code took "today" from the UTC calendar date, so between 00:00 and 03:00 Bahrain time it still
// thought it was the previous day: the close of day D ran at ~03:00-03:15 Bahrain, not 00:15.
func TestDueBusinessDate(t *testing.T) {
	utc := func(y int, mo time.Month, d, h, mi int) time.Time { return time.Date(y, mo, d, h, mi, 0, 0, time.UTC) }
	cases := []struct {
		name     string
		now      time.Time
		wantDue  bool
		wantDate string // the business day to close (Asia/Bahrain calendar date)
	}{
		{"23:59 Bahrain on the 29th: still the 29th, closes the 28th (idempotent catch-up)", utc(2026, 10, 29, 20, 59), true, "2026-10-28"},
		{"00:05 Bahrain on the 30th: grace period of 15 min not over yet", utc(2026, 10, 29, 21, 5), false, ""},
		{"exactly 00:15 Bahrain on the 30th: due, close the 29th", utc(2026, 10, 29, 21, 15), true, "2026-10-29"},
		{"00:20 Bahrain on the 30th: due, close the 29th (old code closed the 28th)", utc(2026, 10, 29, 21, 20), true, "2026-10-29"},
		{"01:00 Bahrain on the 30th", utc(2026, 10, 29, 22, 0), true, "2026-10-29"},
		{"03:00 Bahrain = 00:00 UTC on the 30th: still closes the 29th", utc(2026, 10, 30, 0, 0), true, "2026-10-29"},
		{"month boundary: 00:20 Bahrain on 1 Nov closes 31 Oct", utc(2026, 10, 31, 21, 20), true, "2026-10-31"},
		{"year boundary: 00:20 Bahrain on 1 Jan closes 31 Dec", utc(2026, 12, 31, 21, 20), true, "2026-12-31"},
		{"leap day: 00:20 Bahrain on 1 Mar 2028 closes 29 Feb", utc(2028, 2, 29, 21, 20), true, "2028-02-29"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			date, due := dueBusinessDate(tc.now, 15)
			if due != tc.wantDue {
				t.Fatalf("due = %v, want %v", due, tc.wantDue)
			}
			if due {
				if got := date.Format("2006-01-02"); got != tc.wantDate {
					t.Errorf("business date = %s, want %s", got, tc.wantDate)
				}
			}
		})
	}
}
