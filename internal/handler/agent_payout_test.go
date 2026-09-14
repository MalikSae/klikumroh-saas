package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type mockCommissionPayoutRequestRepo struct {
	requests map[uint64]*repository.CommissionPayoutRequest
	nextID   uint64
}

func newMockCommissionPayoutRequestRepo() *mockCommissionPayoutRequestRepo {
	return &mockCommissionPayoutRequestRepo{
		requests: make(map[uint64]*repository.CommissionPayoutRequest),
		nextID:   1,
	}
}

func (m *mockCommissionPayoutRequestRepo) Create(ctx context.Context, tenantID uint64, req *repository.CommissionPayoutRequest) error {
	req.TenantID = tenantID
	req.ID = m.nextID
	m.nextID++
	if req.CreatedAt.IsZero() {
		now := time.Now().UTC()
		req.CreatedAt = now
		req.UpdatedAt = now
	}
	if req.Status == "" {
		req.Status = "pending"
	}
	copy := *req
	m.requests[req.ID] = &copy
	return nil
}

func (m *mockCommissionPayoutRequestRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.CommissionPayoutRequest, error) {
	req, ok := m.requests[id]
	if !ok || req.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	copy := *req
	return &copy, nil
}

func (m *mockCommissionPayoutRequestRepo) GetActiveRequestByAgent(ctx context.Context, tenantID uint64, agentID uint64) (*repository.CommissionPayoutRequest, error) {
	for _, req := range m.requests {
		if req.TenantID == tenantID && req.AgentID == agentID && (req.Status == "pending" || req.Status == "approved") {
			copy := *req
			return &copy, nil
		}
	}
	return nil, nil
}

func (m *mockCommissionPayoutRequestRepo) SumPendingApprovedPaidByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error) {
	var sum float64
	for _, req := range m.requests {
		if req.TenantID == tenantID && req.AgentID == agentID && (req.Status == "pending" || req.Status == "approved" || req.Status == "paid") {
			sum += req.AmountRequested
		}
	}
	return sum, nil
}

func (m *mockCommissionPayoutRequestRepo) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.CommissionPayoutRequestItem, error) {
	var items []repository.CommissionPayoutRequestItem
	for _, req := range m.requests {
		if req.TenantID == tenantID {
			if statusFilter != nil && *statusFilter != "" && req.Status != *statusFilter {
				continue
			}
			items = append(items, repository.CommissionPayoutRequestItem{
				CommissionPayoutRequest: *req,
				AgentName:               "Test Agent",
			})
		}
	}
	return items, nil
}

func (m *mockCommissionPayoutRequestRepo) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]repository.CommissionPayoutRequest, error) {
	var items []repository.CommissionPayoutRequest
	for _, req := range m.requests {
		if req.TenantID == tenantID && req.AgentID == agentID {
			copy := *req
			items = append(items, copy)
		}
	}
	return items, nil
}

func (m *mockCommissionPayoutRequestRepo) UpdateStatus(
	ctx context.Context,
	tenantID uint64,
	id uint64,
	fromStatus, toStatus string,
	reviewedBy *uint64,
	reviewedAt *time.Time,
	rejectionReason *string,
) error {
	req, ok := m.requests[id]
	if !ok || req.TenantID != tenantID {
		return repository.ErrNotFound
	}
	if req.Status != fromStatus {
		return fmt.Errorf("pengajuan tidak ditemukan atau status saat ini bukan '%s'", fromStatus)
	}
	req.Status = toStatus
	req.ReviewedBy = reviewedBy
	req.ReviewedAt = reviewedAt
	req.RejectionReason = rejectionReason
	req.UpdatedAt = time.Now().UTC()
	return nil
}

