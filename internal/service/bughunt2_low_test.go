package service

import (
	"context"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Bug hunt 2, group B (5 Oct 2026): backend LOW fixes that need no database.

// Every set/reset/change password path counts the length without surrounding spaces (so blank or
// space-padded passwords are refused) but never trims the stored value: login compares it raw.
func TestPasswordLongEnough(t *testing.T) {
	cases := map[string]bool{
		"rahasia1":    true,
		"rahasia1 ":   true, // accepted, and stored WITH the trailing space
		" rahasia1":   true,
		"1234567 ":    false, // 7 real characters padded to 8
		"        ":    false, // only spaces
		"":            false,
		"   abc   de": true, // inner spaces count
	}
	for pw, want := range cases {
		if got := passwordLongEnough(pw); got != want {
			t.Errorf("passwordLongEnough(%q) = %v, want %v", pw, got, want)
		}
	}
}

type fakePlans struct {
	repository.PricingPlanRepository
	plans []repository.PricingPlan
}

func (f *fakePlans) List(ctx context.Context) ([]repository.PricingPlan, error) { return f.plans, nil }

// Two plans share the name "Premium" (1 and 12 months). MRR must use each tenant's own plan by id,
// not whichever "Premium" was listed last.
func TestPlatformOverview_MRRUsesPlanIDNotName(t *testing.T) {
	name := "Premium"
	monthlyID, yearlyID := uint64(1), uint64(2)
	plans := &fakePlans{plans: []repository.PricingPlan{
		{ID: monthlyID, Name: name, PeriodMonths: 1, Price: 300000},
		{ID: yearlyID, Name: name, PeriodMonths: 12, Price: 2400000},
	}}
	staff := &fakeStaffTenants{items: []repository.StaffTenantItem{
		{ID: 1, Status: "active", SubscriptionStatus: "active", CurrentPlan: &name, PlanName: &name, CurrentPlanID: &monthlyID},
		{ID: 2, Status: "active", SubscriptionStatus: "active", CurrentPlan: &name, PlanName: &name, CurrentPlanID: &monthlyID},
	}}
	svc := NewStaffService(staff, nil, nil, plans, nil, nil, nil, nil)
	m, err := svc.GetPlatformOverview(context.Background())
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	// Keyed by name the yearly plan (listed last) would win: 2 x 200,000 = 400,000.
	if m.EstimatedMRR != 600000 {
		t.Fatalf("EstimatedMRR = %.0f, want 600000 (2 x 300,000 monthly plan)", m.EstimatedMRR)
	}
}

// CSV export filenames and the demo seed use the WIB date; TodayWIB must match Asia/Jakarta.
func TestTodayWIBIsJakartaDate(t *testing.T) {
	before := time.Now().UTC().Add(7 * time.Hour).Format("2006-01-02")
	got := TodayWIB()
	after := time.Now().UTC().Add(7 * time.Hour).Format("2006-01-02")
	if got != before && got != after {
		t.Fatalf("TodayWIB() = %q, want the UTC+7 date %q", got, before)
	}
}
