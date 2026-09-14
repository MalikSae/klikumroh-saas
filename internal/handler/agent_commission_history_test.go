package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// 1. Cross-Tenant & Cross-Agent Isolation
func TestAgentHandler_CommissionHistory_CrossTenantIsolation(t *testing.T) {
	agentRouter, _, agentRepo, agentSessionRepo, _, commLedgerRepo, payoutRepo, _, t1, t2, ag1, ag2, _ := setupAgentPayoutTestEnv()

	// Add Agent 3 in Tenant 1 (same tenant as ag1)
	ag3 := &repository.Agent{
		TenantID:     t1.ID,
		Name:         "Agen Tiga",
		Email:        strPtr("tiga@amanah.com"),
		Status:       "active",
		ReferralCode: "TIGA1",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, ag3)
	sess3 := &repository.AgentSession{
		TenantID:  t1.ID,
		AgentID:   ag3.ID,
		Token:     "tok-tiga",
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	_ = agentSessionRepo.Create(context.Background(), sess3)

	sess2 := &repository.AgentSession{
		TenantID:  t2.ID,
		AgentID:   ag2.ID,
		Token:     "tok-berkah",
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	_ = agentSessionRepo.Create(context.Background(), sess2)

	now := time.Now().UTC()

	// ag1 (Tenant 1) records
	_ = commLedgerRepo.Create(context.Background(), t1.ID, &repository.CommissionLedger{
		TenantID:  t1.ID,
		AgentID:   ag1.ID,
		Type:      "direct",
		Amount:    1500000,
		CreatedAt: now.Add(-2 * time.Hour),
	})
	_ = payoutRepo.Create(context.Background(), t1.ID, &repository.CommissionPayoutRequest{
		TenantID:                  t1.ID,
		AgentID:                   ag1.ID,
		AmountRequested:           500000,
		Status:                    "pending",
		BankNameSnapshot:          "BCA",
		BankAccountNumberSnapshot: "123456",
		BankAccountHolderSnapshot: "Fulan",
	})

	// ag3 (Tenant 1, different agent) records
	_ = commLedgerRepo.Create(context.Background(), t1.ID, &repository.CommissionLedger{
		TenantID:  t1.ID,
		AgentID:   ag3.ID,
		Type:      "direct",
		Amount:    3000000,
		CreatedAt: now.Add(-1 * time.Hour),
	})

	// ag2 (Tenant 2) records
	_ = commLedgerRepo.Create(context.Background(), t2.ID, &repository.CommissionLedger{
		TenantID:  t2.ID,
		AgentID:   ag2.ID,
		Type:      "direct",
		Amount:    2500000,
		CreatedAt: now.Add(-30 * time.Minute),
	})

	// Request as ag1 (Tenant 1)
	req := httptest.NewRequest(http.MethodGet, "/api/agent/commission-history", nil)
	req.Header.Set("Authorization", "Bearer tok-fulan")
	req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
	w := httptest.NewRecorder()
	agentRouter.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var items []service.CommissionHistoryItem
	if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
		t.Fatalf("failed to parse json: %v", err)
	}

	if len(items) != 2 {
		t.Fatalf("expected 2 items for ag1, got %d", len(items))
	}

	for _, item := range items {
		if item.Amount == 3000000 || item.Amount == 2500000 {
			t.Errorf("leaked other agent transaction with amount %v", item.Amount)
		}
	}
}

// 2. Baris type='override' TIDAK mengandung nama prospect di response API
func TestAgentHandler_CommissionHistory_OverrideDoesNotLeakProspectName(t *testing.T) {
	agentRouter, _, _, _, _, commLedgerRepo, _, _, t1, _, ag1, _, _ := setupAgentPayoutTestEnv()

	now := time.Now().UTC()
	// Insert override ledger entry
	_ = commLedgerRepo.Create(context.Background(), t1.ID, &repository.CommissionLedger{
		TenantID:   t1.ID,
		AgentID:    ag1.ID,
		ProspectID: 999, // Some sub-agent's prospect
		Type:       "override",
		Amount:     250000,
		CreatedAt:  now,
	})

	req := httptest.NewRequest(http.MethodGet, "/api/agent/commission-history", nil)
	req.Header.Set("Authorization", "Bearer tok-fulan")
	req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
	w := httptest.NewRecorder()
	agentRouter.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	bodyStr := w.Body.String()

	// Verify "Komisi override dari jaringan Anda" is present
	if !strings.Contains(bodyStr, "Komisi override dari jaringan Anda") {
		t.Errorf("expected description 'Komisi override dari jaringan Anda', body was: %s", bodyStr)
	}

	// Verify prospect name ("Prospect Mock" from mock repo) is NOT in response body for override
	if strings.Contains(bodyStr, "Prospect Mock") {
		t.Errorf("prospect name leaked in response body for override transaction: %s", bodyStr)
	}
}

// 3. Payout request berstatus 'rejected' tetap muncul di response (tidak difilter hilang)
func TestAgentHandler_CommissionHistory_IncludesRejectedPayoutRequests(t *testing.T) {
	agentRouter, _, _, _, _, _, payoutRepo, _, t1, _, ag1, _, _ := setupAgentPayoutTestEnv()

	rejectionReason := "Nomor rekening tidak cocok dengan nama KTP"
	_ = payoutRepo.Create(context.Background(), t1.ID, &repository.CommissionPayoutRequest{
		TenantID:                  t1.ID,
		AgentID:                   ag1.ID,
		AmountRequested:           750000,
		Status:                    "rejected",
		BankNameSnapshot:          "BCA",
		BankAccountNumberSnapshot: "987654321",
		BankAccountHolderSnapshot: "Fulan",
		RejectionReason:           &rejectionReason,
	})

	req := httptest.NewRequest(http.MethodGet, "/api/agent/commission-history", nil)
	req.Header.Set("Authorization", "Bearer tok-fulan")
	req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
	w := httptest.NewRecorder()
	agentRouter.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var items []service.CommissionHistoryItem
	if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	var foundRejected bool
	for _, item := range items {
		if item.Type == "payout" && item.Status == "rejected" && item.Amount == 750000 {
			foundRejected = true
			if item.Direction != "keluar" {
				t.Errorf("expected direction 'keluar' for payout, got %s", item.Direction)
			}
		}
	}

	if !foundRejected {
		t.Errorf("rejected payout request was filtered out or missing from response")
	}
}

// 4. Urutan hasil benar-benar DESC berdasarkan created_at, campuran dari dua sumber tabel
func TestAgentHandler_CommissionHistory_ChronologicalOrderMixedSources(t *testing.T) {
	agentRouter, _, _, _, _, commLedgerRepo, payoutRepo, _, t1, _, ag1, _, _ := setupAgentPayoutTestEnv()

	tOldest := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	tSecond := time.Date(2026, 9, 2, 14, 0, 0, 0, time.UTC)
	tThird := time.Date(2026, 9, 3, 9, 30, 0, 0, time.UTC)
	tNewest := time.Date(2026, 9, 4, 16, 45, 0, 0, time.UTC)

	// Item 1: Ledger direct (oldest: Sept 1)
	_ = commLedgerRepo.Create(context.Background(), t1.ID, &repository.CommissionLedger{
		TenantID:  t1.ID,
		AgentID:   ag1.ID,
		Type:      "direct",
		Amount:    1000000,
		CreatedAt: tOldest,
	})

	// Item 2: Payout request approved (Sept 2)
	payout2 := &repository.CommissionPayoutRequest{
		TenantID:                  t1.ID,
		AgentID:                   ag1.ID,
		AmountRequested:           400000,
		Status:                    "approved",
		BankNameSnapshot:          "BSI",
		BankAccountNumberSnapshot: "555123",
		BankAccountHolderSnapshot: "Fulan",
		CreatedAt:                 tSecond,
	}
	_ = payoutRepo.Create(context.Background(), t1.ID, payout2)

	// Item 3: Ledger correction (Sept 3)
	notes := "Bonus closing cepat"
	_ = commLedgerRepo.Create(context.Background(), t1.ID, &repository.CommissionLedger{
		TenantID:  t1.ID,
		AgentID:   ag1.ID,
		Type:      "correction",
		Amount:    300000,
		Notes:     &notes,
		CreatedAt: tThird,
	})

	// Item 4: Payout request pending (newest: Sept 4)
	payout4 := &repository.CommissionPayoutRequest{
		TenantID:                  t1.ID,
		AgentID:                   ag1.ID,
		AmountRequested:           600000,
		Status:                    "pending",
		BankNameSnapshot:          "BSI",
		BankAccountNumberSnapshot: "555123",
		BankAccountHolderSnapshot: "Fulan",
		CreatedAt:                 tNewest,
	}
	_ = payoutRepo.Create(context.Background(), t1.ID, payout4)

	req := httptest.NewRequest(http.MethodGet, "/api/agent/commission-history", nil)
	req.Header.Set("Authorization", "Bearer tok-fulan")
	req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
	w := httptest.NewRecorder()
	agentRouter.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var items []service.CommissionHistoryItem
	if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(items) != 4 {
		t.Fatalf("expected 4 items, got %d", len(items))
	}

	// Verify order: Newest (Sept 4) -> Sept 3 -> Sept 2 -> Sept 1 (Oldest)
	expectedAmounts := []float64{600000, 300000, 400000, 1000000}
	expectedTypes := []string{"payout", "correction", "payout", "direct"}

	for i := range items {
		if items[i].Amount != expectedAmounts[i] {
			t.Errorf("item %d expected amount %.0f, got %.0f", i, expectedAmounts[i], items[i].Amount)
		}
		if items[i].Type != expectedTypes[i] {
			t.Errorf("item %d expected type %s, got %s", i, expectedTypes[i], items[i].Type)
		}
	}
}

// 5. Inactive Agent Rejected with 403
func TestAgentHandler_CommissionHistory_InactiveAgentForbidden(t *testing.T) {
	agentRouter, _, agentRepo, agentSessionRepo, _, _, _, _, t1, _, _, _, _ := setupAgentPayoutTestEnv()

	// Inactive agent
	agInactive := &repository.Agent{
		TenantID:     t1.ID,
		Name:         "Agen Pending",
		Email:        strPtr("pending@amanah.com"),
		Status:       "pending",
		ReferralCode: "PENDING1",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, agInactive)
	sessInactive := &repository.AgentSession{
		TenantID:  t1.ID,
		AgentID:   agInactive.ID,
		Token:     "tok-inactive",
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	_ = agentSessionRepo.Create(context.Background(), sessInactive)

	req := httptest.NewRequest(http.MethodGet, "/api/agent/commission-history", nil)
	req.Header.Set("Authorization", "Bearer tok-inactive")
	req = req.WithContext(middleware.WithTenantID(req.Context(), t1.ID))
	w := httptest.NewRecorder()
	agentRouter.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for inactive agent, got %d: %s", w.Code, w.Body.String())
	}
}
