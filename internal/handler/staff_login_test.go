package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

func newStaffLoginRouter(t *testing.T) (*chi.Mux, *mockStaffRepo) {
	t.Helper()
	repo := newMockStaffRepo()
	hash, err := bcrypt.GenerateFromPassword([]byte("rahasia-benar"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repo.staffUsers["aktif@klikumroh.id"] = &repository.StaffUser{ID: 1, Name: "Aktif", Email: "aktif@klikumroh.id", PasswordHash: string(hash), Status: "active"}
	repo.staffUsers["nonaktif@klikumroh.id"] = &repository.StaffUser{ID: 2, Name: "Nonaktif", Email: "nonaktif@klikumroh.id", PasswordHash: string(hash), Status: "inactive"}

	svc := service.NewStaffService(repo, nil, nil, newMockPricingPlanRepo(), nil, nil, nil, nil)
	r := chi.NewRouter()
	handler.NewStaffHandler(svc).RegisterPublicRoutes(r)
	return r, repo
}

func staffLogin(r http.Handler, email, password, ip string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	req := httptest.NewRequest(http.MethodPost, "/api/staff/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = ip + ":1234"
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

// H1: 5 wrong passwords for one staff email lock that email for 15 minutes, even with the right password
// afterwards; another email is unaffected.
func TestStaffLogin_FailedLoginLockout(t *testing.T) {
	r, _ := newStaffLoginRouter(t)

	for i := 0; i < 5; i++ {
		if rr := staffLogin(r, "aktif@klikumroh.id", "salah", "10.0.0.1"); rr.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d", i+1, rr.Code)
		}
	}
	rr := staffLogin(r, "aktif@klikumroh.id", "rahasia-benar", "10.0.0.1")
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after 5 failures, got %d (%s)", rr.Code, rr.Body.String())
	}
	var body map[string]string
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if body["error"] != middleware.LoginLockedMessage {
		t.Fatalf("unexpected lock message: %q", body["error"])
	}
	// Case-insensitive key: the same email in upper case is locked too.
	if rr := staffLogin(r, "AKTIF@klikumroh.id", "rahasia-benar", "10.0.0.2"); rr.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 for the same email in another case, got %d", rr.Code)
	}
}

// H1: a successful login resets the failure counter.
func TestStaffLogin_SuccessResetsFailures(t *testing.T) {
	r, _ := newStaffLoginRouter(t)
	for i := 0; i < 4; i++ {
		staffLogin(r, "aktif@klikumroh.id", "salah", "10.0.1.1")
	}
	if rr := staffLogin(r, "aktif@klikumroh.id", "rahasia-benar", "10.0.1.1"); rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	for i := 0; i < 4; i++ {
		if rr := staffLogin(r, "aktif@klikumroh.id", "salah", "10.0.1.1"); rr.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d after reset: expected 401, got %d", i+1, rr.Code)
		}
	}
}

// H1: the per-IP limiter caps login calls at 20 per minute from one IP.
func TestStaffLogin_PerIPRateLimit(t *testing.T) {
	r, _ := newStaffLoginRouter(t)
	limited := false
	for i := 0; i < 25; i++ {
		// Different emails so the per-email lockout never triggers.
		email := "x" + string(rune('a'+i)) + "@klikumroh.id"
		if rr := staffLogin(r, email, "salah", "10.0.2.1"); rr.Code == http.StatusTooManyRequests {
			if i < 20 {
				t.Fatalf("rate limited too early at request %d", i+1)
			}
			limited = true
		}
	}
	if !limited {
		t.Fatal("expected the per-IP limiter to answer 429 within 25 requests")
	}
}

// H1: an inactive staff account is only revealed with the correct password; a wrong password gets the
// same 401 as an unknown email.
func TestStaffLogin_InactiveNotRevealedWithoutPassword(t *testing.T) {
	r, _ := newStaffLoginRouter(t)
	wrong := staffLogin(r, "nonaktif@klikumroh.id", "salah", "10.0.3.1")
	unknown := staffLogin(r, "tidakada@klikumroh.id", "salah", "10.0.3.1")
	if wrong.Code != http.StatusUnauthorized || unknown.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401/401, got %d/%d", wrong.Code, unknown.Code)
	}
	if wrong.Body.String() != unknown.Body.String() {
		t.Fatalf("inactive+wrong password must look like unknown email: %q vs %q", wrong.Body.String(), unknown.Body.String())
	}
	if rr := staffLogin(r, "nonaktif@klikumroh.id", "rahasia-benar", "10.0.3.1"); rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for inactive staff with correct password, got %d", rr.Code)
	}
}
