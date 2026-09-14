package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

func setupAgentAdminDetailTestEnv() (
	adminRouter *chi.Mux,
	agentPublicRouter *chi.Mux,
	agentProtectedRouter *chi.Mux,
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
	fee0 := float64(0)
	minPayout := float64(500000)
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

	pwHashBytes, _ := bcrypt.GenerateFromPassword([]byte("oldpassword123"), bcrypt.DefaultCost)
	pwHashStr := string(pwHashBytes)
	bName := "BCA"
	bNum := "1234567890"
	bHolder := "Fulan"
	ag1 = &repository.Agent{
		TenantID:          t1.ID,
		Name:              "Agen Fulan",
		Email:             strPtr("fulan@amanah.com"),
		Phone:             strPtr("081234567890"),
		PasswordHash:      &pwHashStr,
		Status:            "active",
		PaymentStatus:     "paid",
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

	ag2 = &repository.Agent{
		TenantID:      t2.ID,
		Name:          "Agen Berkah",
		Email:         strPtr("berkah@berkah.com"),
		Phone:         strPtr("089876543210"),
		PasswordHash:  &pwHashStr,
		Status:        "active",
		PaymentStatus: "paid",
		ReferralCode:  "BERKAH1",
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

	// Admin router
	adminSessionRepo = &mockSessionRepo{sessions: make(map[string]*repository.Session)}
	adminRouter = chi.NewRouter()
	adminRouter.Use(middleware.AuthMiddleware(adminSessionRepo))
	agentHandler.RegisterDashboardRoutes(adminRouter)

	// Agent public router (login)
	agentPublicRouter = chi.NewRouter()
	agentHandler.RegisterPublicRoutes(agentPublicRouter)

	// Agent protected router (dashboard-summary)
	agentProtectedRouter = chi.NewRouter()
	agentProtectedRouter.Use(middleware.AgentAuthMiddleware(agentSessionRepo))
	agentHandler.RegisterAgentProtectedRoutes(agentProtectedRouter)

	return
}

func TestAgentAdminDetail_CrossTenantIsolation(t *testing.T) {
	adminRouter, _, _, _, _, _, _, _, adminSessionRepo, t1, _, _, ag2, _ := setupAgentAdminDetailTestEnv()

	// Admin belongs to Tenant 1
	adminSess1 := &repository.Session{
		ID:          1,
		Token:       "admin-tok-t1",
		TenantID:    t1.ID,
		AdminUserID: 99,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	adminSessionRepo.sessions[adminSess1.Token] = adminSess1

	// Admin of Tenant 1 attempts to access Agent 2 (Tenant 2)
	// 1. GET /api/dashboard/agents/{id}
	reqGet := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/agents/%d", ag2.ID), nil)
	reqGet.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	recGet := httptest.NewRecorder()
	adminRouter.ServeHTTP(recGet, reqGet)
	if recGet.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-tenant GET agent, got %d: %s", recGet.Code, recGet.Body.String())
	}

	// 2. PUT /api/dashboard/agents/{id}
	putBody := []byte(`{"name":"Hacked Name"}`)
	reqPut := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", ag2.ID), bytes.NewReader(putBody))
	reqPut.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqPut.Header.Set("Content-Type", "application/json")
	recPut := httptest.NewRecorder()
	adminRouter.ServeHTTP(recPut, reqPut)
	if recPut.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-tenant PUT agent, got %d: %s", recPut.Code, recPut.Body.String())
	}

	// 3. PATCH /api/dashboard/agents/{id}/reset-password
	pwBody := []byte(`{"new_password":"newpassword123"}`)
	reqPw := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/reset-password", ag2.ID), bytes.NewReader(pwBody))
	reqPw.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqPw.Header.Set("Content-Type", "application/json")
	recPw := httptest.NewRecorder()
	adminRouter.ServeHTTP(recPw, reqPw)
	if recPw.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-tenant reset password, got %d: %s", recPw.Code, recPw.Body.String())
	}

	// 4. PATCH /api/dashboard/agents/{id}/toggle-status
	toggleBody := []byte(`{"action":"deactivate"}`)
	reqToggle := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/toggle-status", ag2.ID), bytes.NewReader(toggleBody))
	reqToggle.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqToggle.Header.Set("Content-Type", "application/json")
	recToggle := httptest.NewRecorder()
	adminRouter.ServeHTTP(recToggle, reqToggle)
	if recToggle.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-tenant toggle status, got %d: %s", recToggle.Code, recToggle.Body.String())
	}

	// 5. GET /api/dashboard/agents/{id}/commissions (Isolation check)
	reqComm := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/agents/%d/commissions", ag2.ID), nil)
	reqComm.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	recComm := httptest.NewRecorder()
	adminRouter.ServeHTTP(recComm, reqComm)
	if recComm.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-tenant commissions endpoint, got %d: %s", recComm.Code, recComm.Body.String())
	}
}

