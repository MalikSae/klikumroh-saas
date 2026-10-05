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

// A re-closed prospect counts on its latest move into closing (like targets, leaderboard and the CSV),
// not on its first one: a first closing 70 days ago followed by a re-closing today is today's closing.
func TestDashboardOverview_KPIDailyUsesLatestClosing(t *testing.T) {
	e := setupProspectAudit(t)
	repo := repository.NewDashboardOverviewRepository(e.db)

	p := e.newAgentProspect(t, "081377770011", 2)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if _, err := e.db.Exec(`UPDATE prospect_status_history SET changed_at = DATE_SUB(NOW(), INTERVAL 70 DAY)
		WHERE tenant_id = ? AND prospect_id = ? AND new_status = 'closing'`, e.tenantA.ID, p.ID); err != nil {
		t.Fatalf("backdate first closing: %v", err)
	}
	if _, err := e.db.Exec(`INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status)
		VALUES (?, ?, 'admin', 1, 'tertarik', 'closing')`, e.tenantA.ID, p.ID); err != nil {
		t.Fatalf("insert re-closing: %v", err)
	}

	raw, err := repo.GetOverview(e.ctx, e.tenantA.ID)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	closings, pax := 0, 0
	for _, d := range raw.KPIDaily {
		closings += d.Closings
		pax += d.ClosingPax
	}
	if closings != 1 || pax != 2 {
		t.Fatalf("expected the re-closing inside the 60-day series (1 closing, 2 jamaah), got %d, %d", closings, pax)
	}
}