func setupAgentPayoutTestEnv() (
	agentRouter *chi.Mux,
	adminRouter *chi.Mux,
	agentRepo *mockAgentRepo,
	agentSessionRepo *mockAgentSessionRepo,
	tenantRepo *mockTenantRepo,
	commLedgerRepo *mockCommissionLedgerRepo,
	payoutRepo *mockCommissionPayoutRequestRepo,
	adminSessionRepo *mockSessionRepo,
	t1 *repository.Tenant,
	t2 *repository.Tenant,
	ag1 *repository.Agent,
	ag2 *repository.Agent,
	sess1 *repository.AgentSession,
) {
	tenantRepo = newMockTenantRepo()
	minPayout := float64(500000)
	fee0 := float64(0)
	t1 = &repository.Tenant{
		Name:                 "Travel Amanah",
		Slug:                 "amanah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
		MinimumPayoutAmount:  &minPayout,
	}
	_ = tenantRepo.Create(context.Background(), t1)

	t2 = &repository.Tenant{
		Name:                 "Travel Berkah",
		Slug:                 "berkah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
		MinimumPayoutAmount:  &minPayout,
	}
	_ = tenantRepo.Create(context.Background(), t2)

	agentRepo = newMockAgentRepo()
	agentSessionRepo = newMockAgentSessionRepo(agentRepo)

	// Agent 1 in Tenant 1
	bName := "BCA"
	bNum := "1234567890"
	bHolder := "Fulan"
	ag1 = &repository.Agent{
		TenantID:          t1.ID,
		Name:              "Agen Fulan",
		Email:             strPtr("fulan@amanah.com"),
		Status:            "active",
		ReferralCode:      "FULAN1",
		BankName:          &bName,
		BankAccountNumber: &bNum,
		BankAccountHolder: &bHolder,
	}
	_ = agentRepo.Create(context.Background(), t1.ID, ag1)
	sess1 = &repository.AgentSession{
		TenantID:  t1.ID,
		AgentID:   ag1.ID,
		Token:     "tok-fulan",
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	_ = agentSessionRepo.Create(context.Background(), sess1)

	// Agent 2 in Tenant 2
	ag2 = &repository.Agent{
		TenantID:     t2.ID,
		Name:         "Agen Berkah",
		Email:        strPtr("berkah@berkah.com"),
		Status:       "active",
		ReferralCode: "BERKAH1",
	}
	_ = agentRepo.Create(context.Background(), t2.ID, ag2)

	commLedgerRepo = &mockCommissionLedgerRepo{}
	prospectRepo := newMockProspectRepo()
	prospectRepo.agentRepo = agentRepo
	payoutRepo = newMockCommissionPayoutRequestRepo()

	agentService := service.NewAgentService(
		agentRepo,
		agentSessionRepo,
		tenantRepo,
		commLedgerRepo,
		prospectRepo,
		payoutRepo,
		nil,
		nil,
		nil,
	)
	agentHandler := handler.NewAgentHandler(agentService)

	// Agent Router
	agentRouter = chi.NewRouter()
	agentRouter.Use(middleware.AgentAuthMiddleware(agentSessionRepo))
	agentHandler.RegisterAgentProtectedRoutes(agentRouter)

	// Admin Router
	adminSessionRepo = &mockSessionRepo{sessions: make(map[string]*repository.Session)}
	adminRouter = chi.NewRouter()
	adminRouter.Use(middleware.AuthMiddleware(adminSessionRepo))
	agentHandler.RegisterDashboardRoutes(adminRouter)

	return
}

func TestAgentPayout_EndToEnd_ValidationAndCrossTenant(t *testing.T) {
	agentRouter, adminRouter, agentRepo, _, _, commLedgerRepo, payoutRepo, adminSessionRepo, t1, t2, ag1, ag2, sess1 := setupAgentPayoutTestEnv()
	_ = ag2

	// Setup Admin User Session in Tenant 1 (adminUserID = 99)
	adminSess1 := &repository.Session{
		ID:          1,
		Token:       "admin-tok-t1",
		TenantID:    t1.ID,
		AdminUserID: 99,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	_ = adminSessionRepo.Create(context.Background(), t1.ID, adminSess1)

	// Setup Admin User Session in Tenant 2 (adminUserID = 88)
	adminSess2 := &repository.Session{
		ID:          2,
		Token:       "admin-tok-t2",
		TenantID:    t2.ID,
		AdminUserID: 88,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	_ = adminSessionRepo.Create(context.Background(), t2.ID, adminSess2)

	// Give Agent 1 some commission earned in commission_ledger (Rp 3.000.000)
	_ = commLedgerRepo.Create(context.Background(), t1.ID, &repository.CommissionLedger{
		TenantID: t1.ID,
		AgentID:  ag1.ID,
		Amount:   3000000,
	})

	t.Run("1. Amount di bawah minimum -> 400", func(t *testing.T) {
		payload := map[string]interface{}{
			"amount_requested":    400000, // min is 500.000
			"bank_name":           "BCA",
			"bank_account_number": "1234567890",
			"bank_account_holder": "Fulan",
		}
		jsonBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/agent/payout-requests", bytes.NewReader(jsonBytes))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		agentRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("2. Amount melebihi saldo tersedia (server re-calc) -> 400", func(t *testing.T) {
		payload := map[string]interface{}{
			"amount_requested":    5000000, // available is 3.000.000
			"bank_name":           "BCA",
			"bank_account_number": "1234567890",
			"bank_account_holder": "Fulan",
		}
		jsonBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/agent/payout-requests", bytes.NewReader(jsonBytes))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		agentRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	var createdPayoutID uint64

	t.Run("3. Submit sukses -> 201 Created & check snapshot bank details", func(t *testing.T) {
		payload := map[string]interface{}{
			"amount_requested":    1000000,
			"bank_name":           "Mandiri",
			"bank_account_number": "9876543210",
			"bank_account_holder": "Fulan Snapshot",
		}
		jsonBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/agent/payout-requests", bytes.NewReader(jsonBytes))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		agentRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
		}

		var created repository.CommissionPayoutRequest
		_ = json.NewDecoder(rec.Body).Decode(&created)
		createdPayoutID = created.ID

		if created.AmountRequested != 1000000 {
			t.Errorf("expected 1000000, got %v", created.AmountRequested)
		}
		if created.BankNameSnapshot != "Mandiri" || created.BankAccountNumberSnapshot != "9876543210" || created.BankAccountHolderSnapshot != "Fulan Snapshot" {
			t.Errorf("snapshot bank details mismatch: %+v", created)
		}
	})

	t.Run("4. Bank detail snapshot preserved saat agents.bank_name diubah setelahnya", func(t *testing.T) {
		// Ubah bank detail agent di tabel agents
		newBName := "BSI"
		newBNum := "555555555"
		newBHolder := "Fulan Baru"
		_ = agentRepo.UpdateBankInfo(context.Background(), t1.ID, ag1.ID, newBName, newBNum, newBHolder)

		// Ambil payout request lama
		savedReq, err := payoutRepo.GetByID(context.Background(), t1.ID, createdPayoutID)
		if err != nil {
			t.Fatalf("failed getting payout: %v", err)
		}

		if savedReq.BankNameSnapshot != "Mandiri" || savedReq.BankAccountNumberSnapshot != "9876543210" || savedReq.BankAccountHolderSnapshot != "Fulan Snapshot" {
			t.Fatalf("snapshot was mutated! expected Mandiri snapshot, got: %+v", savedReq)
		}
	})

	t.Run("5. Agent dengan pending request coba submit lagi -> 400", func(t *testing.T) {
		payload := map[string]interface{}{
			"amount_requested":    1000000,
			"bank_name":           "Mandiri",
			"bank_account_number": "9876543210",
			"bank_account_holder": "Fulan Snapshot",
		}
		jsonBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/agent/payout-requests", bytes.NewReader(jsonBytes))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		agentRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d: %s", rec.Code, rec.Body.String())
		}
		var resp map[string]string
		_ = json.NewDecoder(rec.Body).Decode(&resp)
		if resp["error"] != "Anda masih punya pengajuan yang sedang diproses" {
			t.Errorf("expected error message 'Anda masih punya pengajuan yang sedang diproses', got '%s'", resp["error"])
		}
	})

	t.Run("6. Saldo siap cair di dashboard-summary berkurang sesuai jumlah diajukan (3jt - 1jt = 2jt)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		rec := httptest.NewRecorder()
		agentRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var summary service.AgentDashboardSummary
		_ = json.NewDecoder(rec.Body).Decode(&summary)

		if summary.SaldoSiapCair != 2000000 {
			t.Errorf("expected saldo_siap_cair=2000000, got %v", summary.SaldoSiapCair)
		}
	})

	t.Run("7. Admin approve dari status bukan pending -> ditolak", func(t *testing.T) {
		// Buat request palsu berstatus 'approved'
		approvedReq := &repository.CommissionPayoutRequest{
			TenantID:                  t1.ID,
			AgentID:                   ag1.ID,
			AmountRequested:           500000,
			Status:                    "approved",
			BankNameSnapshot:          "BCA",
			BankAccountNumberSnapshot: "111",
			BankAccountHolderSnapshot: "Fulan",
		}
		_ = payoutRepo.Create(context.Background(), t1.ID, approvedReq)

		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/approve", approvedReq.ID), nil)
		req.Header.Set("Authorization", "Bearer admin-tok-t1")
		rec := httptest.NewRecorder()
		adminRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for approving non-pending request, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("8. Admin mark paid dari status bukan approved -> ditolak", func(t *testing.T) {
		// createdPayoutID masih berstatus 'pending'
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/paid", createdPayoutID), nil)
		req.Header.Set("Authorization", "Bearer admin-tok-t1")
		rec := httptest.NewRecorder()
		adminRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for marking paid from pending, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("9. Admin reject tanpa rejection_reason -> 400", func(t *testing.T) {
		payload := map[string]string{
			"rejection_reason": "   ",
		}
		jsonBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/reject", createdPayoutID), bytes.NewReader(jsonBytes))
		req.Header.Set("Authorization", "Bearer admin-tok-t1")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		adminRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for empty rejection reason, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("10. Admin approve pending -> approved sukses", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/approve", createdPayoutID), nil)
		req.Header.Set("Authorization", "Bearer admin-tok-t1")
		rec := httptest.NewRecorder()
		adminRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		saved, _ := payoutRepo.GetByID(context.Background(), t1.ID, createdPayoutID)
		if saved.Status != "approved" || saved.ReviewedBy == nil || *saved.ReviewedBy != 99 {
			t.Errorf("expected approved with reviewed_by=99, got %+v", saved)
		}
	})

	t.Run("11. Admin mark approved -> paid sukses", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/payout-requests/%d/paid", createdPayoutID), nil)
		req.Header.Set("Authorization", "Bearer admin-tok-t1")
		rec := httptest.NewRecorder()
		adminRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		saved, _ := payoutRepo.GetByID(context.Background(), t1.ID, createdPayoutID)
		if saved.Status != "paid" {
			t.Errorf("expected paid, got %s", saved.Status)
		}
	})

	t.Run("12. Cross-tenant isolasi: Admin Tenant 2 tidak bisa melihat / mengubah request Tenant 1", func(t *testing.T) {
		// List: Admin T2 list payout-requests -> 0 data
		reqList := httptest.NewRequest(http.MethodGet, "/api/dashboard/payout-requests", nil)
		reqList.Header.Set("Authorization", "Bearer admin-tok-t2")
		recList := httptest.NewRecorder()
		adminRouter.ServeHTTP(recList, reqList)

		if recList.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", recList.Code)
		}
		var items []repository.CommissionPayoutRequestItem
		_ = json.NewDecoder(recList.Body).Decode(&items)
		for _, item := range items {
			if item.TenantID != t2.ID {
				t.Fatalf("cross-tenant leak: Admin T2 saw item belonging to tenant %d", item.TenantID)
			}
		}

		// Approve: Admin T2 mencoba approve payout request milik Tenant 1
		reqApprove := httptest.NewRequest(http.MethodPatch, "/api/dashboard/payout-requests/"+strconv.FormatUint(createdPayoutID, 10)+"/approve", nil)
		reqApprove.Header.Set("Authorization", "Bearer admin-tok-t2")
		recApprove := httptest.NewRecorder()
		adminRouter.ServeHTTP(recApprove, reqApprove)

		if recApprove.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request when cross-tenant approving, got %d: %s", recApprove.Code, recApprove.Body.String())
		}
	})
}
