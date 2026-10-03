package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
)

// GET /api/public/consultant: the agent behind a referral link, as the visitor of that travel sees them.
// Only public fields leave the API, and a code never resolves on another travel's site.
func TestAgentHandler_PublicConsultant(t *testing.T) {
	r, agentRepo, _, _, t1, t2 := setupAgentTestRouter()

	phone := "081234567890"
	email := "konsultan@example.com"
	bank := "BCA"
	active := &repository.Agent{Name: "Joko Konsultan", Phone: &phone, Email: &email, BankName: &bank, Status: "active", ReferralCode: "JOKO1234"}
	if err := agentRepo.Create(context.Background(), t1.ID, active); err != nil {
		t.Fatalf("create agent: %v", err)
	}
	phone2 := "081299990000"
	pending := &repository.Agent{Name: "Belum Aktif", Phone: &phone2, Status: "pending", ReferralCode: "PEND0001"}
	if err := agentRepo.Create(context.Background(), t1.ID, pending); err != nil {
		t.Fatalf("create pending agent: %v", err)
	}

	get := func(tenantID uint64, ref string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/public/consultant?ref="+ref, nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantID))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}

	t.Run("own travel returns public fields only", func(t *testing.T) {
		rec := get(t1.ID, "JOKO1234")
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
		}
		var body map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body["name"] != "Joko Konsultan" || body["referral_code"] != "JOKO1234" {
			t.Fatalf("unexpected body: %v", body)
		}
		// No contact details: the visitor reaches the consultant through the interest form only.
		for _, k := range []string{"email", "bank_name", "status", "password_hash", "phone", "whatsapp", "id", "tenant_id"} {
			if _, ok := body[k]; ok {
				t.Fatalf("field %q must not be public: %v", k, body)
			}
		}
		if strings.Contains(rec.Body.String(), "konsultan@example.com") || strings.Contains(rec.Body.String(), "81234567890") {
			t.Fatalf("contact details leaked: %s", rec.Body.String())
		}
	})

	t.Run("other travel gets 404", func(t *testing.T) {
		if rec := get(t2.ID, "JOKO1234"); rec.Code != http.StatusNotFound {
			t.Fatalf("tenant B resolved tenant A's code: %d %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("inactive agent gets 404", func(t *testing.T) {
		if rec := get(t1.ID, "PEND0001"); rec.Code != http.StatusNotFound {
			t.Fatalf("pending agent returned: %d %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("missing code gets 404", func(t *testing.T) {
		if rec := get(t1.ID, ""); rec.Code != http.StatusNotFound {
			t.Fatalf("empty code: %d", rec.Code)
		}
	})
}
