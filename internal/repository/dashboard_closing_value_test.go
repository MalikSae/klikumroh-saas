package repository_test

import (
	"testing"

	"klikumroh/internal/repository"
)

// Dashboard KPI series (3 Oct 2026), against real MySQL: a closing adds package price x jamaah to its
// day's estimated revenue, and another travel's series never includes it.
func TestDashboardOverview_ClosingValueAndTenantIsolation(t *testing.T) {
	e := setupProspectAudit(t)
	if _, err := e.db.Exec("UPDATE packages SET price = 30000000 WHERE tenant_id = ? AND id = ?", e.tenantA.ID, e.pkgA.ID); err != nil {
		t.Fatalf("set price: %v", err)
	}
	p := e.newAgentProspect(t, "081388880001", 2)
	if _, err := e.db.Exec("UPDATE prospects SET status = 'closing' WHERE tenant_id = ? AND id = ?", e.tenantA.ID, p.ID); err != nil {
		t.Fatalf("close prospect: %v", err)
	}
	if _, err := e.db.Exec(`INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status)
		VALUES (?, ?, 'admin', 1, 'tertarik', 'closing')`, e.tenantA.ID, p.ID); err != nil {
		t.Fatalf("insert history: %v", err)
	}
	repo := repository.NewDashboardOverviewRepository(e.db)

	sum := func(tenantID uint64) (pax int, value float64) {
		raw, err := repo.GetOverview(e.ctx, tenantID)
		if err != nil {
			t.Fatalf("overview: %v", err)
		}
		for _, d := range raw.KPIDaily {
			pax += d.ClosingPax
			value += d.ClosingValue
		}
		return pax, value
	}

	t.Run("own travel counts the closing value", func(t *testing.T) {
		pax, value := sum(e.tenantA.ID)
		if pax != 2 || value != 60000000 {
			t.Fatalf("pax=%d value=%.0f, want 2 and 60000000", pax, value)
		}
	})

	t.Run("other travel does not", func(t *testing.T) {
		pax, value := sum(e.tenantB.ID)
		if pax != 0 || value != 0 {
			t.Fatalf("tenant B sees tenant A's closing: pax=%d value=%.0f", pax, value)
		}
	})
}
