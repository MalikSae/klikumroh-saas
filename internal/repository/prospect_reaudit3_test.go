package repository_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Regression tests for the third prospect re-audit (S1-S6 + consent, lost-reason categories,
// departure plan & domicile), run against real MySQL.

// S1: a new prospect whose phone already has a closing is kept but flagged for the admin.
func TestReaudit3_NewProspectOfClosedPhoneIsFlagged(t *testing.T) {
	e := setupProspectAudit(t)
	closed := e.newAgentProspect(t, "081355550001", 1)
	norm := "6281355550001"
	closed.PhoneNormalized = &norm
	if err := e.prospectRepo.Update(e.ctx, e.tenantA.ID, closed); err != nil {
		t.Fatalf("set phone: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, closed.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}

	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Jamaah Lagi", Phone: "081355550001"}); err != nil {
		t.Fatalf("resubmit: %v", err)
	}
	all, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{})
	if len(all) != 2 {
		t.Fatalf("expected the closed prospect plus a new one, got %d", len(all))
	}
	var fresh *repository.Prospect
	for i := range all {
		if all[i].ID != closed.ID {
			fresh = &all[i]
		}
	}
	detail, err := e.svc.GetDetail(e.ctx, e.tenantA.ID, fresh.ID)
	if err != nil {
		t.Fatalf("detail: %v", err)
	}
	flagged := false
	for _, n := range detail.Notes {
		if n.AuthorType == "system" && strings.Contains(n.NoteText, fmt.Sprintf("prospek #%d", closed.ID)) {
			flagged = true
		}
	}
	if !flagged {
		t.Fatalf("expected a system note pointing to closed prospect #%d, got %+v", closed.ID, detail.Notes)
	}
}

// Consent (UU PDP), departure plan and domicile on the public form.
func TestReaudit3_ConsentDeparturePlanDomicile(t *testing.T) {
	e := setupProspectAudit(t)
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Name: "Tanpa Setuju", Phone: "081355550002"}); !errors.Is(err, service.ErrConsentRequired) {
		t.Fatalf("expected ErrConsentRequired, got %v", err)
	}
	bad := "2020-01"
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Bulan Lalu", Phone: "081355550003", DeparturePlan: &bad}); !errors.Is(err, service.ErrInvalidDeparturePlan) {
		t.Fatalf("expected ErrInvalidDeparturePlan, got %v", err)
	}
	next := time.Now().AddDate(0, 2, 0).Format("2006-01")
	city := "  Kota   Bandung "
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Lengkap", Phone: "081355550004", DeparturePlan: &next, Domicile: &city}); err != nil {
		t.Fatalf("create: %v", err)
	}
	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{})
	if len(list) != 1 || list[0].ConsentAt == nil || list[0].DeparturePlan == nil || *list[0].DeparturePlan != next ||
		list[0].Domicile == nil || *list[0].Domicile != "Kota Bandung" {
		t.Fatalf("expected consent, plan %s and domicile stored, got %+v", next, list)
	}
}

// Fixed lost-reason categories.
func TestReaudit3_LostReasonCategories(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081355550005", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "tidak_lanjut", nil, nil); !errors.Is(err, service.ErrLostReasonCategoryInvalid) {
		t.Fatalf("no reason: expected ErrLostReasonCategoryInvalid, got %v", err)
	}
	lainnya := "lainnya"
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "tidak_lanjut", nil, &lainnya); !errors.Is(err, service.ErrLostReasonDetailRequired) {
		t.Fatalf("lainnya without detail: expected ErrLostReasonDetailRequired, got %v", err)
	}
	system := "batal_setelah_dp"
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "tidak_lanjut", nil, &system); !errors.Is(err, service.ErrLostReasonCategoryInvalid) {
		t.Fatalf("system category by hand: expected ErrLostReasonCategoryInvalid, got %v", err)
	}
	harga := "harga"
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "tidak_lanjut", nil, &harga); err != nil {
		t.Fatalf("harga: %v", err)
	}
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID)
	if got.LostReasonCategory == nil || *got.LostReasonCategory != "harga" || got.LostReason == nil || *got.LostReason != "Harga tidak cocok" {
		t.Fatalf("expected category harga with label, got %v %v", got.LostReasonCategory, got.LostReason)
	}

	c := e.newAgentProspect(t, "081355550006", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, c.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, c.ID, 1, "visa ditolak"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	got, _ = e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, c.ID)
	if got.LostReasonCategory == nil || *got.LostReasonCategory != "batal_setelah_dp" {
		t.Fatalf("cancel must set category batal_setelah_dp, got %v", got.LostReasonCategory)
	}
}

