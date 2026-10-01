package repository_test

import (
	"testing"

	"klikumroh/internal/repository"
)

// Agent redesign (30 Sep 2026): the agent performance list counts only the tenant's own agents,
// prospects and clicks; tenant B sees none of tenant A's agent funnel.
func TestAgentPerformance_TenantScoped(t *testing.T) {
	e := setupProspectAudit(t)
	repo := repository.NewAgentPerformanceRepository(e.db)

	p1 := e.newAgentProspect(t, "081388880001", 4)
	_ = e.newAgentProspect(t, "081388880002", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p1.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if _, err := e.db.Exec("INSERT INTO referral_clicks (tenant_id, agent_id, ip_address, clicked_at) VALUES (?, ?, '198.51.100.9', NOW()), (?, ?, '198.51.100.10', NOW())", e.tenantA.ID, e.agentA.ID, e.tenantA.ID, e.agentA.ID); err != nil {
		t.Fatalf("clicks: %v", err)
	}

	listA, err := repo.ListByTenant(e.ctx, e.tenantA.ID)
	if err != nil {
		t.Fatalf("list A: %v", err)
	}
	if len(listA) != 1 {
		t.Fatalf("tenant A: expected 1 agent, got %d", len(listA))
	}
	a := listA[0]
	if a.AgentID != e.agentA.ID || a.Clicks != 2 || a.Clicks30d != 2 || a.Baru != 1 || a.Closing != 1 || a.ClosingJamaah != 4 || a.CommissionEarn != 4000000 {
		t.Fatalf("tenant A funnel wrong: %+v", a)
	}
	listB, err := repo.ListByTenant(e.ctx, e.tenantB.ID)
	if err != nil {
		t.Fatalf("list B: %v", err)
	}
	if len(listB) != 0 {
		t.Fatalf("tenant B must not see tenant A's agents, got %+v", listB)
	}
}
