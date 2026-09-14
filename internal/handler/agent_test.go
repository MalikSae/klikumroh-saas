package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

func setupAgentTestRouter() (
	chi.Router,
	*mockAgentRepo,
	*mockAgentSessionRepo,
	*mockTenantRepo,
	*repository.Tenant,
	*repository.Tenant,
) {
	agentRepo := newMockAgentRepo()
	sessionRepo := newMockAgentSessionRepo(agentRepo)
	tenantRepo := newMockTenantRepo()

	fee0 := float64(0)
	t1 := &repository.Tenant{
		Name:                 "Travel Amanah",
		Slug:                 "amanah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
	}
	_ = tenantRepo.Create(context.Background(), t1)

	fee150 := float64(1500000)
	t2 := &repository.Tenant{
		Name:                 "Travel Berkah",
		Slug:                 "berkah",
		Status:               "active",
		AgentRegistrationFee: &fee150,
	}
	_ = tenantRepo.Create(context.Background(), t2)

	commissionLedgerRepo := &mockCommissionLedgerRepo{}
	prospectRepo := newMockProspectRepo()
	prospectRepo.agentRepo = agentRepo
	payoutRepo := newMockCommissionPayoutRequestRepo()

	agentService := service.NewAgentService(agentRepo, sessionRepo, tenantRepo, commissionLedgerRepo, prospectRepo, payoutRepo, nil, nil, nil)
	agentHandler := handler.NewAgentHandler(agentService)

	r := chi.NewRouter()

	// Public routes
	agentHandler.RegisterPublicRoutes(r)

	// Protected agent routes
	r.Group(func(ar chi.Router) {
		ar.Use(middleware.AgentAuthMiddleware(sessionRepo))
		agentHandler.RegisterAgentProtectedRoutes(ar)
	})

	// Protected dashboard routes
	r.Group(func(dr chi.Router) {
		agentHandler.RegisterDashboardRoutes(dr)
	})

	return r, agentRepo, sessionRepo, tenantRepo, t1, t2
}

// createDummyPNG creates a valid PNG image byte buffer for testing uploads.
func createDummyPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 50, 50))
	for y := 0; y < 50; y++ {
		for x := 0; x < 50; x++ {
			img.Set(x, y, color.RGBA{R: 0, G: 200, B: 50, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode dummy png: %v", err)
	}
	return buf.Bytes()
}

// 1. Registrasi mode gratis: status='pending', payment_status='not_applicable', password ter-hash bcrypt
func TestAgentHandler_Register_FreeMode(t *testing.T) {
	r, agentRepo, _, _, t1, _ := setupAgentTestRouter()

	body, _ := json.Marshal(map[string]string{
		"name":     "Ahmad Fauzi",
		"phone":    "081234567890",
		"email":    "ahmad@example.com",
		"password": "secretPassword123",
		"domisili": "Kota Bandung",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(body))
	req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Agent struct {
			ID            uint64 `json:"id"`
			Name          string `json:"name"`
			Status        string `json:"status"`
			PaymentStatus string `json:"payment_status"`
			ReferralCode  string `json:"referral_code"`
		} `json:"agent"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Token == "" {
		t.Error("expected non-empty auth token on register")
	}
	if resp.Agent.Status != "pending" {
		t.Errorf("expected status 'pending', got %s", resp.Agent.Status)
	}
	if resp.Agent.PaymentStatus != "not_applicable" {
		t.Errorf("expected payment_status 'not_applicable', got %s", resp.Agent.PaymentStatus)
	}
	if len(resp.Agent.ReferralCode) < 4 {
		t.Errorf("expected generated referral code, got %s", resp.Agent.ReferralCode)
	}

	// Verify DB password hash is bcrypt
	savedAgent, err := agentRepo.GetByID(context.Background(), t1.ID, resp.Agent.ID)
	if err != nil {
		t.Fatalf("failed to find agent in repo: %v", err)
	}
	if savedAgent.PasswordHash == nil || *savedAgent.PasswordHash == "" {
		t.Fatal("expected password_hash to be saved")
	}
	if !util.CheckPasswordHash("secretPassword123", *savedAgent.PasswordHash) {
		t.Error("bcrypt hash does not match original plain password")
	}
}

// 2. Registrasi mode berbayar: status='pending', payment_status='awaiting_proof'
func TestAgentHandler_Register_PaidMode(t *testing.T) {
	r, agentRepo, _, tenantRepo, _, t2 := setupAgentTestRouter()

	// Configure t2 with bank info and fee
	t2Bank := "BCA"
	t2Acc := "1234567890"
	t2Holder := "PT Travel Berkah"
	fee150 := float64(1500000)
	_ = tenantRepo.UpdateAgentSettings(context.Background(), t2.ID, &repository.TenantAgentSettings{
		AgentRegistrationFee:   &fee150,
		AgentBankName:          &t2Bank,
		AgentBankAccountNumber: &t2Acc,
		AgentBankAccountHolder: &t2Holder,
	})

	body, _ := json.Marshal(map[string]string{
		"name":     "Budi Santoso",
		"phone":    "081987654321",
		"email":    "budi@example.com",
		"password": "password456",
		"domisili": "Jakarta Selatan",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(body))
	req = req.WithContext(middleware.WithTenantID(req.Context(), t2.ID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Agent struct {
			ID            uint64 `json:"id"`
			Status        string `json:"status"`
			PaymentStatus string `json:"payment_status"`
		} `json:"agent"`
		Token string `json:"token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.Agent.Status != "pending" {
		t.Errorf("expected status 'pending', got %s", resp.Agent.Status)
	}
	if resp.Agent.PaymentStatus != "awaiting_proof" {
		t.Errorf("expected payment_status 'awaiting_proof', got %s", resp.Agent.PaymentStatus)
	}

	saved, err := agentRepo.GetByID(context.Background(), t2.ID, resp.Agent.ID)
	if err != nil {
		t.Fatalf("failed to get agent from repo: %v", err)
	}
	if saved.PaymentStatus != "awaiting_proof" {
		t.Errorf("expected repo payment_status 'awaiting_proof', got %s", saved.PaymentStatus)
	}
}

// 3. Duplicate email per tenant -> 409 Conflict
func TestAgentHandler_Register_DuplicateEmailSameTenant(t *testing.T) {
	r, _, _, _, t1, _ := setupAgentTestRouter()

	body1, _ := json.Marshal(map[string]string{
		"name":     "User Pertama",
		"phone":    "0811111111",
		"email":    "duplicate@example.com",
		"password": "password123",
		"domisili": "Kota Bandung",
	})
	req1 := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(body1))
	req1 = req1.WithContext(middleware.WithTenantID(req1.Context(), t1.ID))
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("first registration failed: %d %s", w1.Code, w1.Body.String())
	}

	// Second registration with same email
	body2, _ := json.Marshal(map[string]string{
		"name":     "User Kedua",
		"phone":    "0822222222",
		"email":    "duplicate@example.com",
		"password": "password123",
		"domisili": "Kota Bandung",
	})
	req2 := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(body2))
	req2 = req2.WithContext(middleware.WithTenantID(req2.Context(), t1.ID))
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusConflict {
		t.Errorf("expected 409 Conflict, got %d: %s", w2.Code, w2.Body.String())
	}
}

// 4. Same email BEDA tenant -> berhasil (isolasi tenant)
func TestAgentHandler_Register_SameEmailDifferentTenant(t *testing.T) {
	r, _, _, _, t1, t2 := setupAgentTestRouter()

	email := "shared@example.com"

	// Register on Tenant 1
	body1, _ := json.Marshal(map[string]string{
		"name":     "Agent T1",
		"phone":    "0811111111",
		"email":    email,
		"password": "password123",
		"domisili": "Kota Bandung",
	})
	req1 := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(body1))
	req1 = req1.WithContext(middleware.WithTenantID(req1.Context(), t1.ID))
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("registration on Tenant 1 failed: %d %s", w1.Code, w1.Body.String())
	}

	// Register SAME email on Tenant 2 -> should succeed!
	body2, _ := json.Marshal(map[string]string{
		"name":     "Agent T2",
		"phone":    "0822222222",
		"email":    email,
		"password": "password123",
		"domisili": "Kota Bandung",
	})
	req2 := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(body2))
	req2 = req2.WithContext(middleware.WithTenantID(req2.Context(), t2.ID))
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusCreated {
		t.Errorf("expected 201 Created for same email on different tenant, got %d: %s", w2.Code, w2.Body.String())
	}
}

