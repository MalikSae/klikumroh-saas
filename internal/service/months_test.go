package service

import (
	"testing"
	"time"
)

func TestAddMonthsClamped(t *testing.T) {
	wib := jakartaLocation
	cases := []struct {
		name string
		in   time.Time
		n    int
		want time.Time
	}{
		{"31 Aug + 6 -> 28 Feb (non-leap)", time.Date(2026, 8, 31, 14, 30, 5, 0, wib), 6, time.Date(2027, 2, 28, 14, 30, 5, 0, wib)},
		{"31 Aug + 6 -> 29 Feb (leap)", time.Date(2027, 8, 31, 9, 0, 0, 0, wib), 6, time.Date(2028, 2, 29, 9, 0, 0, 0, wib)},
		{"30 Nov + 3 -> 28 Feb", time.Date(2026, 11, 30, 23, 59, 59, 0, wib), 3, time.Date(2027, 2, 28, 23, 59, 59, 0, wib)},
		// 30 Nov 00:00 UTC is 30 Nov 07:00 WIB: the WIB date decides, result 29 Feb 07:00 WIB.
		{"30 Nov + 3 -> 29 Feb (leap, UTC input)", time.Date(2027, 11, 30, 0, 0, 0, 0, time.UTC), 3, time.Date(2028, 2, 29, 7, 0, 0, 0, wib)},
		{"31 Jan + 1 -> 28 Feb", time.Date(2026, 1, 31, 8, 0, 0, 0, wib), 1, time.Date(2026, 2, 28, 8, 0, 0, 0, wib)},
		{"15 Mar + 1 -> 15 Apr", time.Date(2026, 3, 15, 10, 0, 0, 0, wib), 1, time.Date(2026, 4, 15, 10, 0, 0, 0, wib)},
		{"31 Dec + 12 -> 31 Dec", time.Date(2026, 12, 31, 10, 0, 0, 0, wib), 12, time.Date(2027, 12, 31, 10, 0, 0, 0, wib)},
	}
	for _, c := range cases {
		got := addMonthsClamped(c.in, c.n)
		if !got.Equal(c.want) || got.Location() != jakartaLocation {
			t.Errorf("%s: got %v, want %v (in WIB)", c.name, got, c.want)
		}
	}
}

// M4: on a UTC server, a base time taken from time.Now() is a UTC instant. The months must still be added
// on the WIB calendar, matching dashboard addMonthsClampedWIB.
func TestAddMonthsClamped_WIBOnUTCServer(t *testing.T) {
	withProcessZone(t, time.UTC)

	// 31 Oct 2026 02:00 WIB = 30 Oct 19:00 UTC. +1 month on the WIB calendar = 30 Nov 02:00 WIB
	// (31 Nov does not exist). The old UTC arithmetic gave 30 Nov 19:00 UTC = 1 Dec 02:00 WIB.
	base := time.Date(2026, 10, 30, 19, 0, 0, 0, time.UTC)
	got := addMonthsClamped(base, 1)
	want := time.Date(2026, 11, 30, 2, 0, 0, 0, jakartaLocation)
	if !got.Equal(want) {
		t.Fatalf("got %v, want %v", got, want)
	}

	// 31 Jan 01:00 WIB = 30 Jan 18:00 UTC, +1 month = 28 Feb 01:00 WIB (not 28 Feb 18:00 UTC = 1 Mar WIB).
	got = addMonthsClamped(time.Date(2026, 1, 30, 18, 0, 0, 0, time.UTC), 1)
	want = time.Date(2026, 2, 28, 1, 0, 0, 0, jakartaLocation)
	if !got.Equal(want) {
		t.Fatalf("got %v, want %v", got, want)
	}

	// time.Now() on the UTC process: the result is in WIB and its WIB date is today's WIB date + n months.
	now := time.Now()
	res := addMonthsClamped(now, 12)
	if res.Location() != jakartaLocation {
		t.Fatalf("result must be in WIB, got %v", res.Location())
	}
	nw := now.In(jakartaLocation)
	if res.Year() != nw.Year()+1 || res.Month() != nw.Month() {
		t.Fatalf("12 months from %v gave %v", nw, res)
	}
}
