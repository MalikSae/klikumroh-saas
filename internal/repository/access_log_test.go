package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

func TestCrossTenant_AccessLog(t *testing.T) {
	db := setupTestDB(t)
	// Registered first so it runs last: t.Cleanup is LIFO and the data cleanup below needs an open connection.
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	staffRepo := repository.NewStaffRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)
	accessLogRepo := repository.NewAccessLogRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-alog")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-alog")

	staff := &repository.StaffUser{
		Name:         "Staff Audit Test",
		Email:        fmt.Sprintf("staff-alog-%d@klikumroh.test", time.Now().UnixNano()),
		PasswordHash: "[REDACTED-bcrypt-not-needed]",
		Status:       "active",
	}
	if err := staffRepo.Create(ctx, staff); err != nil {
		t.Fatalf("Failed to create staff user: %v", err)
	}

	adminA := &repository.AdminUser{
		Name:         "Admin A alog",
		Email:        fmt.Sprintf("admin-a-alog-%d@klikumroh.test", time.Now().UnixNano()),
		PasswordHash: "[REDACTED-bcrypt-not-needed]",
		Status:       "active",
	}
	if err := adminUserRepo.Create(ctx, tenantA.ID, adminA); err != nil {
		t.Fatalf("Failed to create admin for tenant A: %v", err)
	}

	// Cleanup order matters: access_logs and sessions reference tenants, staff_users, and admin_users.
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM access_logs WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
		_, _ = db.Exec("DELETE FROM sessions WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
		_ = adminUserRepo.Delete(ctx, tenantA.ID, adminA.ID)
		_, _ = db.Exec("DELETE FROM staff_users WHERE id = ?", staff.ID)
		_ = tenantRepo.Delete(ctx, tenantA.ID)
		_ = tenantRepo.Delete(ctx, tenantB.ID)
	})

	staffID := staff.ID
	reason := "Membantu investigasi laporan prospek ganda"
	session := &repository.Session{
		Token:                 fmt.Sprintf("alog-token-%d", time.Now().UnixNano()),
		AdminUserID:           adminA.ID,
		ExpiresAt:             time.Now().Add(time.Hour),
		ImpersonatedByStaffID: &staffID,
		ImpersonationReason:   &reason,
	}
	if err := sessionRepo.Create(ctx, tenantA.ID, session); err != nil {
		t.Fatalf("Failed to create impersonation session: %v", err)
	}

	t.Run("Impersonation fields round-trip through sessions", func(t *testing.T) {
		got, err := sessionRepo.FindByToken(ctx, session.Token)
		if err != nil {
			t.Fatalf("FindByToken failed: %v", err)
		}
		if got.ImpersonatedByStaffID == nil || *got.ImpersonatedByStaffID != staff.ID {
			t.Fatalf("expected impersonated_by_staff_id=%d, got %v", staff.ID, got.ImpersonatedByStaffID)
		}
		if got.ImpersonationReason == nil || *got.ImpersonationReason != reason {
			t.Fatalf("expected impersonation_reason %q, got %v", reason, got.ImpersonationReason)
		}
	})

	method := "GET"
	path := "/api/dashboard/prospects"
	sessionID := session.ID
	logA := &repository.AccessLog{
		StaffID:    staff.ID,
		Action:     repository.AccessActionImpersonateRequest,
		HTTPMethod: &method,
		Path:       &path,
		SessionID:  &sessionID,
		Reason:     &reason,
	}
	if err := accessLogRepo.Create(ctx, tenantA.ID, logA); err != nil {
		t.Fatalf("Failed to create access log for tenant A: %v", err)
	}

	t.Run("Positive assertion: Tenant A lists its own access log with staff name", func(t *testing.T) {
		logs, err := accessLogRepo.ListByTenant(ctx, tenantA.ID, 50)
		if err != nil {
			t.Fatalf("ListByTenant A failed: %v", err)
		}
		if len(logs) != 1 {
			t.Fatalf("expected exactly 1 log for tenant A, got %d", len(logs))
		}
		l := logs[0]
		if l.ID != logA.ID || l.TenantID != tenantA.ID || l.StaffName != staff.Name || l.Action != repository.AccessActionImpersonateRequest {
			t.Fatalf("unexpected log row: %+v", l)
		}
		if l.Path == nil || *l.Path != path || l.SessionID == nil || *l.SessionID != session.ID {
			t.Fatalf("path/session not stored correctly: %+v", l)
		}
	})

	t.Run("Negative assertion: Tenant B cannot list Tenant A access logs", func(t *testing.T) {
		logs, err := accessLogRepo.ListByTenant(ctx, tenantB.ID, 50)
		if err != nil {
			t.Fatalf("ListByTenant B failed: %v", err)
		}
		if len(logs) != 0 {
			t.Fatalf("CROSS-TENANT LEAK: tenant B sees %d access logs of tenant A", len(logs))
		}
	})

	t.Run("ExistsRecentRequest is tenant-scoped and window-bound", func(t *testing.T) {
		exists, err := accessLogRepo.ExistsRecentRequest(ctx, tenantA.ID, session.ID, method, path, 5*time.Minute)
		if err != nil || !exists {
			t.Fatalf("expected recent request found for tenant A, exists=%v err=%v", exists, err)
		}
		exists, err = accessLogRepo.ExistsRecentRequest(ctx, tenantB.ID, session.ID, method, path, 5*time.Minute)
		if err != nil || exists {
			t.Fatalf("CROSS-TENANT LEAK: tenant B matched tenant A request, exists=%v err=%v", exists, err)
		}
		exists, err = accessLogRepo.ExistsRecentRequest(ctx, tenantA.ID, session.ID, "POST", path, 5*time.Minute)
		if err != nil || exists {
			t.Fatalf("expected no match for different method, exists=%v err=%v", exists, err)
		}
	})

	t.Run("Access log rejects unknown staff (FK)", func(t *testing.T) {
		err := accessLogRepo.Create(ctx, tenantA.ID, &repository.AccessLog{
			StaffID: 999999999,
			Action:  repository.AccessActionViewTenantDetail,
		})
		if err == nil {
			t.Fatalf("expected FK error for non-existent staff_id")
		}
	})
}
