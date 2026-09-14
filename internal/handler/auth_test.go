package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/handler"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// mockAdminUserRepo implements repository.AdminUserRepository for auth handler tests.
type mockAdminUserRepo struct {
	users map[string]*repository.AdminUser
}

func (m *mockAdminUserRepo) Create(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	m.users[user.Email] = user
	return nil
}

func (m *mockAdminUserRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.AdminUser, error) {
	return nil, repository.ErrNotFound
}

func (m *mockAdminUserRepo) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.AdminUser, error) {
	return nil, nil
}

func (m *mockAdminUserRepo) Update(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	return nil
}

func (m *mockAdminUserRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}

func (m *mockAdminUserRepo) FindByTenantAndEmail(ctx context.Context, tenantID uint64, email string) (*repository.AdminUser, error) {
	for _, u := range m.users {
		if u.TenantID == tenantID && u.Email == email {
			return u, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockAdminUserRepo) CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error) {
	count := 0
	for _, u := range m.users {
		if u.TenantID == tenantID && u.Status == "active" {
			count++
		}
	}
	return count, nil
}

func (m *mockAdminUserRepo) FindByEmail(ctx context.Context, email string) (*repository.AdminUser, error) {
	u, ok := m.users[email]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return u, nil
}

// mockSessionRepo implements repository.SessionRepository for auth handler tests.
type mockSessionRepo struct {
	sessions map[string]*repository.Session
}

func (m *mockSessionRepo) Create(ctx context.Context, tenantID uint64, session *repository.Session) error {
	m.sessions[session.Token] = session
	return nil
}

func (m *mockSessionRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Session, error) {
	return nil, repository.ErrNotFound
}

func (m *mockSessionRepo) ListByAdminUser(ctx context.Context, tenantID uint64, adminUserID uint64) ([]repository.Session, error) {
	return nil, nil
}

func (m *mockSessionRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}

func (m *mockSessionRepo) DeleteByToken(ctx context.Context, token string) error {
	if _, ok := m.sessions[token]; !ok {
		return repository.ErrNotFound
	}
	delete(m.sessions, token)
	return nil
}

func (m *mockSessionRepo) FindByToken(ctx context.Context, token string) (*repository.Session, error) {
	s, ok := m.sessions[token]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return s, nil
}

func setupAuthRouter() (*chi.Mux, *mockAdminUserRepo, *mockSessionRepo) {
	passwordHash, _ := bcrypt.GenerateFromPassword([]byte("SecretPassword123!"), bcrypt.DefaultCost)
	adminUserRepo := &mockAdminUserRepo{
		users: map[string]*repository.AdminUser{
			"admin@travela.com": {
				ID:           1,
				TenantID:     10,
				Email:        "admin@travela.com",
				PasswordHash: string(passwordHash),
				Name:         "Admin Travel A",
				Status:       "active",
			},
			"inactive@travelb.com": {
				ID:           2,
				TenantID:     20,
				Email:        "inactive@travelb.com",
				PasswordHash: string(passwordHash),
				Name:         "Inactive Admin",
				Status:       "inactive",
			},
		},
	}

	sessionRepo := &mockSessionRepo{
		sessions: map[string]*repository.Session{
			"existing_token": {
				ID:          1,
				Token:       "existing_token",
				AdminUserID: 1,
				TenantID:    10,
				ExpiresAt:   time.Now().Add(24 * time.Hour),
			},
		},
	}

	authService := service.NewAuthService(adminUserRepo, sessionRepo)
	authHandler := handler.NewAuthHandler(authService)

	r := chi.NewRouter()
	authHandler.RegisterRoutes(r)

	return r, adminUserRepo, sessionRepo
}

func TestAuthHandler_Login(t *testing.T) {
	r, _, _ := setupAuthRouter()

	t.Run("Invalid payload returns 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString("{invalid-json"))
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("Expected 400, got %d", rr.Code)
		}
	})

	t.Run("Empty email/password returns 400", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"email": "", "password": ""})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("Expected 400, got %d", rr.Code)
		}
	})

	t.Run("Unknown email returns 401 generic error", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"email": "unknown@travel.com", "password": "anypassword"})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401, got %d", rr.Code)
		}
		var errResp map[string]string
		_ = json.Unmarshal(rr.Body.Bytes(), &errResp)
		if errResp["error"] != "invalid credentials" {
			t.Errorf("Expected generic 'invalid credentials', got %s", errResp["error"])
		}
	})

	t.Run("Wrong password returns 401 generic error", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"email": "admin@travela.com", "password": "WrongPassword!"})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401, got %d", rr.Code)
		}
		var errResp map[string]string
		_ = json.Unmarshal(rr.Body.Bytes(), &errResp)
		if errResp["error"] != "invalid credentials" {
			t.Errorf("Expected generic 'invalid credentials', got %s", errResp["error"])
		}
	})

	t.Run("Inactive user returns 401 generic error", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"email": "inactive@travelb.com", "password": "SecretPassword123!"})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401, got %d", rr.Code)
		}
		var errResp map[string]string
		_ = json.Unmarshal(rr.Body.Bytes(), &errResp)
		if errResp["error"] != "invalid credentials" {
			t.Errorf("Expected generic 'invalid credentials', got %s", errResp["error"])
		}
	})

	t.Run("Responses for unknown email and wrong password are 100% IDENTICAL", func(t *testing.T) {
		bodyUnknown, _ := json.Marshal(map[string]string{"email": "unknown@travel.com", "password": "anypassword"})
		reqUnknown := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(bodyUnknown))
		rrUnknown := httptest.NewRecorder()
		r.ServeHTTP(rrUnknown, reqUnknown)

		bodyWrongPass, _ := json.Marshal(map[string]string{"email": "admin@travela.com", "password": "WrongPassword!"})
		reqWrongPass := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(bodyWrongPass))
		rrWrongPass := httptest.NewRecorder()
		r.ServeHTTP(rrWrongPass, reqWrongPass)

		if rrUnknown.Code != rrWrongPass.Code {
			t.Errorf("Status code mismatch: unknown email returned %d, wrong password returned %d", rrUnknown.Code, rrWrongPass.Code)
		}
		if rrUnknown.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 status code, got %d", rrUnknown.Code)
		}
		if !bytes.Equal(bytes.TrimSpace(rrUnknown.Body.Bytes()), bytes.TrimSpace(rrWrongPass.Body.Bytes())) {
			t.Errorf("Response body mismatch: unknown email got '%s', wrong password got '%s'", rrUnknown.Body.String(), rrWrongPass.Body.String())
		}
	})

	t.Run("Correct credentials return 200 with token and user details", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"email": "admin@travela.com", "password": "SecretPassword123!"})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d (%s)", rr.Code, rr.Body.String())
		}
		var res service.LoginResult
		if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}
		if len(res.Token) != 64 {
			t.Errorf("Expected 64-char hex token (32 bytes), got length %d (%s)", len(res.Token), res.Token)
		}
		if res.User.Email != "admin@travela.com" || res.User.TenantID != 10 {
			t.Errorf("Unexpected user in login response: %+v", res.User)
		}
	})
}

func TestAuthHandler_Logout(t *testing.T) {
	r, _, sessionRepo := setupAuthRouter()

	t.Run("Missing token header returns 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("Expected 400, got %d", rr.Code)
		}
	})

	t.Run("Successful logout deletes session", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
		req.Header.Set("Authorization", "Bearer existing_token")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rr.Code)
		}
		if _, exists := sessionRepo.sessions["existing_token"]; exists {
			t.Errorf("Expected session 'existing_token' to be deleted")
		}
	})
}
