package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/handler"
	appMiddleware "klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// inMemoryAdminUserRepo is an in-memory implementation of repository.AdminUserRepository for unit testing.
type inMemoryAdminUserRepo struct {
	mu     sync.Mutex
	users  map[uint64]*repository.AdminUser
	nextID uint64
}

func newInMemoryAdminUserRepo() *inMemoryAdminUserRepo {
	return &inMemoryAdminUserRepo{
		users:  make(map[uint64]*repository.AdminUser),
		nextID: 1,
	}
}

func (r *inMemoryAdminUserRepo) Create(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	user.ID = r.nextID
	r.nextID++
	user.TenantID = tenantID
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	copied := *user
	r.users[user.ID] = &copied
	return nil
}

func (r *inMemoryAdminUserRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	u, ok := r.users[id]
	if !ok || u.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	copied := *u
	return &copied, nil
}

func (r *inMemoryAdminUserRepo) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var result []repository.AdminUser
	for _, u := range r.users {
		if u.TenantID == tenantID {
			result = append(result, *u)
		}
	}
	return result, nil
}

func (r *inMemoryAdminUserRepo) Update(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, ok := r.users[user.ID]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	user.UpdatedAt = time.Now()
	copied := *user
	r.users[user.ID] = &copied
	return nil
}

func (r *inMemoryAdminUserRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, ok := r.users[id]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	delete(r.users, id)
	return nil
}

