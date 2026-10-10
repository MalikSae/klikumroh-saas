package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/handler"
	appMiddleware "klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// TestTeamRoles covers the PIC / admin split: only a PIC changes the team, the travel always keeps one
// active PIC, and one travel's PIC can never touch another travel's members.
func TestTeamRoles(t *testing.T) {
	repo := newInMemoryAdminUserRepo()
	teamSvc := service.NewTeamService(repo, &mockSessionRepo{sessions: map[string]*repository.Session{}})
	teamH := handler.NewTeamHandler(teamSvc)
	r := chi.NewRouter()
	teamH.RegisterDashboardRoutes(r, appMiddleware.RequirePIC(repo))

	hash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	mk := func(tenant uint64, email, role, status string) *repository.AdminUser {
		u := &repository.AdminUser{TenantID: tenant, Email: email, Name: email, PasswordHash: string(hash), Status: status, Role: role}
		if err := repo.Create(context.Background(), tenant, u); err != nil {
			t.Fatal(err)
		}
		return u
	}
	pic := mk(1, "pic@t1.test", repository.RolePIC, "active")
	adm := mk(1, "adm@t1.test", repository.RoleAdmin, "active")
	other := mk(1, "other@t1.test", repository.RoleAdmin, "active")
	picT2 := mk(2, "pic@t2.test", repository.RolePIC, "active")
	admT2 := mk(2, "adm@t2.test", repository.RoleAdmin, "active")

	call := func(method, path string, body any, tenant uint64, userID uint64, staff bool) *httptest.ResponseRecorder {
		var rd *bytes.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			rd = bytes.NewReader(b)
		} else {
			rd = bytes.NewReader(nil)
		}
		req := httptest.NewRequest(method, path, rd)
		ctx := appMiddleware.WithTenantID(req.Context(), tenant)
		ctx = appMiddleware.WithAdminUserID(ctx, userID)
		if staff {
			ctx = appMiddleware.WithImpersonatingStaffID(ctx, 99)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req.WithContext(ctx))
		return w
	}
	want := func(t *testing.T, w *httptest.ResponseRecorder, code int) {
		t.Helper()
		if w.Code != code {
			t.Fatalf("expected %d, got %d: %s", code, w.Code, w.Body.String())
		}
	}

	t.Run("1. admin biasa tidak bisa menambah anggota -> 403 pic_required", func(t *testing.T) {
		w := call(http.MethodPost, "/api/dashboard/team", map[string]string{"name": "Baru", "email": "baru@t1.test", "password": "passwordBaru123"}, 1, adm.ID, false)
		want(t, w, http.StatusForbidden)
		if !bytes.Contains(w.Body.Bytes(), []byte("pic_required")) {
			t.Fatalf("missing code: %s", w.Body.String())
		}
	})

	t.Run("2. admin biasa tidak bisa menonaktifkan atau mengubah peran -> 403", func(t *testing.T) {
		want(t, call(http.MethodPatch, "/api/dashboard/team/3/toggle-status", map[string]string{"action": "deactivate"}, 1, adm.ID, false), http.StatusForbidden)
		want(t, call(http.MethodPatch, "/api/dashboard/team/3/role", map[string]string{"role": "pic"}, 1, adm.ID, false), http.StatusForbidden)
	})

	t.Run("3. admin biasa tetap bisa melihat daftar tim, lengkap dengan peran", func(t *testing.T) {
		w := call(http.MethodGet, "/api/dashboard/team", nil, 1, adm.ID, false)
		want(t, w, http.StatusOK)
		var list []service.TeamMemberResponse
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil || len(list) != 3 {
			t.Fatalf("list: %v %s", err, w.Body.String())
		}
		for _, m := range list {
			if m.Role == "" {
				t.Fatalf("member %d has no role", m.ID)
			}
		}
	})

	t.Run("4. PIC menambah anggota dengan peran; default admin; peran asing ditolak", func(t *testing.T) {
		w := call(http.MethodPost, "/api/dashboard/team", map[string]string{"name": "Anggota", "email": "a1@t1.test", "password": "passwordBaru123"}, 1, pic.ID, false)
		want(t, w, http.StatusCreated)
		var m service.TeamMemberResponse
		_ = json.Unmarshal(w.Body.Bytes(), &m)
		if m.Role != repository.RoleAdmin {
			t.Fatalf("default role = %q, want admin", m.Role)
		}
		w = call(http.MethodPost, "/api/dashboard/team", map[string]string{"name": "Kedua", "email": "a2@t1.test", "password": "passwordBaru123", "role": "pic"}, 1, pic.ID, false)
		want(t, w, http.StatusCreated)
		w = call(http.MethodPost, "/api/dashboard/team", map[string]string{"name": "Aneh", "email": "a3@t1.test", "password": "passwordBaru123", "role": "owner"}, 1, pic.ID, false)
		want(t, w, http.StatusBadRequest)
	})

	t.Run("5. PIC lintas tenant tidak bisa mengubah peran anggota tenant lain -> 404, data tidak berubah", func(t *testing.T) {
		w := call(http.MethodPatch, "/api/dashboard/team/"+itoa(admT2.ID)+"/role", map[string]string{"role": "pic"}, 1, pic.ID, false)
		want(t, w, http.StatusNotFound)
		got, _ := repo.GetByID(context.Background(), 2, admT2.ID)
		if got.Role != repository.RoleAdmin {
			t.Fatalf("tenant 2 member role changed to %q", got.Role)
		}
		w = call(http.MethodPatch, "/api/dashboard/team/"+itoa(picT2.ID)+"/toggle-status", map[string]string{"action": "deactivate"}, 1, pic.ID, false)
		want(t, w, http.StatusNotFound)
	})

	t.Run("6. PIC mengangkat dan menurunkan peran; PIC aktif terakhir tidak bisa diturunkan atau dinonaktifkan", func(t *testing.T) {
		// Promote "other": now pic, a2 and other are PICs.
		want(t, call(http.MethodPatch, "/api/dashboard/team/"+itoa(other.ID)+"/role", map[string]string{"role": "pic"}, 1, pic.ID, false), http.StatusOK)
		// Take the PIC role away from everyone but one: all demotions succeed until one active PIC is left.
		list, _ := repo.ListByTenant(context.Background(), 1)
		var pics []uint64
		for _, u := range list {
			if u.Role == repository.RolePIC {
				pics = append(pics, u.ID)
			}
		}
		for _, id := range pics[1:] {
			want(t, call(http.MethodPatch, "/api/dashboard/team/"+itoa(id)+"/role", map[string]string{"role": "admin"}, 1, pics[0], false), http.StatusOK)
		}
		last := pics[0]
		want(t, call(http.MethodPatch, "/api/dashboard/team/"+itoa(last)+"/role", map[string]string{"role": "admin"}, 1, last, false), http.StatusBadRequest)
		want(t, call(http.MethodPatch, "/api/dashboard/team/"+itoa(last)+"/toggle-status", map[string]string{"action": "deactivate"}, 1, last, false), http.StatusBadRequest)
		got, _ := repo.GetByID(context.Background(), 1, last)
		if got.Role != repository.RolePIC || got.Status != "active" {
			t.Fatalf("last PIC changed: %+v", got)
		}
	})

	t.Run("7. sesi impersonasi staf lolos guard PIC (diaudit di access_logs)", func(t *testing.T) {
		// adm is a plain admin, but the staff impersonation session is allowed through.
		w := call(http.MethodPatch, "/api/dashboard/team/"+itoa(adm.ID)+"/role", map[string]string{"role": "admin"}, 1, adm.ID, true)
		want(t, w, http.StatusOK)
	})

	t.Run("8. anggota nonaktif ditolak guard walau perannya PIC", func(t *testing.T) {
		u := mk(3, "off@t3.test", repository.RolePIC, "inactive")
		w := call(http.MethodPost, "/api/dashboard/team", map[string]string{"name": "x", "email": "x@t3.test", "password": "passwordBaru123"}, 3, u.ID, false)
		want(t, w, http.StatusUnauthorized)
	})
}

func itoa(n uint64) string { return string(appendUint(nil, n)) }

func appendUint(b []byte, n uint64) []byte {
	if n >= 10 {
		b = appendUint(b, n/10)
	}
	return append(b, byte('0'+n%10))
}