// S5: editing a phone onto another open prospect's number is refused.
func TestReaudit3_EditPhoneCollision(t *testing.T) {
	e := setupProspectAudit(t)
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Pemilik", Phone: "081355550007"}); err != nil {
		t.Fatalf("create owner: %v", err)
	}
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Lain", Phone: "081355550008"}); err != nil {
		t.Fatalf("create other: %v", err)
	}
	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{})
	var other *repository.Prospect
	for i := range list {
		if list[i].Name == "Lain" {
			other = &list[i]
		}
	}
	err := e.svc.UpdateDetail(e.ctx, e.tenantA.ID, other.ID, 1, service.UpdateProspectInput{Name: "Lain", Phone: "0813-5555-0007"})
	if !errors.Is(err, service.ErrPhoneUsedByOpenProspect) {
		t.Fatalf("expected ErrPhoneUsedByOpenProspect, got %v", err)
	}
	// Keeping its own number is fine.
	if err := e.svc.UpdateDetail(e.ctx, e.tenantA.ID, other.ID, 1, service.UpdateProspectInput{Name: "Lain Edit", Phone: "081355550008"}); err != nil {
		t.Fatalf("own number: %v", err)
	}
}

// S4: counted closings that are not lunas yet; S6: paged agent list.
func TestReaudit3_UnpaidClosingsAndAgentPaging(t *testing.T) {
	e := setupProspectAudit(t)
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	payoff := repository.NewTargetPayoffRepository(db)

	a := e.newAgentProspect(t, "081355550009", 1)
	b := e.newAgentProspect(t, "081355550010", 1)
	e.newAgentProspect(t, "081355550011", 1)
	for _, p := range []*repository.Prospect{a, b} {
		if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
			t.Fatalf("closing: %v", err)
		}
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, a.ID, 1); err != nil {
		t.Fatalf("paid off: %v", err)
	}
	today := time.Now().Format("2006-01-02")
	n, err := payoff.CountUnpaidClosings(e.ctx, e.tenantA.ID, e.agentA.ID, today, today)
	if err != nil || n != 1 {
		t.Fatalf("expected 1 unpaid closing, got %d (%v)", n, err)
	}
	if n, _ := payoff.CountUnpaidClosings(e.ctx, e.tenantB.ID, e.agentA.ID, today, today); n != 0 {
		t.Fatalf("CRITICAL: tenant B must see 0 unpaid closings of tenant A's agent, got %d", n)
	}

	items, total, err := e.prospectRepo.ListByAgentPage(e.ctx, e.tenantA.ID, e.agentA.ID, nil, nil, 2, 0)
	if err != nil || total != 3 || len(items) != 2 {
		t.Fatalf("page 1: expected 2 of 3, got %d of %d (%v)", len(items), total, err)
	}
	items, _, _ = e.prospectRepo.ListByAgentPage(e.ctx, e.tenantA.ID, e.agentA.ID, nil, nil, 2, 2)
	if len(items) != 1 {
		t.Fatalf("page 2: expected 1 item, got %d", len(items))
	}
	if items, total, _ := e.prospectRepo.ListByAgentPage(e.ctx, e.tenantB.ID, e.agentA.ID, nil, nil, 10, 0); total != 0 || len(items) != 0 {
		t.Fatalf("CRITICAL: tenant B must not list tenant A's agent jamaah, got %d", total)
	}
}

// S2: the public site of a travel that has not paid yet (pending) is offline.
func TestReaudit3_PendingTenantPublicSiteOffline(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	tenantRepo := repository.NewTenantRepository(db)
	domainRepo := repository.NewDomainRepository(db)

	pending := createDummyTenant(t, e2eCtx(), tenantRepo, "s2-pending")
	pending.Status = "pending"
	if err := tenantRepo.Update(e2eCtx(), pending); err != nil {
		t.Fatalf("set pending: %v", err)
	}
	active := createDummyTenant(t, e2eCtx(), tenantRepo, "s2-active")
	hostPending := fmt.Sprintf("s2p-%d.klikumroh.id", time.Now().UnixNano())
	hostActive := fmt.Sprintf("s2a-%d.klikumroh.id", time.Now().UnixNano())
	for _, d := range []struct {
		tid  uint64
		host string
	}{{pending.ID, hostPending}, {active.ID, hostActive}} {
		if err := domainRepo.Create(e2eCtx(), d.tid, &repository.Domain{TenantID: d.tid, Hostname: d.host, Type: "subdomain", Status: "active"}); err != nil {
			t.Fatalf("create domain: %v", err)
		}
	}
	t.Cleanup(func() {
		for _, id := range []uint64{pending.ID, active.ID} {
			_, _ = db.Exec("DELETE FROM domains WHERE tenant_id = ?", id)
			_ = tenantRepo.Delete(e2eCtx(), id)
		}
	})

	h := middleware.TenantResolutionMiddleware(domainRepo, tenantRepo)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	for host, want := range map[string]int{hostPending: http.StatusNotFound, hostActive: http.StatusOK} {
		req := httptest.NewRequest(http.MethodGet, "/api/public/tenant", nil)
		req.Header.Set("X-Forwarded-Host", host)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s: expected %d, got %d", host, want, rr.Code)
		}
	}
}

func e2eCtx() context.Context { return context.Background() }