// 5. Duplicate phone per tenant -> 409 Conflict
func TestAgentHandler_Register_DuplicatePhoneSameTenant(t *testing.T) {
	r, _, _, _, t1, _ := setupAgentTestRouter()

	phone := "081234567890"

	body1, _ := json.Marshal(map[string]string{
		"name":     "Phone User 1",
		"phone":    phone,
		"email":    "user1@example.com",
		"password": "password123",
		"domisili": "Kota Bandung",
	})
	req1 := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(body1))
	req1 = req1.WithContext(middleware.WithTenantID(req1.Context(), t1.ID))
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("first registration failed: %d %s", w1.Code, w1.Body.String())
	}

	body2, _ := json.Marshal(map[string]string{
		"name":     "Phone User 2",
		"phone":    phone,
		"email":    "user2@example.com",
		"password": "password123",
		"domisili": "Kota Bandung",
	})
	req2 := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(body2))
	req2 = req2.WithContext(middleware.WithTenantID(req2.Context(), t1.ID))
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusConflict {
		t.Errorf("expected 409 Conflict on duplicate phone, got %d: %s", w2.Code, w2.Body.String())
	}
}

// 6. Login berhasil -> token valid, status-agnostic
func TestAgentHandler_Login_StatusAgnostic(t *testing.T) {
	r, agentRepo, _, _, t1, _ := setupAgentTestRouter()

	plainPass := "securePass123"
	hash, _ := util.HashPassword(plainPass)

	// Create pending agent
	emailPending := "pending@example.com"
	agentPending := &repository.Agent{
		TenantID:      t1.ID,
		Name:          "Pending Agent",
		Email:         &emailPending,
		PasswordHash:  &hash,
		Status:        "pending",
		PaymentStatus: "not_applicable",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, agentPending)

	// Create active agent
	emailActive := "active@example.com"
	agentActive := &repository.Agent{
		TenantID:      t1.ID,
		Name:          "Active Agent",
		Email:         &emailActive,
		PasswordHash:  &hash,
		Status:        "active",
		PaymentStatus: "verified",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, agentActive)

	// Create rejected agent
	emailRejected := "rejected@example.com"
	agentRejected := &repository.Agent{
		TenantID:      t1.ID,
		Name:          "Rejected Agent",
		Email:         &emailRejected,
		PasswordHash:  &hash,
		Status:        "rejected",
		PaymentStatus: "not_applicable",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, agentRejected)

	testCases := []struct {
		name     string
		email    string
		password string
		wantCode int
	}{
		{"Pending agent can login", emailPending, plainPass, http.StatusOK},
		{"Active agent can login", emailActive, plainPass, http.StatusOK},
		{"Rejected agent can login to check status", emailRejected, plainPass, http.StatusOK},
		{"Wrong password gets 401", emailActive, "wrongpass", http.StatusUnauthorized},
		{"Non-existent email gets 401", "unknown@example.com", plainPass, http.StatusUnauthorized},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(map[string]string{
				"email":    tc.email,
				"password": tc.password,
			})
			req := httptest.NewRequest(http.MethodPost, "/api/agent/login", bytes.NewReader(body))
			req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tc.wantCode {
				t.Errorf("expected %d, got %d: %s", tc.wantCode, w.Code, w.Body.String())
			}

			if tc.wantCode == http.StatusOK {
				var resp struct {
					Token string `json:"token"`
				}
				_ = json.Unmarshal(w.Body.Bytes(), &resp)
				if resp.Token == "" {
					t.Error("expected non-empty token on successful login")
				}
			}
		})
	}
}

// 7. GET /api/agent/me: cross-tenant isolation and conditional bank info
func TestAgentHandler_GetMe(t *testing.T) {
	r, agentRepo, sessionRepo, tenantRepo, t1, t2 := setupAgentTestRouter()

	// Configure bank info on T1
	bName := "BSI"
	bAcc := "777888999"
	bHolder := "Travel Amanah PT"
	fee750 := float64(750000)
	_ = tenantRepo.UpdateAgentSettings(context.Background(), t1.ID, &repository.TenantAgentSettings{
		AgentRegistrationFee:   &fee750,
		AgentBankName:          &bName,
		AgentBankAccountNumber: &bAcc,
		AgentBankAccountHolder: &bHolder,
	})

	// Create Agent 1 on T1 with awaiting_proof
	email1 := "agent1@example.com"
	agent1 := &repository.Agent{
		TenantID:      t1.ID,
		Name:          "Agent One",
		Email:         &email1,
		Status:        "pending",
		PaymentStatus: "awaiting_proof",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, agent1)

	token1 := "token-agent-1"
	_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
		AgentID:   agent1.ID,
		Token:     token1,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	})

	// Create Agent 2 on T1 with verified status
	email2 := "agent2@example.com"
	agent2 := &repository.Agent{
		TenantID:      t1.ID,
		Name:          "Agent Two",
		Email:         &email2,
		Status:        "active",
		PaymentStatus: "verified",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, agent2)

	token2 := "token-agent-2"
	_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
		AgentID:   agent2.ID,
		Token:     token2,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	})

	t.Run("Cross-tenant access blocked (Agent of T1 accessing under T2 domain/context)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/agent/me", nil)
		req.Header.Set("Authorization", "Bearer "+token1)
		// Request arrives with tenant context of T2
		req = req.WithContext(middleware.WithTenantID(req.Context(), t2.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for cross-tenant agent request, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Bank info displayed when awaiting_proof", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/agent/me", nil)
		req.Header.Set("Authorization", "Bearer "+token1)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			PaymentInfo *struct {
				BankAccountName *string `json:"bank_name"`
				BankAccountNum  *string `json:"bank_account_number"`
			} `json:"payment_info"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		if resp.PaymentInfo == nil || resp.PaymentInfo.BankAccountName == nil || *resp.PaymentInfo.BankAccountName != "BSI" {
			t.Errorf("expected bank name 'BSI', got %v", resp.PaymentInfo)
		}
		if resp.PaymentInfo == nil || resp.PaymentInfo.BankAccountNum == nil || *resp.PaymentInfo.BankAccountNum != "777888999" {
			t.Errorf("expected bank account '777888999', got %v", resp.PaymentInfo)
		}
	})

	t.Run("Bank info omitted when verified", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/agent/me", nil)
		req.Header.Set("Authorization", "Bearer "+token2)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			PaymentInfo *struct {
				BankAccountName *string `json:"bank_name"`
				BankAccountNum  *string `json:"bank_account_number"`
			} `json:"payment_info"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		if resp.PaymentInfo != nil {
			t.Errorf("expected bank info to be omitted when payment_status is verified, got %v", resp.PaymentInfo)
		}
	})
}

// 8. Upload bukti transfer: WebP valid tersimpan, status berubah 'pending_verification'. File bukan gambar ditolak.
func TestAgentHandler_UploadPaymentProof(t *testing.T) {
	r, agentRepo, sessionRepo, _, t1, _ := setupAgentTestRouter()

	email := "uploader@example.com"
	agent := &repository.Agent{
		TenantID:      t1.ID,
		Name:          "Uploader Agent",
		Email:         &email,
		Status:        "pending",
		PaymentStatus: "awaiting_proof",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, agent)

	token := "token-uploader"
	_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
		AgentID:   agent.ID,
		Token:     token,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	})

	t.Run("Valid image upload succeeds, saves WebP, and updates status", func(t *testing.T) {
		imgBytes := createDummyPNG(t)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "transfer-receipt.png")
		if err != nil {
			t.Fatalf("failed to create form file: %v", err)
		}
		_, _ = io.Copy(part, bytes.NewReader(imgBytes))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/agent/payment-proof", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		updated, err := agentRepo.GetByID(context.Background(), t1.ID, agent.ID)
		if err != nil {
			t.Fatalf("failed to get agent: %v", err)
		}
		if updated.PaymentStatus != "pending_verification" {
			t.Errorf("expected payment_status 'pending_verification', got %s", updated.PaymentStatus)
		}
		if updated.PaymentProofURL == nil || *updated.PaymentProofURL == "" {
			t.Fatal("expected payment_proof_url to be populated")
		}

		// Clean up uploaded file
		expectedPath := fmt.Sprintf("./uploads/%d/agents/%d/bukti-transfer.webp", t1.ID, agent.ID)
		defer os.RemoveAll(fmt.Sprintf("./uploads/%d", t1.ID))
		if _, err := os.Stat(expectedPath); os.IsNotExist(err) {
			t.Errorf("expected file to exist at %s", expectedPath)
		}
	})

	t.Run("Invalid non-image file is rejected with 400", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, _ := writer.CreateFormFile("file", "script.txt")
		_, _ = part.Write([]byte("Hello plain text not an image"))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/agent/payment-proof", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for text file, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Agent with payment_status already 'verified' cannot upload payment proof and gets 400", func(t *testing.T) {
		emailVerified := "verified@example.com"
		agentVerified := &repository.Agent{
			TenantID:      t1.ID,
			Name:          "Verified Agent",
			Email:         &emailVerified,
			Status:        "active",
			PaymentStatus: "verified",
		}
		_ = agentRepo.Create(context.Background(), t1.ID, agentVerified)

		tokenVerified := "token-verified"
		_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
			AgentID:   agentVerified.ID,
			Token:     tokenVerified,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		imgBytes := createDummyPNG(t)
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "transfer-receipt.png")
		if err != nil {
			t.Fatalf("failed to create form file: %v", err)
		}
		_, _ = io.Copy(part, bytes.NewReader(imgBytes))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/agent/payment-proof", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+tokenVerified)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request when payment_status is verified, got %d: %s", w.Code, w.Body.String())
		}

		var errResp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &errResp)
		if !strings.Contains(errResp["error"], "menunggu bukti transfer") {
			t.Errorf("expected error message to explain only awaiting_proof can upload, got: %s", errResp["error"])
		}
	})
}

