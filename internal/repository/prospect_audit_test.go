package repository_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// Regression tests for the prospect audit (29 Sep 2026), run against real MySQL.

type prospectAuditEnv struct {
	ctx          context.Context
	svc          service.ProspectService
	prospectRepo repository.ProspectRepository
	ledgerRepo   repository.CommissionLedgerRepository
	tenantA      *repository.Tenant
	tenantB      *repository.Tenant
	agentA       *repository.Agent
	pkgA         *repository.Package
	db           *sql.DB
	pkgRepo      repository.PackageRepository
}

func setupProspectAudit(t *testing.T) *prospectAuditEnv {
	t.Helper()
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	pkgRepo := repository.NewPackageRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	ledgerRepo := repository.NewCommissionLedgerRepository(db)
	historyRepo := repository.NewProspectStatusHistoryRepository(db)
	noteRepo := repository.NewProspectNoteRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "pa-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "pa-b")

	ts := time.Now().UnixNano()
	phone := fmt.Sprintf("0813%08d", ts%100000000)
	agentA := &repository.Agent{Name: "Agen Audit", Phone: &phone, Status: "active", ReferralCode: fmt.Sprintf("PA-%d", ts)}
	if err := agentRepo.Create(ctx, tenantA.ID, agentA); err != nil {
		t.Fatalf("create agent: %v", err)
	}
	commission := 1000000.0
	pkgA := &repository.Package{Name: "Paket Audit", Status: "published", CommissionAmount: &commission}
	if err := pkgRepo.Create(ctx, tenantA.ID, pkgA); err != nil {
		t.Fatalf("create package: %v", err)
	}

	// Cleanup runs after db.Close is registered, so it executes first (LIFO).
	t.Cleanup(func() {
		for _, tid := range []uint64{tenantA.ID, tenantB.ID} {
			_, _ = db.Exec("DELETE FROM notifications WHERE tenant_id = ?", tid)
			_, _ = db.Exec("DELETE FROM commission_ledger WHERE tenant_id = ?", tid)
			_, _ = db.Exec("DELETE FROM prospect_status_history WHERE tenant_id = ?", tid)
			_, _ = db.Exec("DELETE FROM prospect_notes WHERE tenant_id = ?", tid)
			_, _ = db.Exec("DELETE FROM referral_clicks WHERE tenant_id = ?", tid)
			_, _ = db.Exec("DELETE FROM prospects WHERE tenant_id = ?", tid)
			_, _ = db.Exec("DELETE FROM packages WHERE tenant_id = ?", tid)
			_, _ = db.Exec("DELETE FROM agents WHERE tenant_id = ?", tid)
			_ = tenantRepo.Delete(ctx, tid)
		}
	})

	svc := service.NewProspectService(prospectRepo, pkgRepo, agentRepo, tenantRepo, ledgerRepo, historyRepo, noteRepo, nil, nil)
	svc.SetCommissionPolicyRepo(repository.NewCommissionPolicyRepository(db))
	return &prospectAuditEnv{ctx: ctx, svc: svc, prospectRepo: prospectRepo, ledgerRepo: ledgerRepo, tenantA: tenantA, tenantB: tenantB, agentA: agentA, pkgA: pkgA, db: db, pkgRepo: pkgRepo}
}

func (e *prospectAuditEnv) newAgentProspect(t *testing.T, phone string, jumlah int) *repository.Prospect {
	t.Helper()
	normalized := util.NormalizePhoneToWhatsApp(phone)
	p := &repository.Prospect{
		AgentID: &e.agentA.ID, PackageID: &e.pkgA.ID, Name: "Jamaah Audit", Phone: phone,
		PhoneNormalized: &normalized,
		JumlahJamaah:    &jumlah, SourceChannel: "agen", Status: "baru",
	}
	if err := e.prospectRepo.Create(e.ctx, e.tenantA.ID, p); err != nil {
		t.Fatalf("create prospect: %v", err)
	}
	return p
}

func ledgerSum(t *testing.T, e *prospectAuditEnv, prospectID uint64) (entries int, total float64) {
	t.Helper()
	ledgers, err := e.ledgerRepo.ListByProspect(e.ctx, e.tenantA.ID, prospectID)
	if err != nil {
		t.Fatalf("list ledger: %v", err)
	}
	for _, l := range ledgers {
		total += l.Amount
	}
	return len(ledgers), total
}

