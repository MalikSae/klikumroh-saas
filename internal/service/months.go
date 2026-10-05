package service

import "time"

// addMonthsClamped adds n calendar months to t and clamps the day to the last day of the target month,
// keeping the time of day and location. time.AddDate normalises overflow instead (31 Aug + 6 months =
// "31 Feb" = 3 Mar), which would hand out a subscription period a few days longer than paid for.
func addMonthsClamped(t time.Time, n int) time.Time {
	y, m, d := t.Date()
	first := time.Date(y, m+time.Month(n), 1, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
	lastDay := first.AddDate(0, 1, -1).Day()
	if d > lastDay {
		d = lastDay
	}
	return time.Date(first.Year(), first.Month(), d, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
}
