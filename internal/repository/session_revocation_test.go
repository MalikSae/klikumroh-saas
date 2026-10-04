package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Travel-admin sessions against the real database: a session stops working as soon as its admin is
// deactivated or its password changes or is reset, and an impersonation session stops working as soon
// as the staff user is deactivated. All rows are removed when the test ends.
func TestSessionRevocation(t *testing.T) {
	db := setupTestDB(t)
	// Registered first so it runs last: t.Cleanup is LIFO and the data cleanup below needs an open connection.
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	staffRepo := repository.NewStaffRepository(db)
	teamSvc := service.NewTeamService(adminUserRepo, sessionRepo)

	tenant := createDummyTenant(t, ctx, tenantRepo, "sess-revoke")
	otherTenant := createDummyTenant(t, ctx, tenantRepo, "sess-revoke-other")

	newAdmin := func(tenantID uint64, label string) *repository.AdminUser {
		t.Helper()
		// bcrypt hash of a throwaway test password, never a real one.
		hash, err := bcrypt.GenerateFromPassword([]byte("rahasia-test-123"), bcrypt.MinCost)
		if err != nil {
			t.Fatalf("hash: %v", err)
		}
		u := &repository.AdminUser{
			Name:         "Admin " + label,
			Email:        fmt.Sprintf("sess-%s-%d@klikumroh.test", label, time.Now().UnixNano()),
			PasswordHash: string(hash),
			Status:       "active",
		}
		if err := adminUserRepo.Create(ctx, tenantID, u); err != nil {
			t.Fatalf("create admin %s: %v", label, err)
		}
		return u
	}
	newSession := func(tenantID, adminID uint64, staffID *uint64) string {
		t.Helper()
		token := fmt.Sprintf("sess-revoke-%d", time.Now().UnixNano())
		s := &repository.Session{Token: token, AdminUserID: adminID, ExpiresAt: time.Now().Add(time.Hour)}
		if staffID != nil {
			reason := "Membantu investigasi pencabutan sesi"
			s.ImpersonatedByStaffID = staffID
			s.ImpersonationReason = &reason
		}
		if err := sessionRepo.Create(ctx, tenantID, s); err != nil {
			t.Fatalf("create session: %v", err)
		}
		return token
	}
	mustFind := func(token string) {
		t.Helper()
		if _, err := sessionRepo.FindByToken(ctx, token); err != nil {
			t.Fatalf("expected session to be valid, got %v", err)
		}
	}
	mustReject := func(token string) {
		t.Helper()
		if _, err := sessionRepo.FindByToken(ctx, token); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("expected session to be rejected (ErrNotFound), got %v", err)
		}
	}

	adminA := newAdmin(tenant.ID, "a")
	adminB := newAdmin(tenant.ID, "b")
	adminOther := newAdmin(otherTenant.ID, "other")

	t.Run("deactivating an admin ends their sessions immediately", func(t *testing.T) {
		tokB := newSession(tenant.ID, adminB.ID, nil)
		tokA := newSession(tenant.ID, adminA.ID, nil)
		mustFind(tokB)

		if _, err := teamSvc.ToggleStatus(ctx, tenant.ID, adminA.ID, adminB.ID, "deactivate"); err != nil {
			t.Fatalf("deactivate: %v", err)
		}
		mustReject(tokB)
		mustFind(tokA) // other admins are untouched

		// Reactivating does not bring the old token back: it was deleted, not just hidden.
		if _, err := teamSvc.ToggleStatus(ctx, tenant.ID, adminA.ID, adminB.ID, "activate"); err != nil {
			t.Fatalf("activate: %v", err)
		}
		mustReject(tokB)
	})

	t.Run("an inactive admin's session is rejected even if a row remains", func(t *testing.T) {
		tok := newSession(tenant.ID, adminB.ID, nil)
		if _, err := db.ExecContext(ctx, "UPDATE admin_users SET status = 'inactive' WHERE id = ? AND tenant_id = ?", adminB.ID, tenant.ID); err != nil {
			t.Fatalf("set inactive: %v", err)
		}
		mustReject(tok)
		if _, err := db.ExecContext(ctx, "UPDATE admin_users SET status = 'active' WHERE id = ? AND tenant_id = ?", adminB.ID, tenant.ID); err != nil {
			t.Fatalf("set active: %v", err)
		}
	})

	t.Run("changing your own password keeps the current session and ends the others", func(t *testing.T) {
		current := newSession(tenant.ID, adminA.ID, nil)
		stolen := newSession(tenant.ID, adminA.ID, nil)

		if err := teamSvc.UpdateMyPassword(ctx, tenant.ID, adminA.ID, "rahasia-test-123", "rahasia-baru-456", current); err != nil {
			t.Fatalf("UpdateMyPassword: %v", err)
		}
		mustFind(current)
		mustReject(stolen)
	})

	t.Run("revocation never touches another tenant", func(t *testing.T) {
		tokOther := newSession(otherTenant.ID, adminOther.ID, nil)
		// Same admin ID, wrong tenant: must not delete anything.
		if err := sessionRepo.DeleteByAdminUser(ctx, tenant.ID, adminOther.ID, ""); err != nil {
			t.Fatalf("DeleteByAdminUser: %v", err)
		}
		mustFind(tokOther)
	})

	t.Run("an impersonation session ends when the staff user is deactivated", func(t *testing.T) {
		staff := &repository.StaffUser{
			Name:         "Staff sesi test",
			Email:        fmt.Sprintf("staff-sess-%d@klikumroh.test", time.Now().UnixNano()),
			PasswordHash: "[REDACTED-bcrypt-not-needed]",
			Status:       "active",
		}
		if err := staffRepo.Create(ctx, staff); err != nil {
			t.Fatalf("create staff: %v", err)
		}
		// Runs before the tenant purge (LIFO), which deletes the session that references this staff user,
		// so delete the sessions first here.
		t.Cleanup(func() {
			_, _ = db.Exec("DELETE FROM access_logs WHERE staff_id = ?", staff.ID)
			_, _ = db.Exec("DELETE FROM sessions WHERE impersonated_by_staff_id = ?", staff.ID)
			_, _ = db.Exec("DELETE FROM staff_users WHERE id = ?", staff.ID)
		})

		staffID := staff.ID
		tok := newSession(tenant.ID, adminA.ID, &staffID)
		mustFind(tok)

		if _, err := db.ExecContext(ctx, "UPDATE staff_users SET status = 'inactive' WHERE id = ?", staff.ID); err != nil {
			t.Fatalf("deactivate staff: %v", err)
		}
		mustReject(tok)
	})
}