// 9. Dashboard approve/reject: cross-tenant isolation and status updates
func TestAgentHandler_DashboardApproveReject(t *testing.T) {
	r, agentRepo, _, _, t1, t2 := setupAgentTestRouter()

	// Agent on Tenant 1
	email1 := "agent-t1@example.com"
	agent1 := &repository.Agent{
		TenantID:      t1.ID,
		Name:          "Agent T1",
		Email:         &email1,
		Status:        "pending",
		PaymentStatus: "pending_verification",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, agent1)

	// Agent on Tenant 2
	email2 := "agent-t2@example.com"
	agent2 := &repository.Agent{
		TenantID:      t2.ID,
		Name:          "Agent T2",
		Email:         &email2,
		Status:        "pending",
		PaymentStatus: "pending_verification",
	}
	_ = agentRepo.Create(context.Background(), t2.ID, agent2)

	t.Run("Cross-tenant: Admin T1 cannot approve Agent of T2", func(t *testing.T) {
		url := fmt.Sprintf("/api/dashboard/agents/%d/approve", agent2.ID)
		req := httptest.NewRequest(http.MethodPatch, url, nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Errorf("expected 404 Not Found when admin T1 approves agent of T2, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Approve sets status active and payment_status verified", func(t *testing.T) {
		url := fmt.Sprintf("/api/dashboard/agents/%d/approve", agent1.ID)
		req := httptest.NewRequest(http.MethodPatch, url, nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on approve, got %d: %s", w.Code, w.Body.String())
		}

		updated, _ := agentRepo.GetByID(context.Background(), t1.ID, agent1.ID)
		if updated.Status != "active" {
			t.Errorf("expected status 'active', got %s", updated.Status)
		}
		if updated.PaymentStatus != "verified" {
			t.Errorf("expected payment_status 'verified', got %s", updated.PaymentStatus)
		}
	})

	t.Run("Reject sets status rejected and saves rejection reason", func(t *testing.T) {
		url := fmt.Sprintf("/api/dashboard/agents/%d/reject", agent2.ID)
		body := bytes.NewBufferString(`{"reason": "Bukti transfer tidak jelas"}`)
		req := httptest.NewRequest(http.MethodPatch, url, body)
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(middleware.WithTenantID(req.Context(), t2.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on reject, got %d: %s", w.Code, w.Body.String())
		}

		updated, _ := agentRepo.GetByID(context.Background(), t2.ID, agent2.ID)
		if updated.Status != "rejected" {
			t.Errorf("expected status 'rejected', got %s", updated.Status)
		}
		if updated.RejectionReason == nil || *updated.RejectionReason != "Bukti transfer tidak jelas" {
			t.Errorf("expected rejection_reason to be saved, got %+v", updated.RejectionReason)
		}
	})
}

// 10. Dashboard PUT /api/dashboard/tenant/agent-settings: validation and public info reflection
func TestAgentHandler_AgentSettings(t *testing.T) {
	r, _, _, _, t1, _ := setupAgentTestRouter()

	t.Run("Fee > 0 without bank details fails with 400", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"agent_registration_fee":    500000,
			"agent_bank_name":           "",
			"agent_bank_account_number": "",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/agent-settings", bytes.NewReader(body))
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request when fee > 0 without bank info, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Valid settings saved and reflected in public registration info", func(t *testing.T) {
		terms := "Syarat wajib beragama Islam dan berakhlak baik."
		body, _ := json.Marshal(map[string]interface{}{
			"agent_registration_fee":    250000,
			"agent_terms_conditions":    terms,
			"agent_bank_name":           "Bank Mandiri",
			"agent_bank_account_number": "987654321",
			"agent_bank_account_holder": "PT Amanah Travel Sejahtera",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/agent-settings", bytes.NewReader(body))
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on put settings, got %d: %s", w.Code, w.Body.String())
		}

		// Check public registration info endpoint
		reqPublic := httptest.NewRequest(http.MethodGet, "/api/public/agent-registration-info", nil)
		reqPublic = reqPublic.WithContext(middleware.WithTenantID(reqPublic.Context(), t1.ID))
		wPublic := httptest.NewRecorder()
		r.ServeHTTP(wPublic, reqPublic)

		if wPublic.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on get public registration info, got %d: %s", wPublic.Code, wPublic.Body.String())
		}

		var pubResp struct {
			AgentRegistrationFee   *float64 `json:"agent_registration_fee"`
			AgentRegistrationTerms *string  `json:"agent_registration_terms"`
			AgentBankName          *string  `json:"agent_bank_name"`
		}
		_ = json.Unmarshal(wPublic.Body.Bytes(), &pubResp)

		if pubResp.AgentRegistrationFee == nil || *pubResp.AgentRegistrationFee != 250000 {
			t.Errorf("expected fee 250000, got %v", pubResp.AgentRegistrationFee)
		}
		if pubResp.AgentRegistrationTerms == nil || *pubResp.AgentRegistrationTerms != terms {
			t.Errorf("expected terms '%s', got %v", terms, pubResp.AgentRegistrationTerms)
		}
		if pubResp.AgentBankName == nil || *pubResp.AgentBankName != "Bank Mandiri" {
			t.Errorf("expected bank name 'Bank Mandiri', got %v", pubResp.AgentBankName)
		}
	})

	t.Run("Saving identical settings twice succeeds with 200 OK (rowsAffected == 0 safe)", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"agent_registration_fee":    250000,
			"agent_terms_conditions":    "Syarat wajib beragama Islam dan berakhlak baik.",
			"agent_bank_name":           "Bank Mandiri",
			"agent_bank_account_number": "987654321",
			"agent_bank_account_holder": "PT Amanah Travel Sejahtera",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/agent-settings", bytes.NewReader(body))
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK when saving identical settings, got %d: %s", w.Code, w.Body.String())
		}
	})
}

// 11. Registrasi via referral cookie milik tenant lain -> parent_agent_id tetap NULL (cross-tenant safety)
func TestAgentHandler_Register_CrossTenantReferralCookie(t *testing.T) {
	agentRepo := newMockAgentRepo()
	sessionRepo := newMockAgentSessionRepo(agentRepo)
	tenantRepo := newMockTenantRepo()

	fee0 := float64(0)
	tA := &repository.Tenant{
		ID:                   10,
		Name:                 "Travel Amanah",
		Slug:                 "amanah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
	}
	_ = tenantRepo.Create(context.Background(), tA)

	tB := &repository.Tenant{
		ID:                   20,
		Name:                 "Travel Berkah",
		Slug:                 "berkah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
	}
	_ = tenantRepo.Create(context.Background(), tB)

	domainRepo := &mockDomainRepo{
		domains: map[string]*repository.Domain{
			"travela.klikumroh.local": {
				ID:       1,
				TenantID: tA.ID,
				Hostname: "travela.klikumroh.local",
				Status:   "active",
			},
			"travelb.klikumroh.local": {
				ID:       2,
				TenantID: tB.ID,
				Hostname: "travelb.klikumroh.local",
				Status:   "active",
			},
		},
	}

	commissionLedgerRepo := &mockCommissionLedgerRepo{}
	prospectRepo := newMockProspectRepo()
	prospectRepo.agentRepo = agentRepo
	payoutRepo := newMockCommissionPayoutRequestRepo()
	agentService := service.NewAgentService(agentRepo, sessionRepo, tenantRepo, commissionLedgerRepo, prospectRepo, payoutRepo, nil, nil, nil)
	agentHandler := handler.NewAgentHandler(agentService)

	r := chi.NewRouter()
	r.Group(func(public chi.Router) {
		public.Use(middleware.TenantResolutionMiddleware(domainRepo))
		agentHandler.RegisterPublicRoutes(public)
	})

	// Seed an active agent on Tenant A with known referral code
	emailA := "agentA@travela.com"
	phoneA := "0811111111"
	refCodeA := "REFA1234"
	agentA := &repository.Agent{
		TenantID:     tA.ID,
		Name:         "Agent Travel A",
		Email:        &emailA,
		Phone:        &phoneA,
		ReferralCode: refCodeA,
		Status:       "active",
	}
	_ = agentRepo.Create(context.Background(), tA.ID, agentA)

	t.Run("Cross-tenant referral cookie: register on Tenant B with Tenant A's referral cookie results in parent_agent_id NULL", func(t *testing.T) {
		bodyB, _ := json.Marshal(map[string]string{
			"name":     "Agent Travel B",
			"phone":    "0822222222",
			"email":    "agentB@travelb.com",
			"password": "passwordB123",
			"domisili": "Kota Bandung",
		})

		req := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(bodyB))
		// Host resolves to Tenant B (ID=20)
		req.Host = "travelb.klikumroh.local"
		// Cookie contains referral code belonging to Tenant A (ID=10)
		req.AddCookie(&http.Cookie{
			Name:  "ref_code",
			Value: refCodeA,
		})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Agent struct {
				ID       uint64 `json:"id"`
				TenantID uint64 `json:"tenant_id"`
			} `json:"agent"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse response: %v", err)
		}

		createdAgent, err := agentRepo.GetByID(context.Background(), tB.ID, resp.Agent.ID)
		if err != nil {
			t.Fatalf("failed to retrieve created agent from repo: %v", err)
		}

		// CRITICAL ISOLATION ASSERTION: parent_agent_id MUST BE NULL
		if createdAgent.ParentAgentID != nil {
			t.Errorf("CRITICAL SECURITY VIOLATION: parent_agent_id should be NULL when registering with cross-tenant referral code, got %d (Agent A id is %d)", *createdAgent.ParentAgentID, agentA.ID)
		}
		if createdAgent.TenantID != tB.ID {
			t.Errorf("expected tenant_id %d, got %d", tB.ID, createdAgent.TenantID)
		}
	})

	t.Run("Same-tenant referral cookie: register on Tenant A with Tenant A's referral cookie correctly sets parent_agent_id", func(t *testing.T) {
		bodyA2, _ := json.Marshal(map[string]string{
			"name":     "Sub Agent Travel A",
			"phone":    "0833333333",
			"email":    "subagentA@travela.com",
			"password": "passwordA123",
			"domisili": "Kota Bandung",
		})

		req := httptest.NewRequest(http.MethodPost, "/api/public/agents/register", bytes.NewReader(bodyA2))
		// Host resolves to Tenant A (ID=10)
		req.Host = "travela.klikumroh.local"
		// Cookie contains referral code belonging to Tenant A (ID=10)
		req.AddCookie(&http.Cookie{
			Name:  "ref_code",
			Value: refCodeA,
		})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Agent struct {
				ID uint64 `json:"id"`
			} `json:"agent"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		createdAgent, err := agentRepo.GetByID(context.Background(), tA.ID, resp.Agent.ID)
		if err != nil {
			t.Fatalf("failed to retrieve created agent: %v", err)
		}

		if createdAgent.ParentAgentID == nil {
			t.Fatal("expected parent_agent_id to be set for same-tenant referral code, got nil")
		}
		if *createdAgent.ParentAgentID != agentA.ID {
			t.Errorf("expected parent_agent_id %d, got %d", agentA.ID, *createdAgent.ParentAgentID)
		}
	})
}

