package repository_test

import (
	"testing"

	"klikumroh/internal/repository"
)

// The admin agent detail shows the closing jamaah of an inactive/pending agent too (the leaderboard
// stats only cover active agents). Tenant B never sees tenant A's agent.
func TestAgentClosingJamaah_InactiveAgentAndTenantScope(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081377780001", 3)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	e.newAgentProspect(t, "081377780002", 2) // not closing: not counted
	if _, err := e.db.Exec("UPDATE agents SET status = 'inactive' WHERE tenant_id = ? AND id = ?", e.tenantA.ID, e.agentA.ID); err != nil {
		t.Fatalf("deactivate agent: %v", err)
	}

	n, err := e.prospectRepo.GetAgentClosingJamaah(e.ctx, e.tenantA.ID, e.agentA.ID)
	if err != nil || n != 3 {
		t.Fatalf("inactive agent: expected 3 closing jamaah, got %d (%v)", n, err)
	}
	if n, err := e.prospectRepo.GetAgentClosingJamaah(e.ctx, e.tenantB.ID, e.agentA.ID); err != nil || n != 0 {
		t.Fatalf("CRITICAL: tenant B must see 0 of tenant A's agent, got %d (%v)", n, err)
	}
}

// A blank email never clears an agent's stored email (it is the agent's login), and tenant B cannot
// update tenant A's agent.
func TestAgentUpdateProfile_BlankEmailKept(t *testing.T) {
	e := setupProspectAudit(t)
	agentRepo := repository.NewAgentRepository(e.db)
	email := "agen-keep@klikumroh.test"
	if _, err := agentRepo.UpdateProfile(e.ctx, e.tenantA.ID, e.agentA.ID, repository.UpdateAgentProfileParams{Email: &email}); err != nil {
		t.Fatalf("set email: %v", err)
	}
	blank := ""
	// The call also renames the agent so the row really changes (the test DSN has no clientFoundRows).
	n1 := "Agen Keep 1"
	if _, err := agentRepo.UpdateProfile(e.ctx, e.tenantA.ID, e.agentA.ID, repository.UpdateAgentProfileParams{Email: &blank, Name: &n1}); err != nil {
		t.Fatalf("blank email: %v", err)
	}
	if a, _ := agentRepo.GetByID(e.ctx, e.tenantA.ID, e.agentA.ID); a.Email == nil || *a.Email != email {
		t.Fatalf("a blank email must keep the stored email, got %v", a.Email)
	}
	if _, err := agentRepo.UpdateProfile(e.ctx, e.tenantB.ID, e.agentA.ID, repository.UpdateAgentProfileParams{Name: &n1}); err == nil {
		t.Fatalf("CRITICAL: tenant B updated tenant A's agent")
	}
}
