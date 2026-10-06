package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Bug hunt round 5: agent payouts (D1 cancel approved, D2 balance re-check, D3 admin-initiated payout),
// mark-paid keeps the approver and notifies the agent, [] for an empty list, Indonesian messages,
// rejection_reason in the commission history and bank details in the admin agent detail.

type bh5PayoutEnv struct {
	agentRouter *chi.Mux
	adminRouter *chi.Mux
	agentRepo   *mockAgentRepo
	ledgers     *mockCommissionLedgerRepo
	payouts     *mockCommissionPayoutRequestRepo
	notifs      *mockNotifRepo
	t1, t2      *repository.Tenant
	agent1      *repository.Agent // tenant 1, bank details stored
	agentNoBank *repository.Agent // tenant 1, no bank details
	agent2      *repository.Agent // tenant 2
}

const (
	bh5AdminT1  = "bh5-admin-t1"
	bh5AdminT2  = "bh5-admin-t2"
	bh5AgentTok = "bh5-agent-1"
)

func setupBH5PayoutEnv(t *testing.T) *bh5PayoutEnv {
	t.Helper()
	ctx := context.Background()
	e := &bh5PayoutEnv{}
	tenantRepo := newMockTenantRepo()
	minPayout := float64(500000)
	fee0 := float64(0)
	e.t1 = &repository.Tenant{Name: "Travel Satu", Slug: "bh5-satu", Status: "active", AgentRegistrationFee: &fee0, MinimumPayoutAmount: &minPayout}
	e.t2 = &repository.Tenant{Name: "Travel Dua", Slug: "bh5-dua", Status: "active", AgentRegistrationFee: &fee0, MinimumPayoutAmount: &minPayout}
	_ = tenantRepo.Create(ctx, e.t1)
	_ = tenantRepo.Create(ctx, e.t2)

	e.agentRepo = newMockAgentRepo()
	sessions := newMockAgentSessionRepo(e.agentRepo)
	e.agent1 = &repository.Agent{
		TenantID: e.t1.ID, Name: "Agen Satu", Email: strPtr("satu@bh5.test"), Status: "active", ReferralCode: "BH5A1",
		BankName: strPtr("BCA"), BankAccountNumber: strPtr("1234567890"), BankAccountHolder: strPtr("Agen Satu"),
	}
	_ = e.agentRepo.Create(ctx, e.t1.ID, e.agent1)
	e.agentNoBank = &repository.Agent{TenantID: e.t1.ID, Name: "Agen Tanpa Rekening", Email: strPtr("norek@bh5.test"), Status: "active", ReferralCode: "BH5A2"}
	_ = e.agentRepo.Create(ctx, e.t1.ID, e.agentNoBank)
	e.agent2 = &repository.Agent{
		TenantID: e.t2.ID, Name: "Agen Dua", Email: strPtr("dua@bh5.test"), Status: "active", ReferralCode: "BH5B1",
		BankName: strPtr("BRI"), BankAccountNumber: strPtr("555"), BankAccountHolder: strPtr("Agen Dua"),
	}
	_ = e.agentRepo.Create(ctx, e.t2.ID, e.agent2)
	_ = sessions.Create(ctx, &repository.AgentSession{TenantID: e.t1.ID, AgentID: e.agent1.ID, Token: bh5AgentTok, ExpiresAt: time.Now().Add(time.Hour)})

	e.ledgers = &mockCommissionLedgerRepo{}
	prospects := newMockProspectRepo()
	prospects.agentRepo = e.agentRepo
	e.payouts = newMockCommissionPayoutRequestRepo()
	e.notifs = &mockNotifRepo{}
	svc := service.NewAgentService(e.agentRepo, sessions, tenantRepo, e.ledgers, prospects, e.payouts, nil,
		service.NewNotificationService(e.notifs), nil)
	h := handler.NewAgentHandler(svc)

	e.agentRouter = chi.NewRouter()
	e.agentRouter.Use(middleware.AgentAuthMiddleware(sessions))
	h.RegisterAgentProtectedRoutes(e.agentRouter)

	adminSessions := &mockSessionRepo{sessions: make(map[string]*repository.Session)}
	_ = adminSessions.Create(ctx, e.t1.ID, &repository.Session{ID: 1, Token: bh5AdminT1, TenantID: e.t1.ID, AdminUserID: 71, ExpiresAt: time.Now().Add(time.Hour)})
	_ = adminSessions.Create(ctx, e.t2.ID, &repository.Session{ID: 2, Token: bh5AdminT2, TenantID: e.t2.ID, AdminUserID: 72, ExpiresAt: time.Now().Add(time.Hour)})
	e.adminRouter = chi.NewRouter()
	e.adminRouter.Use(middleware.AuthMiddleware(adminSessions))
	h.RegisterDashboardRoutes(e.adminRouter)
	return e
}