func TestAgentHandler_UploadPoster_And_Delete(t *testing.T) {
	r, _, _, tenantRepo, t1, _ := setupAgentTestRouter()

	// 1. Upload poster
	pngBytes := createDummyPNG(t)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("poster", "poster.png")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	part.Write(pngBytes)
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/dashboard/tenant/agent-settings/poster", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var uploadResp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &uploadResp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if uploadResp["poster_url"] == "" {
		t.Fatalf("expected non-empty poster_url, got empty")
	}

	// Verify tenant repo was updated
	t1Updated, err := tenantRepo.GetByID(context.Background(), t1.ID)
	if err != nil {
		t.Fatalf("failed to get tenant: %v", err)
	}
	if t1Updated.AgentPosterURL == nil || *t1Updated.AgentPosterURL != uploadResp["poster_url"] {
		t.Fatalf("expected tenant agent_poster_url to match, got %v", t1Updated.AgentPosterURL)
	}

	// Clean up uploaded file
	defer func() {
		absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", t1.ID), "agent", "poster.webp")
		_ = os.Remove(absPath)
	}()

	// 2. Delete poster
	reqDel := httptest.NewRequest(http.MethodDelete, "/api/dashboard/tenant/agent-settings/poster", nil)
	reqDel = reqDel.WithContext(middleware.WithTenantID(reqDel.Context(), t1.ID))
	wDel := httptest.NewRecorder()
	r.ServeHTTP(wDel, reqDel)

	if wDel.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for delete, got %d: %s", wDel.Code, wDel.Body.String())
	}

	t1AfterDel, _ := tenantRepo.GetByID(context.Background(), t1.ID)
	if t1AfterDel.AgentPosterURL != nil {
		t.Fatalf("expected tenant agent_poster_url to be nil after delete, got %v", *t1AfterDel.AgentPosterURL)
	}
}

func setupAgentDashboardTestRouter() (
	chi.Router,
	*mockAgentRepo,
	*mockAgentSessionRepo,
	*mockTenantRepo,
	*mockCommissionLedgerRepo,
	*mockProspectRepo,
	*repository.Tenant,
	*repository.Tenant,
	*mockAgentTargetRepo,
) {
	agentRepo := newMockAgentRepo()
	sessionRepo := newMockAgentSessionRepo(agentRepo)
	tenantRepo := newMockTenantRepo()
	commissionLedgerRepo := &mockCommissionLedgerRepo{}
	prospectRepo := newMockProspectRepo()
	prospectRepo.agentRepo = agentRepo
	targetRepo := newMockAgentTargetRepo(agentRepo, prospectRepo)
	targetService := service.NewAgentTargetService(targetRepo, agentRepo)

	minPayout := float64(500000)
	fee0 := float64(0)
	t1 := &repository.Tenant{
		Name:                 "Travel Amanah",
		Slug:                 "amanah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
		MinimumPayoutAmount:  &minPayout,
	}
	_ = tenantRepo.Create(context.Background(), t1)

	fee150 := float64(1500000)
	t2 := &repository.Tenant{
		Name:                 "Travel Berkah",
		Slug:                 "berkah",
		Status:               "active",
		AgentRegistrationFee: &fee150,
		MinimumPayoutAmount:  &minPayout,
	}
	_ = tenantRepo.Create(context.Background(), t2)

	payoutRepo := newMockCommissionPayoutRequestRepo()
	agentService := service.NewAgentService(agentRepo, sessionRepo, tenantRepo, commissionLedgerRepo, prospectRepo, payoutRepo, nil, nil, targetService)
	agentHandler := handler.NewAgentHandler(agentService)
	agentTargetHandler := handler.NewAgentTargetHandler(targetService)

	r := chi.NewRouter()
	agentHandler.RegisterPublicRoutes(r)
	r.Group(func(ar chi.Router) {
		ar.Use(middleware.AgentAuthMiddleware(sessionRepo))
		agentHandler.RegisterAgentProtectedRoutes(ar)
	})
	r.Group(func(dr chi.Router) {
		agentHandler.RegisterDashboardRoutes(dr)
		agentTargetHandler.RegisterDashboardRoutes(dr)
	})

	return r, agentRepo, sessionRepo, tenantRepo, commissionLedgerRepo, prospectRepo, t1, t2, targetRepo
}

