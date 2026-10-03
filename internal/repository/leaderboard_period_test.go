package repository_test

import (
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Leaderboard periods (2 Oct 2026): GetActiveAgentsClosingStatsSince counts only closings from the period
// start and never sees another tenant's agents. Runs against real MySQL; setupProspectAudit cleans up.
func TestLeaderboardPeriod_ClosingStatsSince(t *testing.T) {
	e := setupProspectAudit(t)

	// Closing this month: 2 jamaah.
	recent := e.newAgentProspect(t, "081344440001", 2)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, recent.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing recent: %v", err)
	}
	// Closing 70 days ago: 3 jamaah (its status history row is moved back in time).
	old := e.newAgentProspect(t, "081344440002", 3)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, old.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing old: %v", err)
	}
	if _, err := e.db.Exec(
		"UPDATE prospect_status_history SET changed_at = NOW() - INTERVAL 70 DAY WHERE tenant_id = ? AND prospect_id = ? AND new_status = 'closing'",
		e.tenantA.ID, old.ID,
	); err != nil {
		t.Fatalf("backdate history: %v", err)
	}

	totalFor := func(stats []repository.AgentClosingStat, agentID uint64) (int, bool) {
		for _, s := range stats {
			if s.AgentID == agentID {
				return s.TotalJamaah, true
			}
		}
		return 0, false
	}

	// Start of a period 30 days back covers the recent closing only.
	since := time.Now().AddDate(0, 0, -30).Format("2006-01-02 15:04:05")
	stats, err := e.prospectRepo.GetActiveAgentsClosingStatsSince(e.ctx, e.tenantA.ID, since)
	if err != nil {
		t.Fatalf("stats since: %v", err)
	}
	if got, ok := totalFor(stats, e.agentA.ID); !ok || got != 2 {
		t.Fatalf("period total: expected 2 jamaah, got %d (found=%v)", got, ok)
	}

	// All time still counts both closings.
	all, err := e.prospectRepo.GetActiveAgentsClosingStats(e.ctx, e.tenantA.ID)
	if err != nil {
		t.Fatalf("stats all: %v", err)
	}
	if got, _ := totalFor(all, e.agentA.ID); got != 5 {
		t.Fatalf("all-time total: expected 5 jamaah, got %d", got)
	}

	// Tenant isolation: tenant B never lists tenant A's agent.
	other, err := e.prospectRepo.GetActiveAgentsClosingStatsSince(e.ctx, e.tenantB.ID, "2000-01-01 00:00:00")
	if err != nil {
		t.Fatalf("stats tenant B: %v", err)
	}
	if _, ok := totalFor(other, e.agentA.ID); ok {
		t.Fatalf("tenant B leaderboard contains tenant A's agent")
	}
}
