package repository_test

import (
	"testing"

	"klikumroh/internal/repository"
)

// Habit streak badges (3 Oct 2026), against real MySQL: earned once, listed per agent, and never written
// or read across tenants. setupProspectAudit removes the tenants afterwards (badges cascade).
func TestAgentHabitBadges_AwardOnceAndTenantIsolation(t *testing.T) {
	e := setupProspectAudit(t)
	repo := repository.NewAgentHabitRepository(e.db)

	t.Run("first award is new, repeat is not", func(t *testing.T) {
		first, err := repo.AwardBadge(e.ctx, e.tenantA.ID, e.agentA.ID, 7)
		if err != nil || !first {
			t.Fatalf("first award: earned=%v err=%v", first, err)
		}
		again, err := repo.AwardBadge(e.ctx, e.tenantA.ID, e.agentA.ID, 7)
		if err != nil || again {
			t.Fatalf("repeat award: earned=%v err=%v", again, err)
		}
		if _, err := repo.AwardBadge(e.ctx, e.tenantA.ID, e.agentA.ID, 30); err != nil {
			t.Fatalf("award 30: %v", err)
		}
	})

	t.Run("list and top badge for own tenant", func(t *testing.T) {
		badges, err := repo.ListBadges(e.ctx, e.tenantA.ID, e.agentA.ID)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(badges) != 2 || badges[0].Days != 7 || badges[1].Days != 30 || badges[0].AchievedAt == "" {
			t.Fatalf("unexpected badges: %+v", badges)
		}
		top, err := repo.TopBadgeByAgent(e.ctx, e.tenantA.ID)
		if err != nil {
			t.Fatalf("top: %v", err)
		}
		if top[e.agentA.ID] != 30 {
			t.Fatalf("top badge = %d, want 30", top[e.agentA.ID])
		}
	})

	t.Run("other tenant cannot award or read", func(t *testing.T) {
		earned, err := repo.AwardBadge(e.ctx, e.tenantB.ID, e.agentA.ID, 100)
		if err != nil || earned {
			t.Fatalf("tenant B awarded to tenant A's agent: earned=%v err=%v", earned, err)
		}
		var n int
		if err := e.db.QueryRow("SELECT COUNT(*) FROM agent_habit_badges WHERE agent_id = ? AND days = 100", e.agentA.ID).Scan(&n); err != nil {
			t.Fatalf("count: %v", err)
		}
		if n != 0 {
			t.Fatalf("cross-tenant badge row written")
		}
		other, err := repo.ListBadges(e.ctx, e.tenantB.ID, e.agentA.ID)
		if err != nil || len(other) != 0 {
			t.Fatalf("tenant B sees tenant A's badges: %+v err=%v", other, err)
		}
		topB, err := repo.TopBadgeByAgent(e.ctx, e.tenantB.ID)
		if err != nil || len(topB) != 0 {
			t.Fatalf("tenant B top badges: %+v err=%v", topB, err)
		}
	})
}