func (r *inMemoryAdminUserRepo) FindByTenantAndEmail(ctx context.Context, tenantID uint64, email string) (*repository.AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, u := range r.users {
		if u.TenantID == tenantID && u.Email == email {
			copied := *u
			return &copied, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (r *inMemoryAdminUserRepo) CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	count := 0
	for _, u := range r.users {
		if u.TenantID == tenantID && u.Status == "active" {
			count++
		}
	}
	return count, nil
}

func (r *inMemoryAdminUserRepo) FindByEmail(ctx context.Context, email string) (*repository.AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, u := range r.users {
		if u.Email == email {
			copied := *u
			return &copied, nil
		}
	}
	return nil, repository.ErrNotFound
}

func setupTeamTestRouter(adminRepo repository.AdminUserRepository) chi.Router {
	teamSvc := service.NewTeamService(adminRepo)
	teamH := handler.NewTeamHandler(teamSvc)

	r := chi.NewRouter()
	teamH.RegisterDashboardRoutes(r)
	return r
}

func TestTeamAndProfileEndpoints(t *testing.T) {
	repo := newInMemoryAdminUserRepo()
	r := setupTeamTestRouter(repo)

	// Seed Tenant 1: Admin 1 (active)
	pwHash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	admin1 := &repository.AdminUser{
		TenantID:     1,
		Email:        "admin1@tenant1.com",
		Name:         "Admin Satu",
		PasswordHash: string(pwHash),
		Status:       "active",
	}
	_ = repo.Create(context.Background(), 1, admin1)

	// Seed Tenant 2: Admin Tenant 2 (active)
	adminT2 := &repository.AdminUser{
		TenantID:     2,
		Email:        "admin@tenant2.com",
		Name:         "Admin Dua",
		PasswordHash: string(pwHash),
		Status:       "active",
	}
	_ = repo.Create(context.Background(), 2, adminT2)

	t.Run("1. Tambah anggota dengan email yang sudah dipakai anggota lain SATU tenant -> 400", func(t *testing.T) {
		body := map[string]string{
			"name":     "Staff Baru",
			"email":    "admin1@tenant1.com", // duplicate within tenant 1
			"password": "passwordBaru123",
		}
		jsonBody, _ := json.Marshal(body)

		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/team", bytes.NewReader(jsonBody))
		ctx := appMiddleware.WithTenantID(req.Context(), 1)
		ctx = appMiddleware.WithAdminUserID(ctx, admin1.ID)
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("2. Email yang sama di tenant LAIN -> 400 (email admin wajib unik global demi login satu pintu)", func(t *testing.T) {
		// Attempt to register "admin1@tenant1.com" inside Tenant 2 -> must be rejected (global uniqueness)
		body := map[string]string{
			"name":     "Staff Tenant 2 Same Email",
			"email":    "admin1@tenant1.com", // same email already in Tenant 1
			"password": "passwordBaru123",
		}
		jsonBody, _ := json.Marshal(body)

		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/team", bytes.NewReader(jsonBody))
		ctx := appMiddleware.WithTenantID(req.Context(), 2)
		ctx = appMiddleware.WithAdminUserID(ctx, adminT2.ID)
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400 for duplicate email across tenants, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("2b. Email unik baru di tenant LAIN -> 201 berhasil", func(t *testing.T) {
		body := map[string]string{
			"name":     "Staff Tenant 2 New Email",
			"email":    "staff-unique@tenant2.com",
			"password": "passwordBaru123",
		}
		jsonBody, _ := json.Marshal(body)

		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/team", bytes.NewReader(jsonBody))
		ctx := appMiddleware.WithTenantID(req.Context(), 2)
		ctx = appMiddleware.WithAdminUserID(ctx, adminT2.ID)
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected status 201, got %d: %s", w.Code, w.Body.String())
		}

		var created service.TeamMemberResponse
		_ = json.NewDecoder(w.Body).Decode(&created)
		if created.Email != "staff-unique@tenant2.com" {
			t.Fatalf("expected email staff-unique@tenant2.com, got %s", created.Email)
		}
	})

	t.Run("3. Toggle-status deactivate pada diri sendiri -> 400", func(t *testing.T) {
		body := map[string]string{"action": "deactivate"}
		jsonBody, _ := json.Marshal(body)

		url := fmt.Sprintf("/api/dashboard/team/%d/toggle-status", admin1.ID)
		req := httptest.NewRequest(http.MethodPatch, url, bytes.NewReader(jsonBody))
		ctx := appMiddleware.WithTenantID(req.Context(), 1)
		ctx = appMiddleware.WithAdminUserID(ctx, admin1.ID) // self
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("4. Toggle-status deactivate saat itu satu-satunya admin aktif tersisa -> 400", func(t *testing.T) {
		// In Tenant 1, create a 2nd admin
		admin2 := &repository.AdminUser{
			TenantID:     1,
			Email:        "admin2@tenant1.com",
			Name:         "Admin Dua",
			PasswordHash: string(pwHash),
			Status:       "active",
		}
		_ = repo.Create(context.Background(), 1, admin2)

		// Now deactivate admin2 while logged in as admin1 -> should SUCCEED because active count is 2
		body := map[string]string{"action": "deactivate"}
		jsonBody, _ := json.Marshal(body)

		url := fmt.Sprintf("/api/dashboard/team/%d/toggle-status", admin2.ID)
		req := httptest.NewRequest(http.MethodPatch, url, bytes.NewReader(jsonBody))
		ctx := appMiddleware.WithTenantID(req.Context(), 1)
		ctx = appMiddleware.WithAdminUserID(ctx, admin1.ID)
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200 deactivating admin2, got %d: %s", w.Code, w.Body.String())
		}

		// Now in Tenant 1, admin1 is the ONLY active admin remaining.
		// Try deactivating admin1 using a request (say if someone tried via admin2 session or target admin1)
		urlSelf := fmt.Sprintf("/api/dashboard/team/%d/toggle-status", admin1.ID)
		req2 := httptest.NewRequest(http.MethodPatch, urlSelf, bytes.NewReader(jsonBody))
		ctx2 := appMiddleware.WithTenantID(req2.Context(), 1)
		ctx2 = appMiddleware.WithAdminUserID(ctx2, admin2.ID) // pretending admin2 is logged in
		req2 = req2.WithContext(ctx2)

		w2 := httptest.NewRecorder()
		r.ServeHTTP(w2, req2)
		if w2.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400 for last active admin, got %d: %s", w2.Code, w2.Body.String())
		}
	})

	t.Run("5. Ubah password sendiri dengan current_password salah -> 401", func(t *testing.T) {
		body := map[string]string{
			"current_password": "wrongPassword123",
			"new_password":     "newSecurePass123",
		}
		jsonBody, _ := json.Marshal(body)

		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/me/password", bytes.NewReader(jsonBody))
		ctx := appMiddleware.WithTenantID(req.Context(), 1)
		ctx = appMiddleware.WithAdminUserID(ctx, admin1.ID)
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected status 401, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("5b. Ubah password sendiri dengan current_password benar -> 200", func(t *testing.T) {
		body := map[string]string{
			"current_password": "password123",
			"new_password":     "newSecurePass123",
		}
		jsonBody, _ := json.Marshal(body)

		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/me/password", bytes.NewReader(jsonBody))
		ctx := appMiddleware.WithTenantID(req.Context(), 1)
		ctx = appMiddleware.WithAdminUserID(ctx, admin1.ID)
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("6. Isolasi cross-tenant: admin tenant A tidak bisa lihat/ubah/toggle-status anggota tim tenant B", func(t *testing.T) {
		// Logged in as Tenant 1, try to toggle status of adminT2 (which belongs to Tenant 2)
		body := map[string]string{"action": "deactivate"}
		jsonBody, _ := json.Marshal(body)

		urlCross := fmt.Sprintf("/api/dashboard/team/%d/toggle-status", adminT2.ID)
		req := httptest.NewRequest(http.MethodPatch, urlCross, bytes.NewReader(jsonBody))
		ctx := appMiddleware.WithTenantID(req.Context(), 1) // Tenant 1 context
		ctx = appMiddleware.WithAdminUserID(ctx, admin1.ID)
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected status 404 (isolated), got %d: %s", w.Code, w.Body.String())
		}

		// Also check ListTeam as Tenant 1 does NOT contain Tenant 2's members
		reqList := httptest.NewRequest(http.MethodGet, "/api/dashboard/team", nil)
		ctxList := appMiddleware.WithTenantID(reqList.Context(), 1)
		ctxList = appMiddleware.WithAdminUserID(ctxList, admin1.ID)
		reqList = reqList.WithContext(ctxList)

		wList := httptest.NewRecorder()
		r.ServeHTTP(wList, reqList)
		if wList.Code != http.StatusOK {
			t.Fatalf("expected status 200 for list, got %d", wList.Code)
		}

		var members []service.TeamMemberResponse
		_ = json.NewDecoder(wList.Body).Decode(&members)
		for _, m := range members {
			if m.ID == adminT2.ID {
				t.Fatalf("Cross-tenant leakage: found Tenant 2 admin %d in Tenant 1 team list!", m.ID)
			}
		}
	})
}
