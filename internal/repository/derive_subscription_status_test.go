package repository_test

import (
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// M5: a travel past expiry + grace is "suspended" (same rule as util.IsTravelSuspended), within the
// grace period it is "expired".
func TestDeriveSubscriptionStatus_GracePeriod(t *testing.T) {
	now := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	at := func(d time.Duration) *time.Time { v := now.Add(d); return &v }
	day := 24 * time.Hour
	grace := time.Duration(util.SubscriptionGraceDays) * day

	cases := []struct {
		name    string
		isDemo  bool
		status  string
		hasPlan bool
		exp     *time.Time
		want    string
	}{
		{"active", false, "active", true, at(10 * day), "active"},
		{"expired yesterday (in grace)", false, "active", true, at(-day), "expired"},
		{"one second before grace end", false, "active", true, at(-grace + time.Second), "expired"},
		{"exactly at grace end", false, "active", true, at(-grace), "suspended"},
		{"expired 30 days ago", false, "active", true, at(-30 * day), "suspended"},
		{"inactive", false, "inactive", true, at(10 * day), "suspended"},
		{"pending stays pending", false, "pending", false, at(-30 * day), "pending"},
		{"demo stays demo", true, "active", true, at(-30 * day), "demo"},
		{"no plan, no expiry", false, "active", false, nil, "no_plan"},
	}
	for _, c := range cases {
		got := repository.DeriveSubscriptionStatus(c.isDemo, c.status, c.hasPlan, c.exp, now)
		if got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
		if c.want == "suspended" && !c.isDemo && c.status != "pending" && !util.IsTravelSuspended(c.status, c.exp, now) {
			t.Errorf("%s: derived suspended but util.IsTravelSuspended is false", c.name)
		}
	}
}