// 11. Dashboard Summary: GET /api/agent/dashboard-summary
func TestAgentHandler_DashboardSummary(t *testing.T) {
	// Sub-test 1: Agent with status='pending' returns 403 Forbidden with "Akun belum aktif"
	t.Run("Agent with status pending returns 403 Akun belum aktif", func(t *testing.T) {
		r, agentRepo, sessionRepo, _, _, _, t1, _, _ := setupAgentDashboardTestRouter()

		email := "pending@example.com"
		agentPending := &repository.Agent{
			TenantID:     t1.ID,
			Name:         "Pending Agent",
			Email:        &email,
			ReferralCode: "PENDING1",
			Status:       "pending",
		}
		_ = agentRepo.Create(context.Background(), t1.ID, agentPending)

		tokenPending := "token-pending-agent"
		_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
			AgentID:   agentPending.ID,
			Token:     tokenPending,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		req := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		req.Header.Set("Authorization", "Bearer "+tokenPending)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden, got %d: %s", w.Code, w.Body.String())
		}

		var errResp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &errResp)
		if errResp["error"] != "Akun belum aktif" {
			t.Errorf("expected error 'Akun belum aktif', got '%s'", errResp["error"])
		}
	})

	// Sub-test 2: Cross-tenant isolation
	t.Run("Cross-tenant isolation: Agent tenant A cannot see Tenant B data", func(t *testing.T) {
		r, agentRepo, sessionRepo, _, commissionLedgerRepo, prospectRepo, t1, t2, _ := setupAgentDashboardTestRouter()

		// Active agent on Tenant 1
		emailA := "agentA@example.com"
		agentA := &repository.Agent{
			TenantID:     t1.ID,
			Name:         "Agent Tenant A",
			Email:        &emailA,
			ReferralCode: "AGENTAAA",
			Status:       "active",
		}
		_ = agentRepo.Create(context.Background(), t1.ID, agentA)

		tokenA := "token-agent-a"
		_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
			AgentID:   agentA.ID,
			Token:     tokenA,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		// Active agent on Tenant 2 with commission & prospects
		emailB := "agentB@example.com"
		agentB := &repository.Agent{
			TenantID:     t2.ID,
			Name:         "Agent Tenant B",
			Email:        &emailB,
			ReferralCode: "AGENTBBB",
			Status:       "active",
		}
		_ = agentRepo.Create(context.Background(), t2.ID, agentB)

		_ = commissionLedgerRepo.Create(context.Background(), t2.ID, &repository.CommissionLedger{
			TenantID: t2.ID,
			AgentID:  agentB.ID,
			Type:     "direct",
			Amount:   5000000,
		})

		_ = prospectRepo.Create(context.Background(), t2.ID, &repository.Prospect{
			TenantID: t2.ID,
			AgentID:  &agentB.ID,
			Name:     "Prospect Tenant B",
			Status:   "closing",
		})

		// Case 2a: Agent A accesses with Tenant B header/subdomain context -> rejected by AgentAuthMiddleware
		reqWrongTenant := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		reqWrongTenant.Header.Set("Authorization", "Bearer "+tokenA)
		reqWrongTenant = reqWrongTenant.WithContext(middleware.WithTenantID(reqWrongTenant.Context(), t2.ID))
		wWrong := httptest.NewRecorder()
		r.ServeHTTP(wWrong, reqWrongTenant)

		if wWrong.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for cross-tenant session access, got %d: %s", wWrong.Code, wWrong.Body.String())
		}

		// Case 2b: Agent A accesses valid Tenant A context -> data of Tenant B is NOT leaked
		reqA := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		reqA.Host = "travela.example.com"
		reqA.Header.Set("Authorization", "Bearer "+tokenA)
		reqA.Header.Set("Host", "travela.example.com")
		reqA = reqA.WithContext(middleware.WithTenantID(reqA.Context(), t1.ID))
		wA := httptest.NewRecorder()
		r.ServeHTTP(wA, reqA)

		if wA.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", wA.Code, wA.Body.String())
		}

		var summary service.AgentDashboardSummary
		if err := json.Unmarshal(wA.Body.Bytes(), &summary); err != nil {
			t.Fatalf("failed to parse summary: %v", err)
		}

		if summary.Name != agentA.Name {
			t.Errorf("expected name %s, got %s", agentA.Name, summary.Name)
		}
		if summary.SaldoSiapCair != 0 {
			t.Errorf("expected saldo_siap_cair 0 for agent A, got %f (Tenant B data leaked)", summary.SaldoSiapCair)
		}
		if summary.FunnelRingkasan.Closing != 0 {
			t.Errorf("expected closing 0 for agent A, got %d (Tenant B prospect leaked)", summary.FunnelRingkasan.Closing)
		}
		if summary.ReferralLink != "https://travela.example.com/ref/AGENTAAA" {
			t.Errorf("expected referral link 'https://travela.example.com/ref/AGENTAAA', got '%s'", summary.ReferralLink)
		}
	})

	// Sub-test 3: Leaderboard ranking with 3 agents with 5, 3, 8 closing jamaah
	t.Run("Leaderboard ranking: 3 agents with 5, 3, 8 closing jamaah gives rank 1 to agent with 8", func(t *testing.T) {
		r, agentRepo, sessionRepo, _, _, prospectRepo, t1, _, _ := setupAgentDashboardTestRouter()

		// Create Agent 1 (5 jamaah)
		email1 := "agent1@example.com"
		agent1 := &repository.Agent{
			TenantID:     t1.ID,
			Name:         "Agent Satu",
			Email:        &email1,
			ReferralCode: "AGENT001",
			Status:       "active",
		}
		_ = agentRepo.Create(context.Background(), t1.ID, agent1)
		token1 := "token-agent-1"
		_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
			AgentID:   agent1.ID,
			Token:     token1,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		// Create Agent 2 (3 jamaah)
		email2 := "agent2@example.com"
		agent2 := &repository.Agent{
			TenantID:     t1.ID,
			Name:         "Agent Dua",
			Email:        &email2,
			ReferralCode: "AGENT002",
			Status:       "active",
		}
		_ = agentRepo.Create(context.Background(), t1.ID, agent2)
		token2 := "token-agent-2"
		_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
			AgentID:   agent2.ID,
			Token:     token2,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		// Create Agent 3 (8 jamaah)
		email3 := "agent3@example.com"
		agent3 := &repository.Agent{
			TenantID:     t1.ID,
			Name:         "Agent Tiga",
			Email:        &email3,
			ReferralCode: "AGENT003",
			Status:       "active",
		}
		_ = agentRepo.Create(context.Background(), t1.ID, agent3)
		token3 := "token-agent-3"
		_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
			AgentID:   agent3.ID,
			Token:     token3,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		// Add closing prospects
		// Agent 1: 5 jamaah
		jj5 := 5
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
			TenantID:     t1.ID,
			AgentID:      &agent1.ID,
			Status:       "closing",
			JumlahJamaah: &jj5,
		})

		// Agent 2: 3 jamaah (via multiple prospects: 2 + 1)
		jj2 := 2
		jj1 := 1
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
			TenantID:     t1.ID,
			AgentID:      &agent2.ID,
			Status:       "closing",
			JumlahJamaah: &jj2,
		})
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
			TenantID:     t1.ID,
			AgentID:      &agent2.ID,
			Status:       "closing",
			JumlahJamaah: &jj1,
		})

		// Agent 3: 8 jamaah
		jj8 := 8
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
			TenantID:     t1.ID,
			AgentID:      &agent3.ID,
			Status:       "closing",
			JumlahJamaah: &jj8,
		})

		// Verify Agent 3 (8 jamaah) is Rank 1 of 3
		req3 := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		req3.Header.Set("Authorization", "Bearer "+token3)
		req3 = req3.WithContext(middleware.WithTenantID(req3.Context(), t1.ID))
		w3 := httptest.NewRecorder()
		r.ServeHTTP(w3, req3)

		if w3.Code != http.StatusOK {
			t.Fatalf("agent 3 summary expected 200 OK, got %d", w3.Code)
		}
		var s3 service.AgentDashboardSummary
		_ = json.Unmarshal(w3.Body.Bytes(), &s3)
		if s3.LeaderboardPreview.RankSaya != 1 {
			t.Errorf("expected Agent 3 (8 jamaah) to be rank 1, got %d", s3.LeaderboardPreview.RankSaya)
		}
		if s3.LeaderboardPreview.TotalAgen != 3 {
			t.Errorf("expected total_agen 3, got %d", s3.LeaderboardPreview.TotalAgen)
		}

		// Verify Agent 1 (5 jamaah) is Rank 2 of 3
		req1 := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		req1.Header.Set("Authorization", "Bearer "+token1)
		req1 = req1.WithContext(middleware.WithTenantID(req1.Context(), t1.ID))
		w1 := httptest.NewRecorder()
		r.ServeHTTP(w1, req1)

		var s1 service.AgentDashboardSummary
		_ = json.Unmarshal(w1.Body.Bytes(), &s1)
		if s1.LeaderboardPreview.RankSaya != 2 {
			t.Errorf("expected Agent 1 (5 jamaah) to be rank 2, got %d", s1.LeaderboardPreview.RankSaya)
		}

		// Verify Agent 2 (3 jamaah) is Rank 3 of 3
		req2 := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		req2.Header.Set("Authorization", "Bearer "+token2)
		req2 = req2.WithContext(middleware.WithTenantID(req2.Context(), t1.ID))
		w2 := httptest.NewRecorder()
		r.ServeHTTP(w2, req2)

		var s2 service.AgentDashboardSummary
		_ = json.Unmarshal(w2.Body.Bytes(), &s2)
		if s2.LeaderboardPreview.RankSaya != 3 {
			t.Errorf("expected Agent 2 (3 jamaah) to be rank 3, got %d", s2.LeaderboardPreview.RankSaya)
		}
	})

	// Sub-test 4: Funnel summary excludes status='tidak_lanjut'
	t.Run("Funnel summary: status tidak_lanjut is excluded from all counts", func(t *testing.T) {
		r, agentRepo, sessionRepo, _, _, prospectRepo, t1, _, _ := setupAgentDashboardTestRouter()

		email := "funnelagent@example.com"
		agent := &repository.Agent{
			TenantID:     t1.ID,
			Name:         "Funnel Agent",
			Email:        &email,
			ReferralCode: "FUNNEL01",
			Status:       "active",
		}
		_ = agentRepo.Create(context.Background(), t1.ID, agent)
		token := "token-funnel"
		_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
			AgentID:   agent.ID,
			Token:     token,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		// Add 2 Baru
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, Status: "baru"})
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, Status: "baru"})

		// Add 1 Dihubungi, 1 Tertarik (Total Diproses: 2)
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, Status: "dihubungi"})
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, Status: "tertarik"})

		// Add 3 Closing
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, Status: "closing"})
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, Status: "closing"})
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, Status: "closing"})

		// Add 4 Tidak Lanjut (MUST NOT be counted anywhere)
		for i := 0; i < 4; i++ {
			_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, Status: "tidak_lanjut"})
		}

		req := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var summary service.AgentDashboardSummary
		_ = json.Unmarshal(w.Body.Bytes(), &summary)

		if summary.FunnelRingkasan.Baru != 2 {
			t.Errorf("expected baru=2, got %d", summary.FunnelRingkasan.Baru)
		}
		if summary.FunnelRingkasan.Diproses != 2 {
			t.Errorf("expected diproses=2, got %d", summary.FunnelRingkasan.Diproses)
		}
		if summary.FunnelRingkasan.Closing != 3 {
			t.Errorf("expected closing=3, got %d", summary.FunnelRingkasan.Closing)
		}
	})

	// Sub-test 5: targets is empty when tenant has not configured target, and saldo_tertunda calculation
	t.Run("targets is empty if unconfigured and saldo_tertunda excludes closing and tidak_lanjut", func(t *testing.T) {
		r, agentRepo, sessionRepo, _, _, prospectRepo, t1, _, _ := setupAgentDashboardTestRouter()

		email := "targetnull@example.com"
		agent := &repository.Agent{
			TenantID:     t1.ID,
			Name:         "Agent Target Null",
			Email:        &email,
			ReferralCode: "TGTNULL1",
			Status:       "active",
		}
		_ = agentRepo.Create(context.Background(), t1.ID, agent)
		token := "token-tgt-null"
		_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
			AgentID:   agent.ID,
			Token:     token,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		// Configure package commissions: pkg1 = 500,000, pkg2 = 750,000
		pkg1 := uint64(101)
		pkg2 := uint64(102)
		prospectRepo.SetPackageCommission(pkg1, 500000)
		prospectRepo.SetPackageCommission(pkg2, 750000)

		// 1. Prospect 'baru', pkg1 (500k), 2 jamaah -> potential 1,000,000
		jj2 := 2
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
			TenantID:     t1.ID,
			AgentID:      &agent.ID,
			PackageID:    &pkg1,
			JumlahJamaah: &jj2,
			Status:       "baru",
		})

		// 2. Prospect 'tertarik', pkg2 (750k), 1 jamaah -> potential 750,000
		jj1 := 1
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
			TenantID:     t1.ID,
			AgentID:      &agent.ID,
			PackageID:    &pkg2,
			JumlahJamaah: &jj1,
			Status:       "tertarik",
		})

		// 3. Prospect 'closing', pkg1 (500k), 3 jamaah -> MUST NOT be in saldo_tertunda
		jj3 := 3
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
			TenantID:     t1.ID,
			AgentID:      &agent.ID,
			PackageID:    &pkg1,
			JumlahJamaah: &jj3,
			Status:       "closing",
		})

		// 4. Prospect 'tidak_lanjut', pkg2 (750k), 4 jamaah -> MUST NOT be in saldo_tertunda
		jj4 := 4
		_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
			TenantID:     t1.ID,
			AgentID:      &agent.ID,
			PackageID:    &pkg2,
			JumlahJamaah: &jj4,
			Status:       "tidak_lanjut",
		})

		req := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var summary service.AgentDashboardSummary
		_ = json.Unmarshal(w.Body.Bytes(), &summary)

		// 1. TargetBulanan must be null
		if summary.TargetBulanan != nil {
			t.Errorf("expected TargetBulanan to be nil when unconfigured, got %+v", summary.TargetBulanan)
		}
		// 1. Targets must be empty array
		if len(summary.Targets) != 0 {
			t.Errorf("expected Targets to be empty when unconfigured, got %+v", summary.Targets)
		}

		// 2. SaldoTertunda must be 1,000,000 + 750,000 = 1,750,000
		if summary.SaldoTertunda != 1750000 {
			t.Errorf("expected SaldoTertunda 1750000, got %f", summary.SaldoTertunda)
		}

		// 3. JamaahTertundaCount must be 2 + 1 = 3 jamaah
		if summary.JamaahTertundaCount != 3 {
			t.Errorf("expected JamaahTertundaCount 3, got %d", summary.JamaahTertundaCount)
		}
	})

	// Sub-test 6: Progress target dihitung benar dari prospect_status_history dalam window periode
	t.Run("Targets progress calculated strictly from prospect_status_history within window", func(t *testing.T) {
		r, agentRepo, sessionRepo, _, _, prospectRepo, t1, _, targetRepo := setupAgentDashboardTestRouter()

		// Configure target on tenant: 1 - 30 Sep 2026, target 15 jamaah
		title := "Target Closing Jamaah"
		_ = targetRepo.Create(context.Background(), t1.ID, &repository.AgentTarget{
			TenantID:    t1.ID,
			Title:       &title,
			MetricType:  "closing_pax",
			MetricValue: 15,
			PeriodStart: "2026-09-01",
			PeriodEnd:   "2026-09-30",
			Status:      "active",
		})

		email := "targetactive@example.com"
		agent := &repository.Agent{
			TenantID:     t1.ID,
			Name:         "Agent Target Active",
			Email:        &email,
			ReferralCode: "TGTACT1",
			Status:       "active",
		}
		_ = agentRepo.Create(context.Background(), t1.ID, agent)
		token := "token-tgt-act"
		_ = sessionRepo.Create(context.Background(), &repository.AgentSession{
			AgentID:   agent.ID,
			Token:     token,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})

		// Prospect 1: Closing inside window (2026-09-10), 4 jamaah -> COUNTED
		jj4 := 4
		p1 := &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, JumlahJamaah: &jj4, Status: "baru"}
		_ = prospectRepo.Create(context.Background(), t1.ID, p1)
		prospectRepo.RecordCustomStatusHistory(t1.ID, p1.ID, agent.ID, "closing", time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC))

		// Prospect 2: Closing inside window (2026-09-25), 3 jamaah -> COUNTED
		jj3 := 3
		p2 := &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, JumlahJamaah: &jj3, Status: "baru"}
		_ = prospectRepo.Create(context.Background(), t1.ID, p2)
		prospectRepo.RecordCustomStatusHistory(t1.ID, p2.ID, agent.ID, "closing", time.Date(2026, 9, 25, 15, 0, 0, 0, time.UTC))

		// Prospect 3: Closing BEFORE window (2026-08-20), 5 jamaah -> NOT COUNTED
		jj5 := 5
		p3 := &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, JumlahJamaah: &jj5, Status: "baru"}
		_ = prospectRepo.Create(context.Background(), t1.ID, p3)
		prospectRepo.RecordCustomStatusHistory(t1.ID, p3.ID, agent.ID, "closing", time.Date(2026, 8, 20, 10, 0, 0, 0, time.UTC))

		// Prospect 4: Closing AFTER window (2026-10-05), 6 jamaah -> NOT COUNTED
		jj6 := 6
		p4 := &repository.Prospect{TenantID: t1.ID, AgentID: &agent.ID, JumlahJamaah: &jj6, Status: "baru"}
		_ = prospectRepo.Create(context.Background(), t1.ID, p4)
		prospectRepo.RecordCustomStatusHistory(t1.ID, p4.ID, agent.ID, "closing", time.Date(2026, 10, 5, 10, 0, 0, 0, time.UTC))

		req := httptest.NewRequest(http.MethodGet, "/api/agent/dashboard-summary", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var summary service.AgentDashboardSummary
		_ = json.Unmarshal(w.Body.Bytes(), &summary)

		if len(summary.Targets) == 0 {
			t.Fatalf("expected Targets not empty")
		}
		tgt := summary.Targets[0]
		if tgt.MetricValue != 15 {
			t.Errorf("expected target_jamaah 15, got %d", tgt.MetricValue)
		}
		if tgt.ProgressValue != 7 {
			t.Errorf("expected progress_jamaah 7 (4+3), got %d", tgt.ProgressValue)
		}
		if tgt.PeriodLabel != "1-30 Sep" {
			t.Errorf("expected period_label '1-30 Sep', got '%s'", tgt.PeriodLabel)
		}
	})
}