// Temuan #1: 20 concurrent "closing" requests used to book 8-10 commissions. Exactly one may win.
func TestProspectAudit_ConcurrentClosingBooksCommissionOnce(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081311110001", 2)

	const n = 20
	var wg sync.WaitGroup
	results := make([]error, n)
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i] = e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil)
		}(i)
	}
	close(start)
	wg.Wait()

	wins := 0
	for _, err := range results {
		switch {
		case err == nil:
			wins++
		case errors.Is(err, service.ErrProspectStatusConflict), errors.Is(err, service.ErrProspectAlreadyClosed):
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if wins != 1 {
		t.Fatalf("expected exactly 1 successful closing, got %d", wins)
	}
	entries, total := ledgerSum(t, e, p.ID)
	if entries != 1 || total != 2000000 {
		t.Fatalf("expected 1 ledger entry of Rp 2.000.000, got %d entries totalling %.0f", entries, total)
	}
}

// Temuan #7: changing the package of a closed prospect books a correction to the new package's rate.
func TestProspectAudit_PackageChangeAfterClosingCorrectsCommission(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081311110002", 2)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}

	db2 := setupTestDB(t)
	t.Cleanup(func() { _ = db2.Close() })
	pkgRepo := repository.NewPackageRepository(db2)
	higher := 1500000.0
	pkgB := &repository.Package{Name: "Paket Plus Audit", Status: "published", CommissionAmount: &higher}
	if err := pkgRepo.Create(e.ctx, e.tenantA.ID, pkgB); err != nil {
		t.Fatalf("create package: %v", err)
	}

	two := 2
	input := service.UpdateProspectInput{Name: "Jamaah Audit", Phone: "081311110002", PackageID: &pkgB.ID, JumlahJamaah: &two}
	if err := e.svc.UpdateDetail(e.ctx, e.tenantA.ID, p.ID, 1, input); !errors.Is(err, service.ErrCorrectionReasonRequired) {
		t.Fatalf("expected ErrCorrectionReasonRequired without a reason, got %v", err)
	}
	reason := "Upgrade ke paket plus"
	input.CorrectionReason = &reason
	if err := e.svc.UpdateDetail(e.ctx, e.tenantA.ID, p.ID, 1, input); err != nil {
		t.Fatalf("update detail: %v", err)
	}
	entries, total := ledgerSum(t, e, p.ID)
	if entries != 2 || total != 3000000 {
		t.Fatalf("expected direct + correction totalling Rp 3.000.000, got %d entries totalling %.0f", entries, total)
	}
}

// Temuan #4: the same jamaah submitting again while the prospect is open keeps the first owner.
func TestProspectAudit_RepeatSubmissionKeepsFirstOwner(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "0813-1111-0003", 1)
	norm := "6281311110003"
	p.PhoneNormalized = &norm
	if err := e.prospectRepo.Update(e.ctx, e.tenantA.ID, p); err != nil {
		t.Fatalf("set normalized phone: %v", err)
	}

	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Jamaah Audit", Phone: "+62 813 1111 0003"}); err != nil {
		t.Fatalf("repeat submission: %v", err)
	}
	all, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{})
	if len(all) != 1 || all[0].AgentID == nil || *all[0].AgentID != e.agentA.ID {
		t.Fatalf("expected the single original prospect owned by agent A, got %+v", all)
	}

	// Another agent (manual input) cannot take over the open prospect.
	if _, err := e.svc.CreateManualByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, service.AgentCreateProspectInput{Consent: true, Name: "Jamaah Audit", Phone: "081311110003"}); !errors.Is(err, service.ErrProspectAlreadyInYourList) {
		t.Fatalf("expected ErrProspectAlreadyInYourList, got %v", err)
	}

	// Tenant B is isolated: the same number is a brand new prospect there.
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantB.ID, service.PublicProspectInput{Consent: true, Name: "Jamaah Audit", Phone: "081311110003"}); err != nil {
		t.Fatalf("tenant B submission: %v", err)
	}
	if n, _ := e.prospectRepo.CountWithFilter(e.ctx, e.tenantB.ID, repository.ProspectFilter{}); n != 1 {
		t.Fatalf("expected 1 prospect in tenant B, got %d", n)
	}
	if n, _ := e.prospectRepo.CountWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{}); n != 1 {
		t.Fatalf("expected tenant A still at 1 prospect, got %d", n)
	}
}

