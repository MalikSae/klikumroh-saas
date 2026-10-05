package repository_test

import (
	"errors"
	"strings"
	"testing"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Closing = DP. Commission is held until "Tandai Lunas" (default policy), released at DP when the
// travel chooses so, and reversed by "Batalkan Closing" (keputusan pendiri 29 Sep 2026).

func sums(t *testing.T, e *prospectAuditEnv) (released, held float64) {
	t.Helper()
	var err error
	if released, err = e.ledgerRepo.SumReleasedByAgent(e.ctx, e.tenantA.ID, e.agentA.ID); err != nil {
		t.Fatalf("sum released: %v", err)
	}
	if held, err = e.ledgerRepo.SumHeldByAgent(e.ctx, e.tenantA.ID, e.agentA.ID); err != nil {
		t.Fatalf("sum held: %v", err)
	}
	return released, held
}

func TestCommissionHold_DefaultHoldsUntilPaidOff(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081322220001", 2)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if released, held := sums(t, e); released != 0 || held != 2000000 {
		t.Fatalf("after closing (DP): expected released 0 / held 2.000.000, got %.0f / %.0f", released, held)
	}

	if err := e.svc.MarkPaidOff(e.ctx, e.tenantB.ID, p.ID, 1); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B must not mark tenant A's jamaah as paid off, got %v", err)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("mark paid off: %v", err)
	}
	if released, held := sums(t, e); released != 2000000 || held != 0 {
		t.Fatalf("after lunas: expected released 2.000.000 / held 0, got %.0f / %.0f", released, held)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, p.ID, 1); !errors.Is(err, service.ErrProspectAlreadyPaidOff) {
		t.Fatalf("second mark paid off: expected ErrProspectAlreadyPaidOff, got %v", err)
	}

	open := e.newAgentProspect(t, "081322220002", 1)
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, open.ID, 1); !errors.Is(err, service.ErrProspectNotClosing) {
		t.Fatalf("mark paid off on open prospect: expected ErrProspectNotClosing, got %v", err)
	}
}

// A previous "Tandai Lunas" that set paid_off_at but failed before releasing the commission must be
// retryable: the retry releases the held commission instead of answering "already paid off".
func TestCommissionHold_MarkPaidOffRetryReleasesHeld(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081322220011", 2)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	// Simulate the half-done first attempt: lunas mark written, release never ran.
	if err := e.prospectRepo.MarkPaidOff(e.ctx, e.tenantA.ID, p.ID); err != nil {
		t.Fatalf("repo mark paid off: %v", err)
	}
	if released, held := sums(t, e); released != 0 || held != 2000000 {
		t.Fatalf("precondition: expected released 0 / held 2.000.000, got %.0f / %.0f", released, held)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantB.ID, p.ID, 1); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B must not retry tenant A's lunas, got %v", err)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("retry mark paid off: expected success, got %v", err)
	}
	if released, held := sums(t, e); released != 2000000 || held != 0 {
		t.Fatalf("after retry: expected released 2.000.000 / held 0, got %.0f / %.0f", released, held)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, p.ID, 1); !errors.Is(err, service.ErrProspectAlreadyPaidOff) {
		t.Fatalf("third call: expected ErrProspectAlreadyPaidOff, got %v", err)
	}
}

func TestCommissionHold_ReleaseAtDPPolicy(t *testing.T) {
	e := setupProspectAudit(t)
	if err := e.svc.SetCommissionReleaseOn(e.ctx, e.tenantA.ID, "dp"); err != nil {
		t.Fatalf("set policy: %v", err)
	}
	if err := e.svc.SetCommissionReleaseOn(e.ctx, e.tenantA.ID, "besok"); !errors.Is(err, service.ErrInvalidReleasePolicy) {
		t.Fatalf("expected ErrInvalidReleasePolicy, got %v", err)
	}
	if v, _ := e.svc.GetCommissionReleaseOn(e.ctx, e.tenantB.ID); v != "lunas" {
		t.Fatalf("tenant B policy must stay default 'lunas', got %q", v)
	}
	p := e.newAgentProspect(t, "081322220003", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if released, held := sums(t, e); released != 1000000 || held != 0 {
		t.Fatalf("policy dp: expected released 1.000.000 / held 0, got %.0f / %.0f", released, held)
	}
}

func TestCommissionHold_CancelClosing(t *testing.T) {
	e := setupProspectAudit(t)

	// Cancelled before lunas: held commission is reversed, nothing to deduct later.
	held := e.newAgentProspect(t, "081322220004", 2)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, held.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, held.ID, 1, "  "); !errors.Is(err, service.ErrCancelReasonRequired) {
		t.Fatalf("expected ErrCancelReasonRequired, got %v", err)
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantB.ID, held.ID, 1, "visa ditolak"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B must not cancel tenant A's closing, got %v", err)
	}
	res, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, held.ID, 1, "visa ditolak")
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if res.ReversedHeld != 2000000 || res.ReversedReleased != 0 {
		t.Fatalf("unexpected reversal %+v", res)
	}
	if released, h := sums(t, e); released != 0 || h != 0 {
		t.Fatalf("after cancel before lunas: expected 0 / 0, got %.0f / %.0f", released, h)
	}
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, held.ID)
	if got.Status != "tidak_lanjut" || got.LostReason == nil || !strings.HasPrefix(*got.LostReason, "Batal setelah DP: visa ditolak") {
		t.Fatalf("expected tidak_lanjut with cancel reason, got %s %v", got.Status, got.LostReason)
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, held.ID, 1, "lagi"); !errors.Is(err, service.ErrProspectNotClosing) {
		t.Fatalf("second cancel: expected ErrProspectNotClosing, got %v", err)
	}

	// Cancelled after lunas (refund): released commission becomes a negative withdrawable entry that is
	// offset against the agent's next commission.
	paid := e.newAgentProspect(t, "081322220005", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, paid.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, paid.ID, 1); err != nil {
		t.Fatalf("paid off: %v", err)
	}
	res, err = e.svc.CancelClosing(e.ctx, e.tenantA.ID, paid.ID, 1, "refund sakit")
	if err != nil {
		t.Fatalf("cancel after lunas: %v", err)
	}
	if res.ReversedReleased != 1000000 {
		t.Fatalf("expected Rp 1.000.000 reversed from released commission, got %+v", res)
	}
	next := e.newAgentProspect(t, "081322220006", 2)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, next.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing next: %v", err)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, next.ID, 1); err != nil {
		t.Fatalf("paid off next: %v", err)
	}
	if released, _ := sums(t, e); released != 2000000 {
		// 1.000.000 (paid) - 1.000.000 (refund) + 2.000.000 (next) = 2.000.000
		t.Fatalf("expected refund offset: released 2.000.000, got %.0f", released)
	}

	funnel, err := e.prospectRepo.GetAgentFunnelSummary(e.ctx, e.tenantA.ID, e.agentA.ID)
	if err != nil {
		t.Fatalf("funnel: %v", err)
	}
	if funnel.Batal != 2 || funnel.Closing != 1 {
		t.Fatalf("expected funnel batal 2 / closing 1, got %+v", funnel)
	}
}
