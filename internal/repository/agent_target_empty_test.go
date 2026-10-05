package repository_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// A travel without active agents opens a target: the progress must be "rows": [] (not null), or the
// dashboard target drawer crashes on [...p.rows] (bug hunt 5 Oct 2026).
func TestAgentTarget_ProgressWithoutAgentsIsEmptyArray(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	targetRepo := repository.NewAgentTargetRepository(db)
	tenant := createDummyTenant(t, ctx, tenantRepo, "target-empty")

	target := &repository.AgentTarget{
		Title: strPtr("Target tanpa agen"), MetricType: "closing_pax", MetricValue: 5,
		PeriodStart: "2026-10-01", PeriodEnd: "2026-10-31", Status: "active",
	}
	if err := targetRepo.Create(ctx, tenant.ID, target); err != nil {
		t.Fatalf("create target: %v", err)
	}
	t.Cleanup(func() { _ = targetRepo.Delete(context.Background(), tenant.ID, target.ID) })

	rows, err := targetRepo.ListAgentProgress(ctx, tenant.ID, target.ID)
	if err != nil {
		t.Fatalf("ListAgentProgress: %v", err)
	}
	if rows == nil || len(rows) != 0 {
		t.Fatalf("repository must return an empty non-nil slice, got %#v", rows)
	}

	svc := service.NewAgentTargetService(targetRepo, repository.NewAgentRepository(db))
	res, err := svc.GetTargetProgress(ctx, tenant.ID, target.ID)
	if err != nil {
		t.Fatalf("GetTargetProgress: %v", err)
	}
	b, _ := json.Marshal(res)
	if !strings.Contains(string(b), `"rows":[]`) {
		t.Fatalf(`progress JSON must contain "rows":[], got %s`, b)
	}
}