// Temuan #3 & #5: invalid input is rejected (not a 500), source is decided server-side.
func TestProspectAudit_PublicValidationAndSource(t *testing.T) {
	e := setupProspectAudit(t)
	big := 100000
	cases := []struct {
		name  string
		input service.PublicProspectInput
		want  error
	}{
		{"letters in phone", service.PublicProspectInput{Consent: true, Name: "Budi", Phone: "abc"}, service.ErrInvalidProspectPhone},
		{"phone too long", service.PublicProspectInput{Consent: true, Name: "Budi", Phone: "111111111111111111111111111111"}, service.ErrInvalidProspectPhone},
		{"name too long", service.PublicProspectInput{Consent: true, Name: fmt.Sprintf("%0300d", 0), Phone: "081311110010"}, service.ErrInvalidProspectName},
		{"too many jamaah", service.PublicProspectInput{Consent: true, Name: "Budi", Phone: "081311110011", JumlahJamaah: &big}, service.ErrJumlahJamaahTooLarge},
	}
	for _, tc := range cases {
		if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, tc.input); !errors.Is(err, tc.want) {
			t.Errorf("%s: expected %v, got %v", tc.name, tc.want, err)
		}
	}

	// A client-sent source_channel is ignored. Only a real Meta ad id (ad_id) makes a lead paid
	// (keputusan pendiri 5 Okt 2026): fbclid alone, utm_medium alone or an unfilled {{ad.id}} are organic.
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Siti", Phone: "081311110012", SourceChannel: "agen"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	attributions := []struct {
		name, phone string
		attr        service.ProspectAttribution
	}{
		{"Rina", "081311110013", service.ProspectAttribution{UTMSource: "facebook", UTMCampaign: "umroh-desember", Fbclid: "IwAR0abc"}},
		{"Ani", "081311110014", service.ProspectAttribution{UTMSource: "facebook", UTMMedium: "paid"}},
		{"Dewi", "081311110015", service.ProspectAttribution{UTMSource: "facebook", Fbclid: "IwAR0def", AdID: "120200000000"}},
		{"Eka", "081311110016", service.ProspectAttribution{UTMSource: "facebook", AdID: "{{ad.id}}"}},
	}
	for _, a := range attributions {
		attr := a.attr
		if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true,
			Name: a.name, Phone: a.phone, Attribution: &attr,
		}); err != nil {
			t.Fatalf("create %s: %v", a.name, err)
		}
	}
	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{})
	got := map[string]string{}
	for _, p := range list {
		got[p.Name] = p.SourceChannel
		if p.Name == "Rina" && (p.UTMCampaign == nil || *p.UTMCampaign != "umroh-desember") {
			t.Errorf("expected utm_campaign stored, got %v", p.UTMCampaign)
		}
	}
	want := map[string]string{"Siti": "organik", "Rina": "organik", "Ani": "organik", "Dewi": "paid", "Eka": "organik"}
	for name, ch := range want {
		if got[name] != ch {
			t.Errorf("%s: expected source %s, got %q", name, ch, got[name])
		}
	}
}

// Temuan #2: spam can be deleted, but never a closed prospect (commission history stays).
func TestProspectAudit_DeleteGuardsAndIsolation(t *testing.T) {
	e := setupProspectAudit(t)
	spam := e.newAgentProspect(t, "081311110020", 1)
	closed := e.newAgentProspect(t, "081311110021", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, closed.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}

	if err := e.svc.Delete(e.ctx, e.tenantB.ID, spam.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("tenant B must not delete tenant A's prospect, got %v", err)
	}
	if err := e.svc.Delete(e.ctx, e.tenantA.ID, closed.ID); !errors.Is(err, service.ErrProspectCannotDelete) {
		t.Fatalf("expected ErrProspectCannotDelete for a closed prospect, got %v", err)
	}
	if err := e.svc.Delete(e.ctx, e.tenantA.ID, spam.ID); err != nil {
		t.Fatalf("delete spam: %v", err)
	}
	if _, err := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, spam.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected spam prospect gone, got %v", err)
	}
}

// Temuan #11: refreshing a referral link within 24 hours counts one click.
func TestProspectAudit_ReferralClickDeduplicated(t *testing.T) {
	e := setupProspectAudit(t)
	for i := 0; i < 5; i++ {
		if err := e.prospectRepo.RecordReferralClick(e.ctx, e.tenantA.ID, e.agentA.ID, "203.0.113.7"); err != nil {
			t.Fatalf("record click: %v", err)
		}
	}
	if err := e.prospectRepo.RecordReferralClick(e.ctx, e.tenantA.ID, e.agentA.ID, "203.0.113.8"); err != nil {
		t.Fatalf("record click: %v", err)
	}
	n, err := e.prospectRepo.GetAgentReferralClicksCount(e.ctx, e.tenantA.ID, e.agentA.ID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 2 {
		t.Fatalf("expected 2 unique clicks (2 visitors), got %d", n)
	}
}
