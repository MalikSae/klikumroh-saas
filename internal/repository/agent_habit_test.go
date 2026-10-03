package repository_test

import (
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Habit tracker (2 Oct 2026), against real MySQL: logged and derived habits, "sumber" progress, and that a
// tenant never reads or writes another tenant's agent. setupProspectAudit removes the tenants afterwards
// (the habit tables cascade on agent/tenant delete).
func TestAgentHabit_LogDeriveAndTenantIsolation(t *testing.T) {
	e := setupProspectAudit(t)
	repo := repository.NewAgentHabitRepository(e.db)
	// Business day in WIB, the same zone the DB session uses for DATE().
	loc, err := time.LoadLocation(repository.BusinessTimeZone)
	if err != nil {
		t.Fatalf("load zone: %v", err)
	}
	today := time.Now().In(loc).Format("2006-01-02")

	has := func(days []repository.AgentHabitDay, key string) bool {
		for _, d := range days {
			if d.Key == key && d.Date == today {
				return true
			}
		}
		return false
	}

	// Logged habit, twice on the same day: one row.
	for i := 0; i < 2; i++ {
		if err := repo.LogHabit(e.ctx, e.tenantA.ID, e.agentA.ID, "share", today); err != nil {
			t.Fatalf("log share: %v", err)
		}
	}
	var rows int
	if err := e.db.QueryRow("SELECT COUNT(*) FROM agent_habit_logs WHERE tenant_id = ? AND agent_id = ?", e.tenantA.ID, e.agentA.ID).Scan(&rows); err != nil {
		t.Fatalf("count logs: %v", err)
	}
	if rows != 1 {
		t.Fatalf("expected 1 log row, got %d", rows)
	}

	// Derived habits: a status change and a note by the agent.
	p := e.newAgentProspect(t, "081355550001", 1)
	if _, err := e.db.Exec(`INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status)
		VALUES (?, ?, 'agent', ?, 'baru', 'dihubungi')`, e.tenantA.ID, p.ID, e.agentA.ID); err != nil {
		t.Fatalf("insert history: %v", err)
	}
	if _, err := e.db.Exec(`INSERT INTO prospect_notes (tenant_id, prospect_id, author_type, author_id, note_text)
		VALUES (?, ?, 'agent', ?, 'Sudah ditelepon')`, e.tenantA.ID, p.ID, e.agentA.ID); err != nil {
		t.Fatalf("insert note: %v", err)
	}

	days, err := repo.ListHabitDays(e.ctx, e.tenantA.ID, e.agentA.ID, today, today)
	if err != nil {
		t.Fatalf("list days: %v", err)
	}
	for _, key := range []string{"share", "contact", "note"} {
		if !has(days, key) {
			t.Fatalf("expected %q today, got %+v", key, days)
		}
	}

	// Tenant B with tenant A's agent id: writes nothing, reads nothing.
	if err := repo.LogHabit(e.ctx, e.tenantB.ID, e.agentA.ID, "caption", today); err != nil {
		t.Fatalf("cross-tenant log: %v", err)
	}
	if err := repo.SetSumberDone(e.ctx, e.tenantB.ID, e.agentA.ID, 5, true); err != nil {
		t.Fatalf("cross-tenant sumber: %v", err)
	}
	other, err := repo.ListHabitDays(e.ctx, e.tenantB.ID, e.agentA.ID, today, today)
	if err != nil {
		t.Fatalf("list tenant B: %v", err)
	}
	if len(other) != 0 {
		t.Fatalf("tenant B sees tenant A's habits: %+v", other)
	}
	if err := e.db.QueryRow("SELECT COUNT(*) FROM agent_habit_logs WHERE tenant_id = ?", e.tenantB.ID).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("tenant B got habit rows: %d (%v)", rows, err)
	}
	if ids, err := repo.ListSumberDone(e.ctx, e.tenantB.ID, e.agentA.ID); err != nil || len(ids) != 0 {
		t.Fatalf("tenant B sumber: %v (%v)", ids, err)
	}

	// Sumber progress for the right tenant: mark, list, unmark.
	if err := repo.SetSumberDone(e.ctx, e.tenantA.ID, e.agentA.ID, 7, true); err != nil {
		t.Fatalf("mark sumber: %v", err)
	}
	ids, err := repo.ListSumberDone(e.ctx, e.tenantA.ID, e.agentA.ID)
	if err != nil || len(ids) != 1 || ids[0] != 7 {
		t.Fatalf("expected sumber [7], got %v (%v)", ids, err)
	}
	if err := repo.SetSumberDone(e.ctx, e.tenantA.ID, e.agentA.ID, 7, false); err != nil {
		t.Fatalf("unmark sumber: %v", err)
	}
	if ids, _ := repo.ListSumberDone(e.ctx, e.tenantA.ID, e.agentA.ID); len(ids) != 0 {
		t.Fatalf("expected no sumber after unmark, got %v", ids)
	}
}
