package repository_test

import (
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Dashboard agent summary (3 Oct 2026), against real MySQL: prospect counts per agent and the summary
// (registered / active / productive / top) only ever include the travel's own agents.
func TestAgentInsight_CountsAndTenantIsolation(t *testing.T) {
	e := setupProspectAudit(t)
	habitRepo := repository.NewAgentHabitRepository(e.db)
	prospectRepo := repository.NewProspectRepository(e.db)
	svc := service.NewAgentInsightService(repository.NewAgentRepository(e.db), prospectRepo, habitRepo)

	e.newAgentProspect(t, "081377770001", 1)
	e.newAgentProspect(t, "081377770002", 2)
	since := time.Now().AddDate(0, 0, -30).Format("2006-01-02 15:04:05")

	t.Run("prospect counts of own travel", func(t *testing.T) {
		counts, err := prospectRepo.GetAgentProspectCountsSince(e.ctx, e.tenantA.ID, since)
		if err != nil {
			t.Fatalf("counts: %v", err)
		}
		if len(counts) != 1 || counts[0].AgentID != e.agentA.ID || counts[0].Count != 2 {
			t.Fatalf("unexpected counts: %+v", counts)
		}
	})

	t.Run("prospect counts of other travel are empty", func(t *testing.T) {
		counts, err := prospectRepo.GetAgentProspectCountsSince(e.ctx, e.tenantB.ID, since)
		if err != nil || len(counts) != 0 {
			t.Fatalf("tenant B sees tenant A's prospects: %+v err=%v", counts, err)
		}
	})

	t.Run("summary of own travel", func(t *testing.T) {
		s, err := svc.Summary(e.ctx, e.tenantA.ID)
		if err != nil {
			t.Fatalf("summary: %v", err)
		}
		if s.Registered != 1 || s.Productive30 != 1 || s.Prospects30 != 2 || s.Active7 != 0 {
			t.Fatalf("unexpected summary: %+v", s)
		}
		if len(s.Top) != 1 || s.Top[0].AgentID != e.agentA.ID || s.Top[0].Prospects30 != 2 {
			t.Fatalf("unexpected top: %+v", s.Top)
		}
	})

	t.Run("summary of other travel has none of them", func(t *testing.T) {
		s, err := svc.Summary(e.ctx, e.tenantB.ID)
		if err != nil {
			t.Fatalf("summary B: %v", err)
		}
		if s.Productive30 != 0 || s.Prospects30 != 0 || len(s.Top) != 0 {
			t.Fatalf("tenant B summary leaks tenant A: %+v", s)
		}
	})
}
