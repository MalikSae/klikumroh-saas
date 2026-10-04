package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/service"
)

// loginForHandoff signs in on the given host and returns the handoff code and the binding cookie.
func loginForHandoff(t *testing.T, r *chi.Mux, origin string) (string, *http.Cookie) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"email": "admin@travela.com", "password": "SecretPassword123!"})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("login: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	var res struct {
		Token       string `json:"token"`
		HandoffCode string `json:"handoff_code"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("login: parse response: %v", err)
	}
	if len(res.Token) != 64 || len(res.HandoffCode) != 64 {
		t.Fatalf("login: expected 64-char token and handoff_code, got %d and %d", len(res.Token), len(res.HandoffCode))
	}
	for _, c := range rr.Result().Cookies() {
		if c.Name == "ku_handoff" {
			return res.HandoffCode, c
		}
	}
	t.Fatalf("login: no ku_handoff cookie set")
	return "", nil
}

func exchangeHandoff(r *chi.Mux, code string, cookie *http.Cookie) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"code": code})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/handoff/exchange", bytes.NewBuffer(body))
	if cookie != nil {
		req.AddCookie(&http.Cookie{Name: cookie.Name, Value: cookie.Value})
	}
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func TestAuthHandler_Handoff(t *testing.T) {
	t.Run("Login sets an HttpOnly binding cookie scoped to the handoff path", func(t *testing.T) {
		r, _, _ := setupAuthRouter()
		_, c := loginForHandoff(t, r, "")
		if !c.HttpOnly || c.Path != "/api/auth/handoff" || c.MaxAge <= 0 || c.SameSite != http.SameSiteLaxMode {
			t.Errorf("unexpected cookie attributes: %+v", c)
		}
		if c.Domain != "" {
			t.Errorf("local login should set a host-only cookie, got domain %q", c.Domain)
		}
	})

	t.Run("Login on klikumroh.id shares the cookie with app.klikumroh.id", func(t *testing.T) {
		r, _, _ := setupAuthRouter()
		_, c := loginForHandoff(t, r, "https://klikumroh.id")
		if c.Domain != "klikumroh.id" || !c.Secure {
			t.Errorf("expected Secure cookie on domain klikumroh.id, got domain %q secure %v", c.Domain, c.Secure)
		}
	})

	t.Run("Code with the matching cookie returns the session once", func(t *testing.T) {
		r, _, sessionRepo := setupAuthRouter()
		code, c := loginForHandoff(t, r, "")

		rr := exchangeHandoff(r, code, c)
		if rr.Code != http.StatusOK {
			t.Fatalf("exchange: expected 200, got %d (%s)", rr.Code, rr.Body.String())
		}
		var res service.LoginResult
		if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
			t.Fatalf("exchange: parse response: %v", err)
		}
		if _, ok := sessionRepo.sessions[res.Token]; !ok || res.User.TenantID != 10 {
			t.Errorf("exchange returned an unknown session or wrong tenant: tenant %d", res.User.TenantID)
		}

		if again := exchangeHandoff(r, code, c); again.Code != http.StatusUnauthorized {
			t.Errorf("second exchange: expected 401, got %d", again.Code)
		}
	})

	t.Run("Code without the cookie is rejected (link sent to another browser)", func(t *testing.T) {
		r, _, _ := setupAuthRouter()
		code, c := loginForHandoff(t, r, "")
		if rr := exchangeHandoff(r, code, nil); rr.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rr.Code)
		}
		// The failed attempt must not burn the code for the browser that logged in.
		if rr := exchangeHandoff(r, code, c); rr.Code != http.StatusOK {
			t.Errorf("owner exchange after failed attempt: expected 200, got %d", rr.Code)
		}
	})

	t.Run("Code with another browser's cookie is rejected (login CSRF)", func(t *testing.T) {
		r, _, _ := setupAuthRouter()
		attackerCode, _ := loginForHandoff(t, r, "")
		_, victimCookie := loginForHandoff(t, r, "")
		if rr := exchangeHandoff(r, attackerCode, victimCookie); rr.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", rr.Code)
		}
	})

	t.Run("Unknown code is rejected", func(t *testing.T) {
		r, _, _ := setupAuthRouter()
		_, c := loginForHandoff(t, r, "")
		if rr := exchangeHandoff(r, "deadbeef", c); rr.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", rr.Code)
		}
	})
}
