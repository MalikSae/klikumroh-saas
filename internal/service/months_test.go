package service

import (
	"testing"
	"time"
)

func TestAddMonthsClamped(t *testing.T) {
	wib := time.FixedZone("WIB", 7*3600)
	cases := []struct {
		name string
		in   time.Time
		n    int
		want time.Time
	}{
		{"31 Aug + 6 -> 28 Feb (non-leap)", time.Date(2026, 8, 31, 14, 30, 5, 0, wib), 6, time.Date(2027, 2, 28, 14, 30, 5, 0, wib)},
		{"31 Aug + 6 -> 29 Feb (leap)", time.Date(2027, 8, 31, 9, 0, 0, 0, wib), 6, time.Date(2028, 2, 29, 9, 0, 0, 0, wib)},
		{"30 Nov + 3 -> 28 Feb", time.Date(2026, 11, 30, 23, 59, 59, 0, wib), 3, time.Date(2027, 2, 28, 23, 59, 59, 0, wib)},
		{"30 Nov + 3 -> 29 Feb (leap)", time.Date(2027, 11, 30, 0, 0, 0, 0, time.UTC), 3, time.Date(2028, 2, 29, 0, 0, 0, 0, time.UTC)},
		{"31 Jan + 1 -> 28 Feb", time.Date(2026, 1, 31, 8, 0, 0, 0, wib), 1, time.Date(2026, 2, 28, 8, 0, 0, 0, wib)},
		{"15 Mar + 1 -> 15 Apr", time.Date(2026, 3, 15, 10, 0, 0, 0, wib), 1, time.Date(2026, 4, 15, 10, 0, 0, 0, wib)},
		{"31 Dec + 12 -> 31 Dec", time.Date(2026, 12, 31, 10, 0, 0, 0, wib), 12, time.Date(2027, 12, 31, 10, 0, 0, 0, wib)},
	}
	for _, c := range cases {
		got := addMonthsClamped(c.in, c.n)
		if !got.Equal(c.want) || got.Location() != c.want.Location() {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