// 12. Target Settings Admin Endpoint: GET / PUT /api/dashboard/tenant/target-settings
func TestTenantTargetSettings_ValidationAndCrossTenant(t *testing.T) {
	r, _, _, _, _, _, t1, t2, _ := setupAgentDashboardTestRouter()

	// Sub-test 1: PUT with period_end before period_start -> 400 Bad Request
	t.Run("PUT target-settings with period_end before period_start returns 400", func(t *testing.T) {
		body := map[string]any{
			"target_period_start": "2026-09-30",
			"target_period_end":   "2026-09-01",
			"target_jamaah":       20,
		}
		jsonBytes, _ := json.Marshal(body)

		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/target-settings", bytes.NewReader(jsonBytes))
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d: %s", w.Code, w.Body.String())
		}
	})

	// Sub-test 2: Cross-tenant isolation for target settings
	t.Run("Cross-tenant isolation for target-settings", func(t *testing.T) {
		// Admin Tenant 1 sets target
		bodyT1 := map[string]any{
			"target_period_start": "2026-09-01",
			"target_period_end":   "2026-09-30",
			"target_jamaah":       25,
		}
		jsonBytes1, _ := json.Marshal(bodyT1)
		req1 := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/target-settings", bytes.NewReader(jsonBytes1))
		req1 = req1.WithContext(middleware.WithTenantID(req1.Context(), t1.ID))
		w1 := httptest.NewRecorder()
		r.ServeHTTP(w1, req1)
		if w1.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for tenant 1, got %d: %s", w1.Code, w1.Body.String())
		}

		// Admin Tenant 2 GET target settings: must not see Tenant 1 settings
		reqGetT2 := httptest.NewRequest(http.MethodGet, "/api/dashboard/tenant/target-settings", nil)
		reqGetT2 = reqGetT2.WithContext(middleware.WithTenantID(reqGetT2.Context(), t2.ID))
		wGetT2 := httptest.NewRecorder()
		r.ServeHTTP(wGetT2, reqGetT2)

		if wGetT2.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for tenant 2, got %d: %s", wGetT2.Code, wGetT2.Body.String())
		}

		var settingsT2 repository.TenantTargetSettings
		_ = json.Unmarshal(wGetT2.Body.Bytes(), &settingsT2)
		if settingsT2.TargetJamaah != nil {
			t.Errorf("expected tenant 2 target_jamaah nil, got %d (Tenant 1 data leaked)", *settingsT2.TargetJamaah)
		}

		// Admin Tenant 2 sets its own target
		bodyT2 := map[string]any{
			"target_period_start": "2026-10-01",
			"target_period_end":   "2026-10-31",
			"target_jamaah":       50,
		}
		jsonBytes2, _ := json.Marshal(bodyT2)
		reqPutT2 := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/target-settings", bytes.NewReader(jsonBytes2))
		reqPutT2 = reqPutT2.WithContext(middleware.WithTenantID(reqPutT2.Context(), t2.ID))
		wPutT2 := httptest.NewRecorder()
		r.ServeHTTP(wPutT2, reqPutT2)
		if wPutT2.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for tenant 2 put, got %d: %s", wPutT2.Code, wPutT2.Body.String())
		}

		// Admin Tenant 1 GET target settings: must still see its own target (25 jamaah, September)
		reqGetT1 := httptest.NewRequest(http.MethodGet, "/api/dashboard/tenant/target-settings", nil)
		reqGetT1 = reqGetT1.WithContext(middleware.WithTenantID(reqGetT1.Context(), t1.ID))
		wGetT1 := httptest.NewRecorder()
		r.ServeHTTP(wGetT1, reqGetT1)

		var settingsT1 repository.TenantTargetSettings
		_ = json.Unmarshal(wGetT1.Body.Bytes(), &settingsT1)
		if settingsT1.TargetJamaah == nil || *settingsT1.TargetJamaah != 25 {
			t.Errorf("expected tenant 1 target_jamaah 25, got %+v", settingsT1.TargetJamaah)
		}
		if settingsT1.TargetPeriodStart == nil || *settingsT1.TargetPeriodStart != "2026-09-01" {
			t.Errorf("expected tenant 1 target_period_start '2026-09-01', got %+v", settingsT1.TargetPeriodStart)
		}
	})
}

