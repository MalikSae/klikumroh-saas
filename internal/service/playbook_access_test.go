package service

import "testing"

func TestCanAccessPlaybook(t *testing.T) {
	period := func(m int) *int { return &m }

	cases := []struct {
		name string
		info *TenantSubscriptionInfo
		want bool
	}{
		{"nil info", nil, false},
		{"12 month active", &TenantSubscriptionInfo{IsActive: true, CurrentPlanPeriod: period(12)}, true},
		{"longer than 12 active", &TenantSubscriptionInfo{IsActive: true, CurrentPlanPeriod: period(24)}, true},
		{"6 month active", &TenantSubscriptionInfo{IsActive: true, CurrentPlanPeriod: period(6)}, false},
		{"3 month active", &TenantSubscriptionInfo{IsActive: true, CurrentPlanPeriod: period(3)}, false},
		{"12 month expired, inside grace period", &TenantSubscriptionInfo{IsActive: false, IsSubscriptionExpired: true, GracePeriodDaysRemaining: 3, CurrentPlanPeriod: period(12)}, false},
		{"12 month expired, suspended", &TenantSubscriptionInfo{IsActive: false, IsSuspended: true, CurrentPlanPeriod: period(12)}, false},
		{"active without a plan", &TenantSubscriptionInfo{IsActive: true}, false},
		{"demo travel without plan", &TenantSubscriptionInfo{IsDemo: true}, true},
		{"demo travel on 3 months", &TenantSubscriptionInfo{IsDemo: true, IsActive: true, CurrentPlanPeriod: period(3)}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := CanAccessPlaybook(tc.info); got != tc.want {
				t.Fatalf("CanAccessPlaybook = %v, want %v", got, tc.want)
			}
		})
	}
}
