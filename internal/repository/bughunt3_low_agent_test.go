package repository_test

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Bug hunt round 3 (LOW), run against real MySQL on the override env (upline U -> downline D, override
// 10%, package commission Rp1.000.000):
//   - a reduction after the release policy switched dp -> lunas is withdrawable-negative at once, so the
//     agent cannot withdraw the old (higher) amount;
//   - the upline's history hides the downline's prospect and the admin's free-text reason on corrections;
//   - a cancelled closing keeps its system reason "batal_setelah_dp";
//   - anonymizing scrubs the ledger notes; every step is refused for another tenant.
func TestBugHunt3_CorrectionsCancelAnonymize(t *testing.T) {
	e := setupOverrideCorrection(t, "bh3-corr")
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := e.ctx
	other := createDummyTenant(t, ctx, e.tenantRepo, "bh3-corr-b")

	e.svc.SetCommissionPolicyRepo(repository.NewCommissionPolicyRepository(db))
	if err := e.svc.SetCommissionReleaseOn(ctx, e.tenant.ID, repository.CommissionReleaseOnDP); err != nil {
		t.Fatal(err)
	}
	e.setJamaah(t, e.prospect, 2)
	if err := e.svc.UpdateStatus(ctx, e.tenant.ID, e.prospect.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if err := e.svc.SetCommissionReleaseOn(ctx, e.tenant.ID, repository.CommissionReleaseOnLunas); err != nil {
		t.Fatal(err)
	}
	e.setJamaah(t, e.prospect, 1)

	released := func(agentID uint64) float64 {
		v, err := e.ledgerRepo.SumReleasedByAgent(ctx, e.tenant.ID, agentID)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	held := func(agentID uint64) float64 {
		v, err := e.ledgerRepo.SumHeldByAgent(ctx, e.tenant.ID, agentID)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	if got := released(e.downline.ID); !approxEq(got, 1000000) {
		t.Fatalf("downline withdrawable after reduction = %.2f, want 1000000 (not the old 2000000)", got)
	}
	if got := held(e.downline.ID); !approxEq(got, 0) {
		t.Fatalf("downline held = %.2f, want 0", got)
	}
	if got := released(e.upline.ID); !approxEq(got, 100000) {
		t.Fatalf("upline withdrawable after reduction = %.2f, want 100000", got)
	}

	// The upline's own history: override and correction rows of D's prospect carry no prospect id and no
	// free-text reason. D's own correction keeps both.
	agentSvc := service.NewAgentService(e.agentRepo, repository.NewAgentSessionRepository(db), e.tenantRepo, e.ledgerRepo,
		repository.NewProspectRepository(db), repository.NewCommissionPayoutRequestRepository(db), nil, nil, nil)
	upHist, err := agentSvc.GetCommissionHistory(ctx, e.tenant.ID, e.upline.ID)
	if err != nil {
		t.Fatalf("upline history: %v", err)
	}
	corrections := 0
	for _, it := range upHist {
		if it.Source != "ledger" {
			continue
		}
		if it.ProspectID != 0 {
			t.Fatalf("upline sees downline prospect id on %s row: %+v", it.Type, it)
		}
		if it.Type == "correction" {
			corrections++
			if it.Description != "Koreksi komisi override dari jaringan Anda" || strings.Contains(it.Description, "Jumlah jamaah") {
				t.Fatalf("upline sees the admin's reason: %q", it.Description)
			}
		}
	}
	if corrections == 0 {
		t.Fatalf("expected the upline's correction rows in its history")
	}
	downHist, err := agentSvc.GetCommissionHistory(ctx, e.tenant.ID, e.downline.ID)
	if err != nil {
		t.Fatalf("downline history: %v", err)
	}
	ownCorrection := false
	for _, it := range downHist {
		if it.Type == "correction" && it.ProspectID == e.prospect.ID && strings.Contains(it.Description, "Jumlah jamaah menjadi 1") {
			ownCorrection = true
		}
	}
	if !ownCorrection {
		t.Fatalf("downline must still see its own correction with reason: %+v", downHist)
	}
	if _, err := agentSvc.GetCommissionHistory(ctx, other.ID, e.upline.ID); err == nil {
		t.Fatalf("CRITICAL: another tenant must not read the upline's history")
	}

	// Cancel the closing: the system reason cannot be replaced by a normal category.
	if _, err := e.svc.CancelClosing(ctx, e.tenant.ID, e.prospect.ID, e.adminID, "Bu Siti Aminah batal berangkat"); err != nil {
		t.Fatalf("cancel closing: %v", err)
	}
	harga := "harga"
	if err := e.svc.UpdateStatus(ctx, e.tenant.ID, e.prospect.ID, e.adminID, "tidak_lanjut", nil, &harga); !errors.Is(err, service.ErrLostReasonSystemCategory) {
		t.Fatalf("overwriting batal_setelah_dp: expected ErrLostReasonSystemCategory, got %v", err)
	}
	if err := e.svc.UpdateStatus(ctx, other.ID, e.prospect.ID, e.adminID, "tidak_lanjut", nil, &harga); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: another tenant updating the prospect: expected ErrNotFound, got %v", err)
	}

	// Anonymize: the ledger keeps its amounts, the free text (with the jamaah's name) is gone.
	if err := e.svc.Anonymize(ctx, other.ID, e.prospect.ID, e.adminID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: another tenant anonymizing: expected ErrNotFound, got %v", err)
	}
	before, _ := e.ledgerRepo.ListByProspect(ctx, e.tenant.ID, e.prospect.ID)
	if err := e.svc.Anonymize(ctx, e.tenant.ID, e.prospect.ID, e.adminID); err != nil {
		t.Fatalf("anonymize: %v", err)
	}
	after, err := e.ledgerRepo.ListByProspect(ctx, e.tenant.ID, e.prospect.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != len(before) {
		t.Fatalf("ledger rows changed: %d -> %d", len(before), len(after))
	}
	sawCancel := false
	for _, l := range after {
		if l.Notes == nil {
			continue
		}
		if strings.Contains(*l.Notes, "Siti") || strings.Contains(*l.Notes, "Jumlah jamaah") {
			t.Fatalf("ledger note still holds free text after anonymize: %q", *l.Notes)
		}
		if *l.Notes == repository.AnonymizedCancelNote {
			sawCancel = true
		}
	}
	if !sawCancel {
		t.Fatalf("cancel rows must keep the 'Pembatalan closing: ' marker")
	}
	// Notes on an anonymized prospect: a conflict, never a server error.
	if _, err := e.svc.AddNote(ctx, e.tenant.ID, e.prospect.ID, e.adminID, "catatan"); !errors.Is(err, service.ErrProspectAnonymized) {
		t.Fatalf("note on anonymized prospect: expected ErrProspectAnonymized, got %v", err)
	}
}

// Referral codes of agents that are not active: no click is recorded and the code cannot be used as the
// upline at sign-up. Also: saving unchanged bank details is not an error, and re-marking a "sumber"
// source that is already marked earns nothing.
func TestBugHunt3_InactiveReferralBankInfoSumber(t *testing.T) {
	e := setupOverrideCorrection(t, "bh3-ref")
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := e.ctx
	other := createDummyTenant(t, ctx, e.tenantRepo, "bh3-ref-b")

	if err := e.svc.RecordReferralClick(ctx, e.tenant.ID, e.upline.ReferralCode, "10.1.2.3"); err != nil {
		t.Fatalf("click for active agent: %v", err)
	}
	if err := e.svc.RecordReferralClick(ctx, other.ID, e.upline.ReferralCode, "10.1.2.4"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: click under another tenant: expected ErrNotFound, got %v", err)
	}
	e.setUplineStatus(t, "inactive")
	if err := e.svc.RecordReferralClick(ctx, e.tenant.ID, e.upline.ReferralCode, "10.1.2.5"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("click for inactive agent: expected ErrNotFound, got %v", err)
	}
	var clicks int
	if err := db.QueryRow(`SELECT COUNT(*) FROM referral_clicks WHERE tenant_id = ? AND agent_id = ?`, e.tenant.ID, e.upline.ID).Scan(&clicks); err != nil {
		t.Fatal(err)
	}
	if clicks != 1 {
		t.Fatalf("expected only the active agent's click, got %d", clicks)
	}

	agentSvc := service.NewAgentService(e.agentRepo, repository.NewAgentSessionRepository(db), e.tenantRepo, e.ledgerRepo,
		repository.NewProspectRepository(db), repository.NewCommissionPayoutRequestRepository(db), nil, nil, nil)
	code := e.upline.ReferralCode
	nano := time.Now().UnixNano()
	req := &service.RegisterAgentRequest{
		Name: "Agen Baru", Phone: fmt.Sprintf("0857%08d", nano%100000000), Email: fmt.Sprintf("bh3-%d@example.test", nano),
		Domisili: "Bandung", Password: "rahasia123", TermsAccepted: true, ReferralCode: &code,
	}
	if _, err := agentSvc.Register(ctx, e.tenant.ID, req); !errors.Is(err, service.ErrReferralAgentNotActive) {
		t.Fatalf("register under inactive upline: expected ErrReferralAgentNotActive, got %v", err)
	}
	e.setUplineStatus(t, "active")
	res, err := agentSvc.Register(ctx, e.tenant.ID, req)
	if err != nil {
		t.Fatalf("register under active upline: %v", err)
	}
	created, err := e.agentRepo.GetByID(ctx, e.tenant.ID, res.Agent.ID)
	if err != nil || created.ParentAgentID == nil || *created.ParentAgentID != e.upline.ID {
		t.Fatalf("expected the new agent under the upline, got %+v (%v)", created, err)
	}

	// Unchanged bank details: 0 rows changed in MySQL, but not an error.
	for i := 0; i < 2; i++ {
		if err := e.agentRepo.UpdateBankInfo(ctx, e.tenant.ID, e.downline.ID, "BSI", "123456", "Downline D"); err != nil {
			t.Fatalf("bank info save %d: %v", i+1, err)
		}
	}
	if err := e.agentRepo.UpdateBankInfo(ctx, other.ID, e.downline.ID, "BSI", "123456", "Downline D"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: bank info via another tenant: expected ErrNotFound, got %v", err)
	}

	habits := repository.NewAgentHabitRepository(db)
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM agent_sumber_progress WHERE tenant_id = ?`, e.tenant.ID) })
	if added, err := habits.SetSumberDone(ctx, e.tenant.ID, e.downline.ID, 3, true); err != nil || !added {
		t.Fatalf("first mark: added=%v err=%v", added, err)
	}
	if added, err := habits.SetSumberDone(ctx, e.tenant.ID, e.downline.ID, 3, true); err != nil || added {
		t.Fatalf("repeat mark must not count as new: added=%v err=%v", added, err)
	}
	if added, err := habits.SetSumberDone(ctx, other.ID, e.downline.ID, 4, true); err != nil || added {
		t.Fatalf("CRITICAL: mark through another tenant must store nothing: added=%v err=%v", added, err)
	}
}

// Payout amounts are whole cents: 0.001 is refused (it would be stored as a 0.00 request that blocks
// real ones) and an amount that rounds above the balance is refused.
func TestBugHunt3_PayoutAmountInCents(t *testing.T) {
	e := setupProspectAudit(t)
	agentSvc := newAgentAuditService(e)
	p := e.newAgentProspect(t, "081322230001", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("paid off: %v", err)
	}
	in := func(amount float64) service.AgentCreatePayoutRequestInput {
		return service.AgentCreatePayoutRequestInput{AmountRequested: amount, BankName: "BSI", BankAccountNumber: "123", BankAccountHolder: "Agen Audit"}
	}
	if _, err := agentSvc.CreatePayoutRequest(e.ctx, e.tenantA.ID, e.agentA.ID, in(0.001)); !errors.Is(err, service.ErrPayoutAmountNotPositive) {
		t.Fatalf("0.001: expected ErrPayoutAmountNotPositive, got %v", err)
	}
	// Balance is exactly 1.000.000 (one jamaah, paid off): 1000000.005 rounds to 1000000.01.
	if _, err := agentSvc.CreatePayoutRequest(e.ctx, e.tenantA.ID, e.agentA.ID, in(1000000.005)); !errors.Is(err, service.ErrPayoutExceedsBalance) {
		t.Fatalf("1000000.005: expected ErrPayoutExceedsBalance, got %v", err)
	}
	if _, err := agentSvc.CreatePayoutRequest(e.ctx, e.tenantB.ID, e.agentA.ID, in(1000)); err == nil {
		t.Fatalf("CRITICAL: payout for tenant A's agent through tenant B must fail")
	}
	req, err := agentSvc.CreatePayoutRequest(e.ctx, e.tenantA.ID, e.agentA.ID, in(999999.994))
	if err != nil {
		t.Fatalf("999999.994: %v", err)
	}
	if !approxEq(req.AmountRequested, 999999.99) {
		t.Fatalf("stored amount %.4f, want 999999.99", req.AmountRequested)
	}
	t.Cleanup(func() { _, _ = e.db.Exec(`DELETE FROM commission_payout_requests WHERE tenant_id = ?`, e.tenantA.ID) })
}
