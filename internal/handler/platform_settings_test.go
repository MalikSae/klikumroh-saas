package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/service"
)

type mockPlatformSettingsRepo struct {
	settings map[string]string
}

func newMockPlatformSettingsRepo() *mockPlatformSettingsRepo {
	return &mockPlatformSettingsRepo{
		settings: map[string]string{
			"whatsapp_number":    "6281234567890",
			"bank_name":          "Bank Syariah Indonesia (BSI)",
			"bank_account_number": "7123456789",
			"bank_account_holder": "PT Klik Umroh Digital",
		},
	}
}

func (m *mockPlatformSettingsRepo) GetAll(ctx context.Context) (map[string]string, error) {
	res := make(map[string]string)
	for k, v := range m.settings {
		res[k] = v
	}
	return res, nil
}

func (m *mockPlatformSettingsRepo) SetMany(ctx context.Context, settings map[string]string) error {
	for k, v := range settings {
		m.settings[k] = v
	}
	return nil
}

func setupPlatformSettingsEnv() (*mockPlatformSettingsRepo, chi.Router) {
	repo := newMockPlatformSettingsRepo()
	svc := service.NewPlatformSettingsService(repo)
	h := handler.NewPlatformSettingsHandler(svc)

	r := chi.NewRouter()
	r.Get("/api/public/platform-settings", h.GetPublic)

	r.Group(func(staffRouter chi.Router) {
		staffRouter.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				if req.Header.Get("X-Test-Staff-Auth") == "true" {
					ctx := middleware.WithStaffUserID(req.Context(), 1)
					next.ServeHTTP(w, req.WithContext(ctx))
					return
				}
				next.ServeHTTP(w, req)
			})
		})
		staffRouter.Get("/api/staff/platform-settings", h.GetStaff)
		staffRouter.Put("/api/staff/platform-settings", h.UpdateStaff)
	})

	return repo, r
}

func TestPlatformSettings_GetPublic(t *testing.T) {
	_, r := setupPlatformSettingsEnv()

	req := httptest.NewRequest(http.MethodGet, "/api/public/platform-settings", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if res["whatsapp_number"] != "6281234567890" {
		t.Errorf("expected whatsapp 6281234567890, got %s", res["whatsapp_number"])
	}
	if res["bank_name"] != "Bank Syariah Indonesia (BSI)" {
		t.Errorf("expected bank BSI, got %s", res["bank_name"])
	}
}

func TestPlatformSettings_StaffUnauthorized(t *testing.T) {
	_, r := setupPlatformSettingsEnv()

	req := httptest.NewRequest(http.MethodGet, "/api/staff/platform-settings", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", w.Code)
	}
}

func TestPlatformSettings_StaffUpdateSuccess(t *testing.T) {
	repo, r := setupPlatformSettingsEnv()

	payload := service.UpdatePlatformSettingsRequest{
		WhatsAppNumber:   "081299887766", // Should normalize to 6281299887766
		BankName:         "Bank Central Asia (BCA)",
		BankAccountNumber: "8889990001",
		BankAccountHolder: "PT KlikUmroh Sejahtera",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPut, "/api/staff/platform-settings", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-Staff-Auth", "true")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 on update, got %d: %s", w.Code, w.Body.String())
	}

	if repo.settings["whatsapp_number"] != "6281299887766" {
		t.Errorf("expected normalized whatsapp 6281299887766, got %s", repo.settings["whatsapp_number"])
	}
	if repo.settings["bank_name"] != "Bank Central Asia (BCA)" {
		t.Errorf("expected updated bank BCA, got %s", repo.settings["bank_name"])
	}

	// Verify public endpoint reflects updated settings
	pubReq := httptest.NewRequest(http.MethodGet, "/api/public/platform-settings", nil)
	pubW := httptest.NewRecorder()
	r.ServeHTTP(pubW, pubReq)

	var pubRes map[string]interface{}
	_ = json.Unmarshal(pubW.Body.Bytes(), &pubRes)
	if pubRes["whatsapp_number"] != "6281299887766" {
		t.Errorf("expected public endpoint to return updated whatsapp, got %s", pubRes["whatsapp_number"])
	}
}

func TestPlatformSettings_StaffUpdateInvalidInput(t *testing.T) {
	_, r := setupPlatformSettingsEnv()

	// WhatsApp too short
	payload := service.UpdatePlatformSettingsRequest{
		WhatsAppNumber:   "123",
		BankName:         "BCA",
		BankAccountNumber: "123456",
		BankAccountHolder: "PT Klik",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPut, "/api/staff/platform-settings", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-Staff-Auth", "true")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid whatsapp, got %d", w.Code)
	}
}

// Regresi temuan audit #6: pengaturan kosong tidak boleh diganti data placeholder yang terlihat asli.
func TestPlatformSettings_EmptyValuesAreNotReplacedWithPlaceholders(t *testing.T) {
	repo, r := setupPlatformSettingsEnv()
	repo.settings = map[string]string{}

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/public/platform-settings", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var res struct {
		WhatsAppNumber    string   `json:"whatsapp_number"`
		BankAccountNumber string   `json:"bank_account_number"`
		TermsURL          string   `json:"terms_url"`
		MissingFields     []string `json:"missing_fields"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res.WhatsAppNumber != "" || res.BankAccountNumber != "" {
		t.Fatalf("expected empty values, got whatsapp=%q account=%q (placeholder leaked)", res.WhatsAppNumber, res.BankAccountNumber)
	}
	if len(res.MissingFields) != 6 {
		t.Fatalf("expected 6 missing fields, got %v", res.MissingFields)
	}
}

func TestPlatformSettings_LegalURLs(t *testing.T) {
	base := service.UpdatePlatformSettingsRequest{
		WhatsAppNumber:    "081299887766",
		BankName:          "Bank Central Asia (BCA)",
		BankAccountNumber: "8889990001",
		BankAccountHolder: "PT KlikUmroh Sejahtera",
	}
	put := func(r http.Handler, payload service.UpdatePlatformSettingsRequest) *httptest.ResponseRecorder {
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/api/staff/platform-settings", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-Staff-Auth", "true")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	t.Run("non-https URL rejected", func(t *testing.T) {
		_, r := setupPlatformSettingsEnv()
		p := base
		p.TermsURL = "http://klikumroh.id/syarat"
		if w := put(r, p); w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for http:// terms URL, got %d", w.Code)
		}
	})

	t.Run("https URLs saved and exposed publicly", func(t *testing.T) {
		repo, r := setupPlatformSettingsEnv()
		p := base
		p.TermsURL = "https://klikumroh.id/syarat-ketentuan"
		p.PrivacyURL = "https://klikumroh.id/kebijakan-privasi"
		if w := put(r, p); w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		if repo.settings["terms_url"] != p.TermsURL || repo.settings["privacy_url"] != p.PrivacyURL {
			t.Fatalf("legal URLs not stored: %v", repo.settings)
		}
	})
}