func (e *bh5PayoutEnv) release(tenantID, agentID uint64, amount float64) {
	_ = e.ledgers.Create(context.Background(), tenantID, &repository.CommissionLedger{
		TenantID: tenantID, AgentID: agentID, Amount: amount, Type: "direct", ReleasedAt: releasedNow(),
	})
}

func bh5Do(router http.Handler, method, path, token string, body interface{}) *httptest.ResponseRecorder {
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func bh5Error(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return body["error"]
}

// notifsFor returns the notifications of one agent, in creation order.
func (e *bh5PayoutEnv) notifsFor(agentID uint64) []repository.Notification {
	var out []repository.Notification
	for _, n := range e.notifs.notifs {
		if n.RecipientType == "agent" && n.RecipientID == agentID {
			out = append(out, n)
		}
	}
	return out
}

func TestBH5_AdminInitiatedPayout(t *testing.T) {
	e := setupBH5PayoutEnv(t)
	// Rp 300.000 is below the program minimum (500.000): the admin-initiated payout ignores the minimum.
	e.release(e.t1.ID, e.agent1.ID, 300000.40)
	path := fmt.Sprintf("/api/dashboard/agents/%d/payout-requests", e.agent1.ID)

	t.Run("tenant B admin cannot create for tenant A's agent -> 404", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodPost, path, bh5AdminT2, nil)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
		}
		if got := bh5Error(t, rec); got != "agen tidak ditemukan" {
			t.Fatalf("unexpected message %q", got)
		}
		if len(e.payouts.requests) != 0 {
			t.Fatalf("no payout may be created across tenants, got %d", len(e.payouts.requests))
		}
	})

	t.Run("201 with full balance and stored bank snapshot", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodPost, path, bh5AdminT1, nil)
		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
		}
		var item repository.CommissionPayoutRequestItem
		if err := json.Unmarshal(rec.Body.Bytes(), &item); err != nil {
			t.Fatal(err)
		}
		if item.AmountRequested != 300000.40 || item.Status != "pending" || item.TenantID != e.t1.ID || item.AgentID != e.agent1.ID {
			t.Fatalf("unexpected payout %+v", item)
		}
		if item.BankNameSnapshot != "BCA" || item.BankAccountNumberSnapshot != "1234567890" || item.BankAccountHolderSnapshot != "Agen Satu" {
			t.Fatalf("snapshot must be the stored bank details, got %+v", item)
		}
		if item.AgentName != "Agen Satu" {
			t.Fatalf("list-item shape expected (agent_name), got %q", item.AgentName)
		}
		ns := e.notifsFor(e.agent1.ID)
		if len(ns) != 1 || ns[0].Type != "payout_requested_by_admin" || ns[0].TenantID == nil || *ns[0].TenantID != e.t1.ID {
			t.Fatalf("agent should be notified once, got %+v", ns)
		}
	})

	t.Run("second request while one is in process -> 409", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodPost, path, bh5AdminT1, nil)
		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
		}
		if got := bh5Error(t, rec); got != "Masih ada pencairan yang sedang diproses untuk agen ini." {
			t.Fatalf("unexpected message %q", got)
		}
	})

	t.Run("no balance -> 400", func(t *testing.T) {
		e.agent2.Status = "active"
		rec := bh5Do(e.adminRouter, http.MethodPost, fmt.Sprintf("/api/dashboard/agents/%d/payout-requests", e.agent2.ID), bh5AdminT2, nil)
		if rec.Code != http.StatusBadRequest || bh5Error(t, rec) != "Tidak ada komisi yang bisa dicairkan." {
			t.Fatalf("expected 400 no balance, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("bank details missing -> 400", func(t *testing.T) {
		e.release(e.t1.ID, e.agentNoBank.ID, 100000)
		rec := bh5Do(e.adminRouter, http.MethodPost, fmt.Sprintf("/api/dashboard/agents/%d/payout-requests", e.agentNoBank.ID), bh5AdminT1, nil)
		if rec.Code != http.StatusBadRequest || bh5Error(t, rec) != "Data rekening agen belum lengkap." {
			t.Fatalf("expected 400 bank missing, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("inactive agent of the same travel can be paid out", func(t *testing.T) {
		e.release(e.t2.ID, e.agent2.ID, 750000)
		if err := e.agentRepo.UpdateStatus(context.Background(), e.t2.ID, e.agent2.ID, "inactive"); err != nil {
			t.Fatal(err)
		}
		rec := bh5Do(e.adminRouter, http.MethodPost, fmt.Sprintf("/api/dashboard/agents/%d/payout-requests", e.agent2.ID), bh5AdminT2, nil)
		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 for an inactive agent, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestBH5_PayoutLifecycle(t *testing.T) {
	e := setupBH5PayoutEnv(t)
	e.release(e.t1.ID, e.agent1.ID, 1000000)
	create := func(t *testing.T, amount float64) uint64 {
		t.Helper()
		rec := bh5Do(e.agentRouter, http.MethodPost, "/api/agent/payout-requests", bh5AgentTok, map[string]interface{}{
			"amount_requested": amount, "bank_name": "BCA", "bank_account_number": "1234567890", "bank_account_holder": "Agen Satu",
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("create payout: %d %s", rec.Code, rec.Body.String())
		}
		var p repository.CommissionPayoutRequest
		_ = json.Unmarshal(rec.Body.Bytes(), &p)
		return p.ID
	}

	t.Run("empty list is [] not null", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodGet, "/api/dashboard/payout-requests", bh5AdminT2, nil)
		if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != "[]" {
			t.Fatalf("expected [], got %d %q", rec.Code, rec.Body.String())
		}
	})

	var id uint64
	t.Run("D2 approve refused when the balance no longer covers the request", func(t *testing.T) {
		id = create(t, 800000)
		// A cancelled closing reverses Rp 500.000 of released commission: Rp 500.000 left.
		_ = e.ledgers.Create(context.Background(), e.t1.ID, &repository.CommissionLedger{TenantID: e.t1.ID, AgentID: e.agent1.ID, Amount: -500000, Type: "correction", ReleasedAt: releasedNow()})
		rec := bh5Do(e.adminRouter, http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/approve", id), bh5AdminT1, nil)
		want := "Saldo agen sudah tidak cukup untuk pengajuan ini (saldo tersedia Rp 500.000). Tolak pengajuan ini."
		if rec.Code != http.StatusConflict || bh5Error(t, rec) != want {
			t.Fatalf("expected 409 %q, got %d: %s", want, rec.Code, rec.Body.String())
		}
		if e.payouts.requests[id].Status != "pending" {
			t.Fatalf("request must stay pending, got %s", e.payouts.requests[id].Status)
		}
		// Restore the commission so the request is covered again.
		_ = e.ledgers.Create(context.Background(), e.t1.ID, &repository.CommissionLedger{TenantID: e.t1.ID, AgentID: e.agent1.ID, Amount: 500000, Type: "direct", ReleasedAt: releasedNow()})
	})

	t.Run("approve succeeds when covered", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/approve", id), bh5AdminT1, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("approve: %d %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("D2 mark-paid refused when the balance no longer covers the request", func(t *testing.T) {
		_ = e.ledgers.Create(context.Background(), e.t1.ID, &repository.CommissionLedger{TenantID: e.t1.ID, AgentID: e.agent1.ID, Amount: -700000, Type: "correction", ReleasedAt: releasedNow()})
		rec := bh5Do(e.adminRouter, http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/paid", id), bh5AdminT1, nil)
		if rec.Code != http.StatusConflict || !strings.HasPrefix(bh5Error(t, rec), "Saldo agen sudah tidak cukup untuk pengajuan ini (saldo tersedia Rp 300.000)") {
			t.Fatalf("expected 409 balance message, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("D1 cancel an approved payout: reason required, then rejected with the reason", func(t *testing.T) {
		path := fmt.Sprintf("/api/dashboard/payout-requests/%d/reject", id)
		rec := bh5Do(e.adminRouter, http.MethodPatch, path, bh5AdminT1, map[string]string{"rejection_reason": "  "})
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("blank reason: expected 400, got %d", rec.Code)
		}
		// Tenant B cannot cancel tenant A's payout.
		rec = bh5Do(e.adminRouter, http.MethodPatch, path, bh5AdminT2, map[string]string{"rejection_reason": "x"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("cross-tenant cancel: expected 404, got %d", rec.Code)
		}
		rec = bh5Do(e.adminRouter, http.MethodPatch, path, bh5AdminT1, map[string]string{"rejection_reason": "Nomor rekening salah, transfer gagal"})
		if rec.Code != http.StatusOK {
			t.Fatalf("cancel approved: %d %s", rec.Code, rec.Body.String())
		}
		p := e.payouts.requests[id]
		if p.Status != "rejected" || p.RejectionReason == nil || *p.RejectionReason != "Nomor rekening salah, transfer gagal" {
			t.Fatalf("unexpected payout after cancel %+v", p)
		}
		ns := e.notifsFor(e.agent1.ID)
		last := ns[len(ns)-1]
		if last.Type != "payout_rejected" || !strings.Contains(last.Body, "Nomor rekening salah, transfer gagal") {
			t.Fatalf("agent should get the reason, got %+v", last)
		}
	})

	var paidID uint64
	t.Run("freed balance: a new request works; mark-paid keeps approver and notifies", func(t *testing.T) {
		// Balance now 300.000 released (1.000.000 - 500.000 + 500.000 - 700.000); request it all.
		_ = e.ledgers.Create(context.Background(), e.t1.ID, &repository.CommissionLedger{TenantID: e.t1.ID, AgentID: e.agent1.ID, Amount: 300000, Type: "direct", ReleasedAt: releasedNow()})
		paidID = create(t, 600000)
		if rec := bh5Do(e.adminRouter, http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/approve", paidID), bh5AdminT1, nil); rec.Code != http.StatusOK {
			t.Fatalf("approve: %d %s", rec.Code, rec.Body.String())
		}
		approvedBy := *e.payouts.requests[paidID].ReviewedBy
		approvedAt := *e.payouts.requests[paidID].ReviewedAt
		time.Sleep(5 * time.Millisecond)
		if rec := bh5Do(e.adminRouter, http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/paid", paidID), bh5AdminT1, nil); rec.Code != http.StatusOK {
			t.Fatalf("paid: %d %s", rec.Code, rec.Body.String())
		}
		p := e.payouts.requests[paidID]
		if p.Status != "paid" || p.ReviewedBy == nil || *p.ReviewedBy != approvedBy || !p.ReviewedAt.Equal(approvedAt) {
			t.Fatalf("mark-paid must keep the approval fields, got %+v", p)
		}
		ns := e.notifsFor(e.agent1.ID)
		if last := ns[len(ns)-1]; last.Type != "payout_paid" {
			t.Fatalf("agent should be notified of the transfer, got %+v", last)
		}
	})

	t.Run("status conflicts are Indonesian without raw keys", func(t *testing.T) {
		for _, action := range []string{"approve", "paid"} {
			rec := bh5Do(e.adminRouter, http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/%s", paidID, action), bh5AdminT1, nil)
			msg := bh5Error(t, rec)
			if rec.Code != http.StatusConflict || strings.Contains(msg, "'") || strings.Contains(msg, "approved") || strings.Contains(msg, "pending") || strings.Contains(msg, " paid") {
				t.Fatalf("%s: expected 409 Indonesian message, got %d %q", action, rec.Code, msg)
			}
		}
		rec := bh5Do(e.adminRouter, http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/reject", paidID), bh5AdminT1, map[string]string{"rejection_reason": "x"})
		if rec.Code != http.StatusConflict || bh5Error(t, rec) != "Pengajuan ini tidak bisa ditolak karena statusnya sudah ditransfer." {
			t.Fatalf("reject paid: expected 409, got %d %q", rec.Code, bh5Error(t, rec))
		}
	})
}

func TestBH5_CommissionHistoryRejectionReasonAndAdminBankDetails(t *testing.T) {
	e := setupBH5PayoutEnv(t)
	e.release(e.t1.ID, e.agent1.ID, 2000000)
	ctx := context.Background()
	// One rejected from pending, one cancelled after approval, one paid.
	reason1, reason2 := "Data tidak sesuai", "Transfer gagal"
	now := time.Now().UTC()
	reviewer := uint64(71)
	for _, p := range []*repository.CommissionPayoutRequest{
		{AgentID: e.agent1.ID, AmountRequested: 100000, Status: "rejected", RejectionReason: &reason1, ReviewedBy: &reviewer, ReviewedAt: &now},
		{AgentID: e.agent1.ID, AmountRequested: 200000, Status: "approved"},
		{AgentID: e.agent1.ID, AmountRequested: 300000, Status: "paid"},
	} {
		_ = e.payouts.Create(ctx, e.t1.ID, p)
	}
	// Cancel the approved one through the API (D1).
	var approvedID uint64
	for id, p := range e.payouts.requests {
		if p.Status == "approved" {
			approvedID = id
		}
	}
	if rec := bh5Do(e.adminRouter, http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/reject", approvedID), bh5AdminT1, map[string]string{"rejection_reason": reason2}); rec.Code != http.StatusOK {
		t.Fatalf("cancel approved: %d %s", rec.Code, rec.Body.String())
	}

	checkRows := func(t *testing.T, rows []map[string]interface{}) {
		t.Helper()
		reasons := map[float64]interface{}{}
		for _, r := range rows {
			if r["source"] == "payout" {
				reasons[r["amount"].(float64)] = r["rejection_reason"]
			} else if _, ok := r["rejection_reason"]; ok {
				t.Fatalf("ledger rows must not carry rejection_reason: %+v", r)
			}
		}
		if reasons[100000] != reason1 || reasons[200000] != reason2 {
			t.Fatalf("rejected payouts must carry their reason, got %+v", reasons)
		}
		if v, ok := reasons[300000]; !ok || v != nil {
			t.Fatalf("paid payout must have no rejection_reason, got %+v", reasons)
		}
	}

	t.Run("agent portal history", func(t *testing.T) {
		rec := bh5Do(e.agentRouter, http.MethodGet, "/api/agent/commission-history", bh5AgentTok, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("history: %d %s", rec.Code, rec.Body.String())
		}
		var rows []map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil {
			t.Fatalf("decode: %v (%s)", err, rec.Body.String())
		}
		checkRows(t, rows)
	})

	t.Run("admin agent detail: history reasons and bank details", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodGet, fmt.Sprintf("/api/dashboard/agents/%d", e.agent1.ID), bh5AdminT1, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("detail: %d %s", rec.Code, rec.Body.String())
		}
		var detail struct {
			BankName          *string                  `json:"bank_name"`
			BankAccountNumber *string                  `json:"bank_account_number"`
			BankAccountHolder *string                  `json:"bank_account_holder"`
			RiwayatKomisi     []map[string]interface{} `json:"riwayat_komisi"`
			RiwayatPencairan  []map[string]interface{} `json:"riwayat_pencairan"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &detail); err != nil {
			t.Fatal(err)
		}
		if detail.BankName == nil || *detail.BankName != "BCA" || detail.BankAccountNumber == nil || *detail.BankAccountNumber != "1234567890" ||
			detail.BankAccountHolder == nil || *detail.BankAccountHolder != "Agen Satu" {
			t.Fatalf("bank details expected in the admin detail, got %+v", detail)
		}
		checkRows(t, detail.RiwayatKomisi)
		found := 0
		for _, p := range detail.RiwayatPencairan {
			if p["status"] == "rejected" && (p["rejection_reason"] == reason1 || p["rejection_reason"] == reason2) {
				found++
			}
		}
		if found != 2 {
			t.Fatalf("riwayat_pencairan should carry both reasons, got %+v", detail.RiwayatPencairan)
		}
	})

	t.Run("bank details omitted when not set", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodGet, fmt.Sprintf("/api/dashboard/agents/%d", e.agentNoBank.ID), bh5AdminT1, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("detail: %d %s", rec.Code, rec.Body.String())
		}
		if strings.Contains(rec.Body.String(), "bank_name") || strings.Contains(rec.Body.String(), "bank_account") {
			t.Fatalf("unset bank details must be omitted: %s", rec.Body.String())
		}
	})

	t.Run("cross-tenant: tenant B admin cannot read tenant A's agent detail or history", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodGet, fmt.Sprintf("/api/dashboard/agents/%d", e.agent1.ID), bh5AdminT2, nil)
		if rec.Code != http.StatusNotFound || strings.Contains(rec.Body.String(), "1234567890") {
			t.Fatalf("expected 404 without data, got %d: %s", rec.Code, rec.Body.String())
		}
		rec = bh5Do(e.adminRouter, http.MethodGet, fmt.Sprintf("/api/dashboard/agents/%d/commissions", e.agent1.ID), bh5AdminT2, nil)
		if rec.Code != http.StatusNotFound || strings.Contains(rec.Body.String(), reason1) {
			t.Fatalf("expected 404 without data, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestBH5_PaymentProofUploadNotifiesOwnTravelAdmins(t *testing.T) {
	ctx := context.Background()
	tenantRepo := newMockTenantRepo()
	fee := float64(100000)
	t1 := &repository.Tenant{Name: "Travel Bukti", Slug: "bh5-bukti", Status: "active", AgentRegistrationFee: &fee}
	t2 := &repository.Tenant{Name: "Travel Lain", Slug: "bh5-lain", Status: "active", AgentRegistrationFee: &fee}
	_ = tenantRepo.Create(ctx, t1)
	_ = tenantRepo.Create(ctx, t2)
	agents := newMockAgentRepo()
	first := &repository.Agent{TenantID: t1.ID, Name: "Calon Baru", Email: strPtr("baru@bh5.test"), Status: "pending", PaymentStatus: "awaiting_proof", ReferralCode: "BH5P1"}
	again := &repository.Agent{TenantID: t1.ID, Name: "Calon Ulang", Email: strPtr("ulang@bh5.test"), Status: "rejected", PaymentStatus: "rejected", ReferralCode: "BH5P2"}
	_ = agents.Create(ctx, t1.ID, first)
	_ = agents.Create(ctx, t1.ID, again)
	admins := &mockAdminUserRepo{users: map[string]*repository.AdminUser{
		"a1": {ID: 501, TenantID: t1.ID, Email: "a1", Status: "active"},
		"a2": {ID: 502, TenantID: t1.ID, Email: "a2", Status: "inactive"},
		"b1": {ID: 601, TenantID: t2.ID, Email: "b1", Status: "active"},
	}}
	notifs := &mockNotifRepo{}
	svc := service.NewAgentService(agents, newMockAgentSessionRepo(agents), tenantRepo, &mockCommissionLedgerRepo{}, newMockProspectRepo(),
		newMockCommissionPayoutRequestRepo(), admins, service.NewNotificationService(notifs), nil)

	if _, err := svc.UpdatePaymentProof(ctx, t1.ID, first.ID, "/uploads/a.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdatePaymentProof(ctx, t1.ID, again.ID, "/uploads/b.jpg"); err != nil {
		t.Fatal(err)
	}
	var got []repository.Notification
	for _, n := range notifs.notifs {
		if n.RecipientType == "admin" {
			got = append(got, n)
		}
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 notifications (active admin of the agent's travel only), got %+v", got)
	}
	for _, n := range got {
		if n.RecipientID != 501 || n.TenantID == nil || *n.TenantID != t1.ID || n.Type != "agent_payment_proof_uploaded" {
			t.Fatalf("wrong recipient or tenant: %+v", n)
		}
	}
	if !strings.Contains(got[1].Body, "Calon Ulang") || got[1].Title != "Agen mendaftar ulang" {
		t.Fatalf("re-upload after rejection should say so, got %+v", got[1])
	}
}

func TestBH5_AgentProfileEmailAndLengthValidation(t *testing.T) {
	e := setupBH5PayoutEnv(t)
	cases := []struct {
		name string
		body map[string]interface{}
		want string
	}{
		{"invalid email", map[string]interface{}{"email": "abc"}, "format email tidak valid"},
		{"email with display name", map[string]interface{}{"email": "Budi <budi@x.id>"}, "format email tidak valid"},
		{"too long email", map[string]interface{}{"email": strings.Repeat("a", 251) + "@x.id"}, "email maksimal 255 karakter"},
		{"too long bank name", map[string]interface{}{"bank_name": strings.Repeat("B", 101)}, "nama bank maksimal 100 karakter"},
		{"too long account number", map[string]interface{}{"bank_account_number": strings.Repeat("1", 51)}, "nomor rekening maksimal 50 karakter"},
		{"too long holder", map[string]interface{}{"bank_account_holder": strings.Repeat("H", 151)}, "nama pemilik rekening maksimal 150 karakter"},
	}
	for _, c := range cases {
		t.Run("agent self-update: "+c.name, func(t *testing.T) {
			rec := bh5Do(e.agentRouter, http.MethodPut, "/api/agent/profile", bh5AgentTok, c.body)
			if rec.Code != http.StatusBadRequest || bh5Error(t, rec) != c.want {
				t.Fatalf("expected 400 %q, got %d: %s", c.want, rec.Code, rec.Body.String())
			}
		})
	}
	if *e.agent1.Email != "satu@bh5.test" {
		t.Fatalf("refused updates must not change the email, got %q", *e.agent1.Email)
	}
	t.Run("admin update: invalid email -> 400", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.agent1.ID), bh5AdminT1, map[string]interface{}{"email": "abc"})
		if rec.Code != http.StatusBadRequest || bh5Error(t, rec) != "format email tidak valid" {
			t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("admin update: duplicate email -> 409", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.agent1.ID), bh5AdminT1, map[string]interface{}{"email": "norek@bh5.test"})
		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("admin update: other tenant's agent -> 404", func(t *testing.T) {
		rec := bh5Do(e.adminRouter, http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.agent1.ID), bh5AdminT2, map[string]interface{}{"email": "ok@bh5.test"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("valid email is saved", func(t *testing.T) {
		rec := bh5Do(e.agentRouter, http.MethodPut, "/api/agent/profile", bh5AgentTok, map[string]interface{}{"email": "baru@bh5.test"})
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}
