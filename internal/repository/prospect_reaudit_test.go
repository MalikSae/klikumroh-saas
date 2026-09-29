package repository_test

import (
	"sync"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Regression tests for the prospect re-audit (R1, R2, R6, R7), run against real MySQL.

func today() string { return time.Now().Format("2006-01-02") }

// R1: a closing cancelled after DP no longer counts towards agent targets; a re-closed prospect counts once.
func TestReaudit_TargetProgressIgnoresCancelledClosing(t *testing.T) {
	e := setupProspectAudit(t)
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	targetRepo := repository.NewAgentTargetRepository(db)

	kept := e.newAgentProspect(t, "081333330001", 2)
	cancelled := e.newAgentProspect(t, "081333330002", 3)
	for _, p := range []*repository.Prospect{kept, cancelled} {
		if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
			t.Fatalf("closing: %v", err)
		}
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, cancelled.ID, 1, "jamaah batal"); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	progress, err := e.prospectRepo.GetAgentTargetProgress(e.ctx, e.tenantA.ID, e.agentA.ID, today(), today())
	if err != nil {
		t.Fatalf("target progress: %v", err)
	}
	if progress != 2 {
		t.Fatalf("expected only the kept closing (2 jamaah) to count, got %d", progress)
	}
	pax, err := targetRepo.GetAgentProgress(e.ctx, e.tenantA.ID, e.agentA.ID, "closing_pax", today(), today())
	if err != nil {
		t.Fatalf("agent target progress: %v", err)
	}
	if pax != 2 {
		t.Fatalf("expected agent target closing_pax 2, got %d", pax)
	}

	// Re-closing the cancelled prospect counts it once (not twice).
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, cancelled.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("re-closing: %v", err)
	}
	pax, _ = targetRepo.GetAgentProgress(e.ctx, e.tenantA.ID, e.agentA.ID, "closing_pax", today(), today())
	if pax != 5 {
		t.Fatalf("expected 2 + 3 = 5 jamaah after re-closing, got %d", pax)
	}
}

// R2: cancelling clears "lunas"; re-closing books held commission again instead of releasing it.
func TestReaudit_ReclosingAfterCancelHoldsAgain(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081333330003", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("paid off: %v", err)
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, p.ID, 1, "refund"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID)
	if got.PaidOffAt != nil {
		t.Fatalf("cancel must clear paid_off_at")
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("re-closing: %v", err)
	}
	released, held := sums(t, e)
	if held != 1000000 || released != 0 {
		t.Fatalf("re-closing must hold the new commission: expected released 0 / held 1.000.000, got %.0f / %.0f", released, held)
	}
}

// R6: once a closing is cancelled, nothing can be released for it any more.
func TestReaudit_NoReleaseAfterCancel(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081333330004", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, p.ID, 1, "batal"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	n, err := e.ledgerRepo.ReleaseByProspect(e.ctx, e.tenantA.ID, p.ID)
	if err != nil {
		t.Fatalf("release: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected no entries released for a cancelled closing, got %d", n)
	}
	if released, held := sums(t, e); released != 0 || held != 0 {
		t.Fatalf("expected 0 / 0, got %.0f / %.0f", released, held)
	}
}

// R7: simultaneous submissions of the same jamaah create exactly one prospect.
func TestReaudit_ConcurrentDuplicateSubmissionsCreateOne(t *testing.T) {
	e := setupProspectAudit(t)
	const n = 10
	var wg sync.WaitGroup
	errs := make([]error, n)
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, errs[i] = e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Jamaah Kembar", Phone: "081333330005"})
		}(i)
	}
	close(start)
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatalf("submission failed: %v", err)
		}
	}
	count, err := e.prospectRepo.CountWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{})
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 prospect for %d simultaneous submissions, got %d", n, count)
	}
}
