package repository_test

import (
	"errors"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Travel dashboard view of the agents' daily syiar (3 Oct 2026), against real MySQL: the overview and
// the per-agent report show a travel only its own agents. setupProspectAudit removes the tenants afterwards.
func TestAgentHabitDashboard_TenantIsolation(t *testing.T) {
	e := setupProspectAudit(t)
	habitRepo := repository.NewAgentHabitRepository(e.db)
	svc := service.NewAgentHabitService(repository.NewAgentRepository(e.db), habitRepo, nil)

	loc, err := time.LoadLocation(repository.BusinessTimeZone)
	if err != nil {
		t.Fatalf("load zone: %v", err)
	}
	today := time.Now().In(loc).Format("2006-01-02")
	for _, k := range []string{"share", "contact", "caption"} {
		if err := habitRepo.LogHabit(e.ctx, e.tenantA.ID, e.agentA.ID, k, today); err != nil {
			t.Fatalf("log %s: %v", k, err)
		}
	}

	t.Run("overview of own travel has the agent", func(t *testing.T) {
		rows, err := svc.TenantOverview(e.ctx, e.tenantA.ID)
		if err != nil {
			t.Fatalf("overview: %v", err)
		}
		if len(rows) != 1 || rows[0].AgentID != e.agentA.ID || rows[0].ActiveDays7 != 1 {
			t.Fatalf("unexpected overview: %+v", rows)
		}
	})

	t.Run("overview of other travel is empty", func(t *testing.T) {
		rows, err := svc.TenantOverview(e.ctx, e.tenantB.ID)
		if err != nil {
			t.Fatalf("overview B: %v", err)
		}
		if len(rows) != 0 {
			t.Fatalf("tenant B sees tenant A's agents: %+v", rows)
		}
		raw, err := habitRepo.ListTenantHabitDays(e.ctx, e.tenantB.ID, today, today)
		if err != nil || len(raw) != 0 {
			t.Fatalf("tenant B raw days: %+v err=%v", raw, err)
		}
	})

	t.Run("report of own agent", func(t *testing.T) {
		rep, err := svc.AgentReport(e.ctx, e.tenantA.ID, e.agentA.ID)
		if err != nil {
			t.Fatalf("report: %v", err)
		}
		if rep.Counts30["share"] != 1 || rep.Counts30["note"] != 0 || rep.ActiveDays30 != 1 || rep.Streak != 1 {
			t.Fatalf("unexpected report: counts=%v active30=%d streak=%d", rep.Counts30, rep.ActiveDays30, rep.Streak)
		}
	})

	t.Run("report of other travel's agent is not found", func(t *testing.T) {
		if _, err := svc.AgentReport(e.ctx, e.tenantB.ID, e.agentA.ID); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("want ErrNotFound, got %v", err)
		}
	})
}