func TestAgentAdminDetail_PutProfileValidation(t *testing.T) {
	adminRouter, _, _, agentRepo, _, _, _, _, adminSessionRepo, t1, _, ag1, _, _ := setupAgentAdminDetailTestEnv()

	// Create another agent in Tenant 1 with existing email and phone
	existingEmail := "existing@amanah.com"
	existingPhone := "081999999999"
	agOther := &repository.Agent{
		TenantID:     t1.ID,
		Name:         "Other Agent",
		Email:        &existingEmail,
		Phone:        &existingPhone,
		Status:       "active",
		ReferralCode: "OTHER1",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, agOther)

	adminSess1 := &repository.Session{
		ID:          1,
		Token:       "admin-tok-t1",
		TenantID:    t1.ID,
		AdminUserID: 99,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	adminSessionRepo.sessions[adminSess1.Token] = adminSess1

	// Case 1: Update ag1 with agOther's email -> Expect 400 Duplicate Email
	dupEmailBody := []byte(`{"email":"existing@amanah.com"}`)
	reqDup := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", ag1.ID), bytes.NewReader(dupEmailBody))
	reqDup.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqDup.Header.Set("Content-Type", "application/json")
	recDup := httptest.NewRecorder()
	adminRouter.ServeHTTP(recDup, reqDup)
	if recDup.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when updating with duplicate email, got %d: %s", recDup.Code, recDup.Body.String())
	}

	// Case 2: Update ag1 keeping same email and updating name/domisili -> Expect 200 Success
	validBody := []byte(`{"name":"Agen Fulan Updated","email":"fulan@amanah.com","domisili":"Jakarta Selatan"}`)
	reqValid := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", ag1.ID), bytes.NewReader(validBody))
	reqValid.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqValid.Header.Set("Content-Type", "application/json")
	recValid := httptest.NewRecorder()
	adminRouter.ServeHTTP(recValid, reqValid)
	if recValid.Code != http.StatusOK {
		t.Fatalf("expected 200 when updating profile without changing email, got %d: %s", recValid.Code, recValid.Body.String())
	}

	// Verify database record updated
	updatedAgent, err := agentRepo.GetByID(context.Background(), t1.ID, ag1.ID)
	if err != nil {
		t.Fatalf("failed to fetch updated agent: %v", err)
	}
	if updatedAgent.Name != "Agen Fulan Updated" {
		t.Errorf("expected updated name 'Agen Fulan Updated', got '%s'", updatedAgent.Name)
	}
	if updatedAgent.Domisili == nil || *updatedAgent.Domisili != "Jakarta Selatan" {
		t.Errorf("expected domisili 'Jakarta Selatan', got %v", updatedAgent.Domisili)
	}
}