func TestAgent_GetLeaderboard_CrossTenantAndPrivacy(t *testing.T) {
	agentRepo := newMockAgentRepo()
	sessionRepo := newMockAgentSessionRepo(agentRepo)
	tenantRepo := newMockTenantRepo()

	t1 := &repository.Tenant{ID: 1, Name: "Travel Amanah", Slug: "amanah", Status: "active"}
	_ = tenantRepo.Create(context.Background(), t1)
	t2 := &repository.Tenant{ID: 2, Name: "Travel Berkah", Slug: "berkah", Status: "active"}
	_ = tenantRepo.Create(context.Background(), t2)

	commissionLedgerRepo := &mockCommissionLedgerRepo{}
	prospectRepo := newMockProspectRepo()
	prospectRepo.agentRepo = agentRepo
	payoutRepo := newMockCommissionPayoutRequestRepo()

	agentService := service.NewAgentService(agentRepo, sessionRepo, tenantRepo, commissionLedgerRepo, prospectRepo, payoutRepo, nil, nil, nil)
	agentHandler := handler.NewAgentHandler(agentService)

	r := chi.NewRouter()
	r.Group(func(ar chi.Router) {
		ar.Use(middleware.AgentAuthMiddleware(sessionRepo))
		agentHandler.RegisterAgentProtectedRoutes(ar)
	})

	// Setup agents:
	// Tenant 1: Agen 1 (5 closing), Agen 2 (10 closing)
	phone1 := "08111"
	email1 := "agen1@amanah.com"
	ag1 := &repository.Agent{TenantID: t1.ID, Name: "Agen Satu", Phone: &phone1, Email: &email1, Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, ag1)
	sess1 := &repository.AgentSession{TenantID: t1.ID, AgentID: ag1.ID, Token: "token-ag-1", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sess1)

	phone2 := "08222"
	email2 := "agen2@amanah.com"
	ag2 := &repository.Agent{TenantID: t1.ID, Name: "Agen Dua", Phone: &phone2, Email: &email2, Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, ag2)
	sess2 := &repository.AgentSession{TenantID: t1.ID, AgentID: ag2.ID, Token: "token-ag-2", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sess2)

	// Tenant 2: Agen 3 (20 closing)
	phone3 := "08333"
	email3 := "agen3@berkah.com"
	ag3 := &repository.Agent{TenantID: t2.ID, Name: "Agen Tiga Cross", Phone: &phone3, Email: &email3, Status: "active"}
	_ = agentRepo.Create(context.Background(), t2.ID, ag3)
	sess3 := &repository.AgentSession{TenantID: t2.ID, AgentID: ag3.ID, Token: "token-ag-3", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sess3)

	// Closing prospects:
	// Agen 1: 5 closing jamaah
	jj5 := 5
	_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
		TenantID:     t1.ID,
		AgentID:      &ag1.ID,
		Name:         "Jamaah Ag1",
		Phone:        "081111",
		Status:       "closing",
		JumlahJamaah: &jj5,
	})

	// Agen 2: 10 closing jamaah
	jj10 := 10
	_ = prospectRepo.Create(context.Background(), t1.ID, &repository.Prospect{
		TenantID:     t1.ID,
		AgentID:      &ag2.ID,
		Name:         "Jamaah Ag2",
		Phone:        "082222",
		Status:       "closing",
		JumlahJamaah: &jj10,
	})

	// Agen 3 (Tenant 2): 20 closing jamaah
	jj20 := 20
	_ = prospectRepo.Create(context.Background(), t2.ID, &repository.Prospect{
		TenantID:     t2.ID,
		AgentID:      &ag3.ID,
		Name:         "Jamaah Ag3",
		Phone:        "083333",
		Status:       "closing",
		JumlahJamaah: &jj20,
	})

	// Test 1: Leaderboard Tenant 1 does not display Tenant 2's agent
	t.Run("Cross-Tenant: Leaderboard tenant A tidak menampilkan agen tenant B", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/agent/leaderboard", nil)
		req.Header.Set("Authorization", "Bearer token-ag-1")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var list []service.LeaderboardEntry
		if err := json.NewDecoder(rec.Body).Decode(&list); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if len(list) != 2 {
			t.Fatalf("expected 2 agents from Tenant 1, got %d", len(list))
		}

		// Rank 1: Agen Dua (10 closing)
		if list[0].Rank != 1 || list[0].Name != "Agen Dua" || list[0].TotalJamaahClosing != 10 {
			t.Errorf("expected Rank 1 to be Agen Dua with 10 closing, got %+v", list[0])
		}

		// Rank 2: Agen Satu (5 closing)
		if list[1].Rank != 2 || list[1].Name != "Agen Satu" || list[1].TotalJamaahClosing != 5 {
			t.Errorf("expected Rank 2 to be Agen Satu with 5 closing, got %+v", list[1])
		}

		// Ensure Agen Tiga (Tenant 2) is NOT in list
		for _, item := range list {
			if item.Name == "Agen Tiga Cross" {
				t.Fatalf("CRITICAL SECURITY VIOLATION: Tenant 2 agent leaked in Tenant 1 leaderboard!")
			}
		}
	})

	// Test 2: Response tidak mengandung field sensitif (phone/email/saldo)
	t.Run("Privacy: Response tidak mengandung field sensitif (phone, email, saldo, dll)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/agent/leaderboard", nil)
		req.Header.Set("Authorization", "Bearer token-ag-1")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		var rawItems []map[string]interface{}
		if err := json.NewDecoder(rec.Body).Decode(&rawItems); err != nil {
			t.Fatalf("failed to decode raw json: %v", err)
		}

		for _, item := range rawItems {
			for k := range item {
				if k == "phone" || k == "email" || k == "password_hash" || k == "saldo" || k == "domisili" || k == "parent_agent_id" {
					t.Errorf("sensitive field '%s' leaked in leaderboard entry: %+v", k, item)
				}
			}
		}
	})

	// Test 3: is_me benar-benar cuma true untuk baris agent yang tokennya dipakai request
	t.Run("Ownership: is_me cuma true untuk baris agen yang sedang login", func(t *testing.T) {
		// Request with Agen 1 token -> Rank 2 (Agen Satu) is_me=true, Rank 1 is_me=false
		req1 := httptest.NewRequest(http.MethodGet, "/api/agent/leaderboard", nil)
		req1.Header.Set("Authorization", "Bearer token-ag-1")
		rec1 := httptest.NewRecorder()
		r.ServeHTTP(rec1, req1)

		var list1 []service.LeaderboardEntry
		_ = json.NewDecoder(rec1.Body).Decode(&list1)
		if list1[0].IsMe != false {
			t.Errorf("expected Rank 1 (Agen Dua) is_me=false for Agen 1 request")
		}
		if list1[1].IsMe != true {
			t.Errorf("expected Rank 2 (Agen Satu) is_me=true for Agen 1 request")
		}

		// Request with Agen 2 token -> Rank 1 (Agen Dua) is_me=true, Rank 2 is_me=false
		req2 := httptest.NewRequest(http.MethodGet, "/api/agent/leaderboard", nil)
		req2.Header.Set("Authorization", "Bearer token-ag-2")
		rec2 := httptest.NewRecorder()
		r.ServeHTTP(rec2, req2)

		var list2 []service.LeaderboardEntry
		_ = json.NewDecoder(rec2.Body).Decode(&list2)
		if list2[0].IsMe != true {
			t.Errorf("expected Rank 1 (Agen Dua) is_me=true for Agen 2 request")
		}
		if list2[1].IsMe != false {
			t.Errorf("expected Rank 2 (Agen Satu) is_me=false for Agen 2 request")
		}

		// Request with Agen 3 token (Tenant 2) -> only 1 agent returned with is_me=true
		req3 := httptest.NewRequest(http.MethodGet, "/api/agent/leaderboard", nil)
		req3.Header.Set("Authorization", "Bearer token-ag-3")
		rec3 := httptest.NewRecorder()
		r.ServeHTTP(rec3, req3)

		var list3 []service.LeaderboardEntry
		_ = json.NewDecoder(rec3.Body).Decode(&list3)
		if len(list3) != 1 {
			t.Fatalf("expected 1 agent for Tenant 2, got %d", len(list3))
		}
		if list3[0].Name != "Agen Tiga Cross" || list3[0].TotalJamaahClosing != 20 || !list3[0].IsMe {
			t.Errorf("unexpected entry for Tenant 2: %+v", list3[0])
		}
	})
}

