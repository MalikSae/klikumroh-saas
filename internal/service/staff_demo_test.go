package service

import (
	"context"
	"testing"

	"klikumroh/internal/repository"
)

// fakeStaffTenants returns a fixed tenant list (only ListAllTenants is used by GetPlatformOverview).
type fakeStaffTenants struct {
	repository.StaffRepository
	items []repository.StaffTenantItem
}

func (f *fakeStaffTenants) ListAllTenants(ctx context.Context, statusFilter ...string) ([]repository.StaffTenantItem, error) {
	return f.items, nil
}

// The demo travel (demo.klikumroh.id) is a showcase: it never counts as a travel in the platform metrics.
func TestPlatformOverview_LeavesOutDemoTravel(t *testing.T) {
	staff := &fakeStaffTenants{items: []repository.StaffTenantItem{
		{ID: 1, Name: "Travel A", Status: "active", SubscriptionStatus: "active"},
		{ID: 2, Name: "Travel B", Status: "pending", SubscriptionStatus: "pending"},
		{ID: 3, Name: "Mabrur Tours", Status: "active", SubscriptionStatus: "demo", IsDemo: true},
	}}
	svc := NewStaffService(staff, nil, nil, nil, nil, nil, nil, nil)
	m, err := svc.GetPlatformOverview(context.Background())
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if m.TotalTenants != 2 || m.ActiveTenants != 1 || m.PendingTenants != 1 {
		t.Fatalf("total=%d active=%d pending=%d, want 2, 1, 1 (demo left out)", m.TotalTenants, m.ActiveTenants, m.PendingTenants)
	}
}
