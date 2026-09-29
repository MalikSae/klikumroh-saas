package util

import "time"

// SubscriptionGraceDays is how long a travel keeps full service after its subscription expires
// (keputusan pendiri 29 Sep 2026). After it the travel is suspended: public site off, dashboard and
// agent portal read-only. Single source of truth for every check below and in SQL queries.
const SubscriptionGraceDays = 7

// SubscriptionGraceEnd is the moment a subscription ending at expiresAt becomes suspended.
func SubscriptionGraceEnd(expiresAt time.Time) time.Time {
	return expiresAt.AddDate(0, 0, SubscriptionGraceDays)
}

// IsTravelSuspended reports whether a travel's service is off: deactivated, or expired past the grace
// period. A travel without an expiry date (legacy) is never suspended by date.
func IsTravelSuspended(status string, expiresAt *time.Time, now time.Time) bool {
	if status == "inactive" {
		return true
	}
	return expiresAt != nil && !SubscriptionGraceEnd(*expiresAt).After(now)
}
