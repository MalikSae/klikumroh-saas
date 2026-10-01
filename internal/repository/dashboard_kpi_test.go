package repository_test

import (
	"testing"

	"klikumroh/internal/repository"
)

// Dashboard redesign (30 Sep 2026): the daily KPI series counts today's prospects and closings of the
// tenant only; a closing is counted with its jamaah, and another tenant sees none of it.
func TestDashboardOverview_KPIDailyIsTenantScoped(t *testing.T) {
	e := setupProspectAudit(t)
	repo := repository.NewDashboardOverviewRepository(e.db)

	p1 := e.newAgentProspect(t, "081377770001", 3)
	_ = e.newAgentProspect(t, "081377770002", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p1.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}

	sum := func(tenantID uint64) (prospects, closings, pax int) {
		raw, err := repo.GetOverview(e.ctx, tenantID)
		if err != nil {
			t.Fatalf("overview: %v", err)
		}
		for _, d := range raw.KPIDaily {
			prospects += d.Prospects
			closings += d.Closings
			pax += d.ClosingPax
		}
		return
	}
	if p, c, pax := sum(e.tenantA.ID); p != 2 || c != 1 || pax != 3 {
		t.Fatalf("tenant A: expected 2 prospects, 1 closing, 3 jamaah; got %d, %d, %d", p, c, pax)
	}
	if p, c, pax := sum(e.tenantB.ID); p != 0 || c != 0 || pax != 0 {
		t.Fatalf("tenant B must see nothing of tenant A: got %d, %d, %d", p, c, pax)
	}
}
