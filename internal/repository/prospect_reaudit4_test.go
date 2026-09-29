package repository_test

import (
	"errors"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Regression tests for the fourth prospect re-audit (T1, T3, T4, T5), run against real MySQL.

// T1: a prospect whose planned month is already in the past can still be edited.
func TestReaudit4_EditKeepsPastDeparturePlan(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081377770001", 1)
	past := "2025-01"
	p.DeparturePlan = &past
	if err := e.prospectRepo.Update(e.ctx, e.tenantA.ID, p); err != nil {
		t.Fatalf("seed past plan: %v", err)
	}

	// Unchanged past month: allowed.
	if err := e.svc.UpdateDetail(e.ctx, e.tenantA.ID, p.ID, 1, service.UpdateProspectInput{Name: "Nama Baru", Phone: "081377770001", DeparturePlan: &past}); err != nil {
		t.Fatalf("editing a prospect with an unchanged past plan must work, got %v", err)
	}
	// Picking a new past month: still refused.
	other := "2025-02"
	if err := e.svc.UpdateDetail(e.ctx, e.tenantA.ID, p.ID, 1, service.UpdateProspectInput{Name: "Nama Baru", Phone: "081377770001", DeparturePlan: &other}); !errors.Is(err, service.ErrInvalidDeparturePlan) {
		t.Fatalf("a newly chosen past month must be refused, got %v", err)
	}
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID)
	if got.Name != "Nama Baru" || got.DeparturePlan == nil || *got.DeparturePlan != past {
		t.Fatalf("expected name updated and plan kept, got %s %v", got.Name, got.DeparturePlan)
	}
}

// T3: agent manual input records consent and refuses without it.
func TestReaudit4_AgentManualConsent(t *testing.T) {
	e := setupProspectAudit(t)
	if _, err := e.svc.CreateManualByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, service.AgentCreateProspectInput{Name: "Tanpa Konfirmasi", Phone: "081377770002"}); !errors.Is(err, service.ErrAgentConsentRequired) {
		t.Fatalf("expected ErrAgentConsentRequired, got %v", err)
	}
	p, err := e.svc.CreateManualByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, service.AgentCreateProspectInput{Consent: true, Name: "Dengan Konfirmasi", Phone: "081377770003"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID)
	if got.ConsentAt == nil {
		t.Fatalf("consent_at must be recorded for agent manual input")
	}
}

// T4: filter by planned month / "none", search by domicile; T5: lost-reason summary.
func TestReaudit4_DepartureFilterDomicileSearchLostSummary(t *testing.T) {
	e := setupProspectAudit(t)
	month := time.Now().AddDate(0, 3, 0).Format("2006-01")
	bdg, sby := "Bandung", "Surabaya"
	mk := func(name, phone string, plan *string, city *string) *repository.Prospect {
		p, err := e.svc.CreateManualByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, service.AgentCreateProspectInput{Consent: true, Name: name, Phone: phone, DeparturePlan: plan, Domicile: city})
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		return p
	}
	a := mk("Des Bandung", "081377770010", &month, &bdg)
	b := mk("Tanpa Rencana", "081377770011", nil, &sby)
	mk("Des Surabaya", "081377770012", &month, &sby)

	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{DeparturePlan: &month})
	if len(list) != 2 {
		t.Fatalf("expected 2 prospects departing %s, got %d", month, len(list))
	}
	none := "none"
	list, _ = e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{DeparturePlan: &none})
	if len(list) != 1 || list[0].ID != b.ID {
		t.Fatalf("expected only the prospect without plan, got %+v", list)
	}
	q := "bandung"
	list, _ = e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{Search: &q})
	if len(list) != 1 || list[0].ID != a.ID {
		t.Fatalf("expected domicile search to find Bandung only, got %+v", list)
	}
	if list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantB.ID, repository.ProspectFilter{DeparturePlan: &month}); len(list) != 0 {
		t.Fatalf("CRITICAL: tenant B must not see tenant A prospects, got %d", len(list))
	}

	harga, jadwal := "harga", "jadwal"
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, a.ID, 1, "tidak_lanjut", nil, &harga); err != nil {
		t.Fatalf("tidak_lanjut a: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, b.ID, 1, "tidak_lanjut", nil, &jadwal); err != nil {
		t.Fatalf("tidak_lanjut b: %v", err)
	}
	sum, err := e.prospectRepo.StatusSummary(e.ctx, e.tenantA.ID)
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if sum.LostReasons["harga"] != 1 || sum.LostReasons["jadwal"] != 1 {
		t.Fatalf("expected harga 1 and jadwal 1, got %v", sum.LostReasons)
	}
	if other, _ := e.prospectRepo.StatusSummary(e.ctx, e.tenantB.ID); len(other.LostReasons) != 0 {
		t.Fatalf("CRITICAL: tenant B summary must not include tenant A reasons, got %v", other.LostReasons)
	}
}