func TestAgentAdminDetail_ResetPasswordLogin(t *testing.T) {
	adminRouter, agentPublicRouter, _, _, _, _, _, _, adminSessionRepo, t1, _, ag1, _, _ := setupAgentAdminDetailTestEnv()

	adminSess1 := &repository.Session{
		ID:          1,
		Token:       "admin-tok-t1",
		TenantID:    t1.ID,
		AdminUserID: 99,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	adminSessionRepo.sessions[adminSess1.Token] = adminSess1

	// 1. Validation check: password < 8 characters -> 400
	shortBody := []byte(`{"new_password":"short"}`)
	reqShort := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/reset-password", ag1.ID), bytes.NewReader(shortBody))
	reqShort.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqShort.Header.Set("Content-Type", "application/json")
	recShort := httptest.NewRecorder()
	adminRouter.ServeHTTP(recShort, reqShort)
	if recShort.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for short password, got %d: %s", recShort.Code, recShort.Body.String())
	}

	// 2. Admin resets password to "brandnewpassword123"
	resetBody := []byte(`{"new_password":"brandnewpassword123"}`)
	reqReset := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/reset-password", ag1.ID), bytes.NewReader(resetBody))
	reqReset.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqReset.Header.Set("Content-Type", "application/json")
	recReset := httptest.NewRecorder()
	adminRouter.ServeHTTP(recReset, reqReset)
	if recReset.Code != http.StatusOK {
		t.Fatalf("expected 200 for reset password, got %d: %s", recReset.Code, recReset.Body.String())
	}

	// 3. Old password login attempt -> Must fail (401)
	oldLoginBody := []byte(`{"email":"fulan@amanah.com","password":"oldpassword123"}`)
	reqOldLogin := httptest.NewRequest(http.MethodPost, "/api/agent/login", bytes.NewReader(oldLoginBody))
	reqOldLogin.Header.Set("Content-Type", "application/json")
	ctxT1 := middleware.WithTenantID(reqOldLogin.Context(), t1.ID)
	reqOldLogin = reqOldLogin.WithContext(ctxT1)
	recOldLogin := httptest.NewRecorder()
	agentPublicRouter.ServeHTTP(recOldLogin, reqOldLogin)
	if recOldLogin.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for login with old password, got %d: %s", recOldLogin.Code, recOldLogin.Body.String())
	}

	// 4. New password login attempt -> Must succeed (200)
	newLoginBody := []byte(`{"email":"fulan@amanah.com","password":"brandnewpassword123"}`)
	reqNewLogin := httptest.NewRequest(http.MethodPost, "/api/agent/login", bytes.NewReader(newLoginBody))
	reqNewLogin.Header.Set("Content-Type", "application/json")
	ctxT1New := middleware.WithTenantID(reqNewLogin.Context(), t1.ID)
	reqNewLogin = reqNewLogin.WithContext(ctxT1New)
	recNewLogin := httptest.NewRecorder()
	agentPublicRouter.ServeHTTP(recNewLogin, reqNewLogin)
	if recNewLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 for login with new password, got %d: %s", recNewLogin.Code, recNewLogin.Body.String())
	}
}

func TestAgentAdminDetail_ToggleStatusTransitions(t *testing.T) {
	adminRouter, _, _, agentRepo, _, _, _, _, adminSessionRepo, t1, _, ag1, _, _ := setupAgentAdminDetailTestEnv()

	adminSess1 := &repository.Session{
		ID:          1,
		Token:       "admin-tok-t1",
		TenantID:    t1.ID,
		AdminUserID: 99,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	adminSessionRepo.sessions[adminSess1.Token] = adminSess1

	// ag1 is currently 'active'
	// 1. toggle-status "activate" from 'active' status -> Expect 400
	actBody := []byte(`{"action":"activate"}`)
	reqAct := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/toggle-status", ag1.ID), bytes.NewReader(actBody))
	reqAct.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqAct.Header.Set("Content-Type", "application/json")
	recAct := httptest.NewRecorder()
	adminRouter.ServeHTTP(recAct, reqAct)
	if recAct.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when activating an already active agent, got %d: %s", recAct.Code, recAct.Body.String())
	}

	// 2. Create a 'pending' agent in Tenant 1
	pendingEmail := "pending@amanah.com"
	pendingAgent := &repository.Agent{
		TenantID:     t1.ID,
		Name:         "Pending Agent",
		Email:        &pendingEmail,
		Status:       "pending",
		ReferralCode: "PENDING1",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, pendingAgent)

	// toggle-status "deactivate" from 'pending' status -> Expect 400 (must go through approve/reject)
	deactBody := []byte(`{"action":"deactivate"}`)
	reqPendingDeact := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/toggle-status", pendingAgent.ID), bytes.NewReader(deactBody))
	reqPendingDeact.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqPendingDeact.Header.Set("Content-Type", "application/json")
	recPendingDeact := httptest.NewRecorder()
	adminRouter.ServeHTTP(recPendingDeact, reqPendingDeact)
	if recPendingDeact.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when deactivating a pending agent, got %d: %s", recPendingDeact.Code, recPendingDeact.Body.String())
	}

	// 3. Deactivate 'active' agent (ag1) -> Expect 200
	reqValidDeact := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/toggle-status", ag1.ID), bytes.NewReader(deactBody))
	reqValidDeact.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqValidDeact.Header.Set("Content-Type", "application/json")
	recValidDeact := httptest.NewRecorder()
	adminRouter.ServeHTTP(recValidDeact, reqValidDeact)
	if recValidDeact.Code != http.StatusOK {
		t.Fatalf("expected 200 when deactivating active agent, got %d: %s", recValidDeact.Code, recValidDeact.Body.String())
	}

	checkAg1, _ := agentRepo.GetByID(context.Background(), t1.ID, ag1.ID)
	if checkAg1.Status != "inactive" {
		t.Fatalf("expected status 'inactive', got '%s'", checkAg1.Status)
	}

	// 4. Reactivate 'inactive' agent (ag1) -> Expect 200
	reqValidAct := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/toggle-status", ag1.ID), bytes.NewReader(actBody))
	reqValidAct.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	reqValidAct.Header.Set("Content-Type", "application/json")
	recValidAct := httptest.NewRecorder()
	adminRouter.ServeHTTP(recValidAct, reqValidAct)
	if recValidAct.Code != http.StatusOK {
		t.Fatalf("expected 200 when activating inactive agent, got %d: %s", recValidAct.Code, recValidAct.Body.String())
	}

	checkAg1Re, _ := agentRepo.GetByID(context.Background(), t1.ID, ag1.ID)
	if checkAg1Re.Status != "active" {
		t.Fatalf("expected status 'active', got '%s'", checkAg1Re.Status)
	}
}