// 22. Agent Logout & Re-upload Payment Proof for Rejected Agent
func TestAgentHandler_LogoutAndReuploadProof(t *testing.T) {
	r, agentRepo, sessionRepo, _, t1, _ := setupAgentTestRouter()

	t.Run("POST /api/agent/logout deletes agent session token", func(t *testing.T) {
		token := "token-logout-test"
		sessionRepo.sessions[token] = &repository.AgentSession{
			ID:          999,
			AgentID:     1,
			Token:       token,
			TenantID:    t1.ID,
			AgentStatus: "active",
			ExpiresAt:   time.Now().Add(24 * time.Hour),
		}

		req := httptest.NewRequest(http.MethodPost, "/api/agent/logout", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on logout, got %d: %s", w.Code, w.Body.String())
		}

		// Verify session token is removed
		if _, ok := sessionRepo.sessions[token]; ok {
			t.Errorf("expected session token to be deleted from repo after logout")
		}
	})

	t.Run("Agen rejected dapat mengunggah ulang bukti pembayaran dan status reset ke pending", func(t *testing.T) {
		rejectionReason := "Bukti transfer buram"
		rejectedAgent := &repository.Agent{
			ID:              888,
			TenantID:        t1.ID,
			Name:            "Agen Tertolak",
			Email:           strPtr("rejected_reupload@example.com"),
			Status:          "rejected",
			PaymentStatus:   "pending_verification",
			RejectionReason: &rejectionReason,
			ReferralCode:    "REJECT88",
		}
		agentRepo.agents[rejectedAgent.ID] = rejectedAgent

		token := "token-rejected-reupload"
		sessionRepo.sessions[token] = &repository.AgentSession{
			ID:          8881,
			AgentID:     rejectedAgent.ID,
			Token:       token,
			TenantID:    t1.ID,
			AgentStatus: "rejected",
			ExpiresAt:   time.Now().Add(24 * time.Hour),
		}

		imgBytes := createDummyPNG(t)
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "new_proof.png")
		if err != nil {
			t.Fatalf("failed to create form file: %v", err)
		}
		_, _ = io.Copy(part, bytes.NewReader(imgBytes))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/agent/payment-proof", body)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on re-upload proof, got %d: %s", w.Code, w.Body.String())
		}

		updated, _ := agentRepo.GetByID(context.Background(), t1.ID, rejectedAgent.ID)
		if updated.Status != "pending" {
			t.Errorf("expected status reset to 'pending', got %s", updated.Status)
		}
		if updated.PaymentStatus != "pending_verification" {
			t.Errorf("expected payment_status 'pending_verification', got %s", updated.PaymentStatus)
		}
		if updated.RejectionReason != nil {
			t.Errorf("expected rejection_reason to be cleared (nil), got %v", *updated.RejectionReason)
		}
	})
}