func TestAgentAdminDetail_SaldoSiapCairParity(t *testing.T) {
	adminRouter, _, agentProtectedRouter, _, _, _, commLedgerRepo, payoutRepo, adminSessionRepo, t1, _, ag1, _, sess1 := setupAgentAdminDetailTestEnv()

	adminSess1 := &repository.Session{
		ID:          1,
		Token:       "admin-tok-t1",
		TenantID:    t1.ID,
		AdminUserID: 99,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	adminSessionRepo.sessions[adminSess1.Token] = adminSess1

	// Add commission and payout data for ag1
	now := time.Now().UTC()
	// Total available direct commission: 3,000,000
	_ = commLedgerRepo.Create(context.Background(), t1.ID, &repository.CommissionLedger{
		TenantID:  t1.ID,
		AgentID:   ag1.ID,
		Type:      "direct",
		Amount:    3000000,
		CreatedAt: now.Add(-3 * time.Hour),
	})
	// One pending payout request of 750,000
	_ = payoutRepo.Create(context.Background(), t1.ID, &repository.CommissionPayoutRequest{
		TenantID:        t1.ID,
		AgentID:         ag1.ID,
		AmountRequested: 750000,
		Status:          "pending",
	})
	// Net ready to payout (saldo_siap_cair) should be 3,000,000 - 750,000 = 2,250,000

	// 1. Query Agent Dashboard Summary: GET /api/agent/dashboard-summary
	reqAgent := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
	reqAgent.Header.Set("Authorization", "Bearer "+sess1.Token)
	recAgent := httptest.NewRecorder()
	agentProtectedRouter.ServeHTTP(recAgent, reqAgent)
	if recAgent.Code != http.StatusOK {
		t.Fatalf("expected 200 for agent dashboard-summary, got %d: %s", recAgent.Code, recAgent.Body.String())
	}

	var agentResp struct {
		SaldoSiapCair float64 `json:"saldo_siap_cair"`
		SaldoTertunda float64 `json:"saldo_tertunda"`
	}
	if err := json.Unmarshal(recAgent.Body.Bytes(), &agentResp); err != nil {
		t.Fatalf("failed to decode agent dashboard-summary response: %v", err)
	}

	// 2. Query Admin Agent Detail: GET /api/dashboard/agents/{id}
	reqAdmin := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/agents/%d", ag1.ID), nil)
	reqAdmin.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	recAdmin := httptest.NewRecorder()
	adminRouter.ServeHTTP(recAdmin, reqAdmin)
	if recAdmin.Code != http.StatusOK {
		t.Fatalf("expected 200 for admin agent detail, got %d: %s", recAdmin.Code, recAdmin.Body.String())
	}

	var adminResp struct {
		SaldoSiapCair    float64 `json:"saldo_siap_cair"`
		SaldoTertunda    float64 `json:"saldo_tertunda"`
		RiwayatPencairan []any   `json:"riwayat_pencairan"`
	}
	if err := json.Unmarshal(recAdmin.Body.Bytes(), &adminResp); err != nil {
		t.Fatalf("failed to decode admin agent detail response: %v", err)
	}

	// Compare saldo_siap_cair & saldo_tertunda
	if adminResp.SaldoSiapCair != agentResp.SaldoSiapCair {
		t.Errorf("saldo_siap_cair mismatch! Admin detail: %v, Agent dashboard-summary: %v", adminResp.SaldoSiapCair, agentResp.SaldoSiapCair)
	}
	if adminResp.SaldoTertunda != agentResp.SaldoTertunda {
		t.Errorf("saldo_tertunda mismatch! Admin detail: %v, Agent dashboard-summary: %v", adminResp.SaldoTertunda, agentResp.SaldoTertunda)
	}
	if adminResp.SaldoSiapCair != 2250000 {
		t.Errorf("expected saldo_siap_cair = 2250000, got %v", adminResp.SaldoSiapCair)
	}
	if len(adminResp.RiwayatPencairan) != 1 {
		t.Errorf("expected 1 item in riwayat_pencairan, got %d", len(adminResp.RiwayatPencairan))
	}
}

func TestAgentAdminDetail_GetDashboardAgentCommissions(t *testing.T) {
	adminRouter, _, _, _, _, _, commLedgerRepo, payoutRepo, adminSessionRepo, t1, _, ag1, _, _ := setupAgentAdminDetailTestEnv()

	now := time.Now().UTC()
	_ = commLedgerRepo.Create(context.Background(), t1.ID, &repository.CommissionLedger{
		TenantID:  t1.ID,
		AgentID:   ag1.ID,
		Type:      "direct",
		Amount:    2000000,
		CreatedAt: now.Add(-2 * time.Hour),
	})
	_ = commLedgerRepo.Create(context.Background(), t1.ID, &repository.CommissionLedger{
		TenantID:  t1.ID,
		AgentID:   ag1.ID,
		Type:      "override",
		Amount:    1000000,
		CreatedAt: now.Add(-1 * time.Hour),
	})
	_ = payoutRepo.Create(context.Background(), t1.ID, &repository.CommissionPayoutRequest{
		TenantID:        t1.ID,
		AgentID:         ag1.ID,
		AmountRequested: 750000,
		Status:          "pending",
		CreatedAt:       now,
	})

	adminSess1 := &repository.Session{
		ID:          1,
		Token:       "admin-tok-t1",
		TenantID:    t1.ID,
		AdminUserID: 99,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	adminSessionRepo.sessions[adminSess1.Token] = adminSess1

	// Call GET /api/dashboard/agents/{id}/commissions
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/agents/%d/commissions", ag1.ID), nil)
	req.Header.Set("Authorization", "Bearer "+adminSess1.Token)
	rec := httptest.NewRecorder()
	adminRouter.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for commissions, got %d: %s", rec.Code, rec.Body.String())
	}

	var items []service.CommissionHistoryItem
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// From setupAgentAdminDetailTestEnv:
	// 2 ledger items (direct 2.000.000 + override 1.000.000)
	// 1 payout item (750.000)
	// Total items = 3
	if len(items) != 3 {
		t.Fatalf("expected 3 commission history items, got %d", len(items))
	}

	// Verify direction flags exist
	var hasMasuk, hasKeluar bool
	for _, it := range items {
		if it.Direction == "masuk" {
			hasMasuk = true
		}
		if it.Direction == "keluar" {
			hasKeluar = true
		}
	}
	if !hasMasuk || !hasKeluar {
		t.Errorf("expected both 'masuk' and 'keluar' directions, got masuk=%v, keluar=%v", hasMasuk, hasKeluar)
	}
}
