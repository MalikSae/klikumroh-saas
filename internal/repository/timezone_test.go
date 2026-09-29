package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Regresi temuan audit #3: timestamp yang ditulis Go dan default CURRENT_TIMESTAMP harus menyatakan
// instant yang sama, dan dibaca kembali dengan zona WIB (bukan jam WIB berlabel UTC).
func TestTimezone_GoWrittenAndDBDefaultTimestampsAgree(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)
	sessionRepo := repository.NewSessionRepository(db)

	tenant := createDummyTenant(t, ctx, tenantRepo, "tz")
	admin := &repository.AdminUser{
		Name:         "Admin TZ",
		Email:        fmt.Sprintf("admin-tz-%d@klikumroh.test", time.Now().UnixNano()),
		PasswordHash: "[REDACTED-bcrypt-not-needed]",
		Status:       "active",
	}
	if err := adminUserRepo.Create(ctx, tenant.ID, admin); err != nil {
		t.Fatalf("create admin: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM sessions WHERE tenant_id = ?", tenant.ID)
		_ = adminUserRepo.Delete(ctx, tenant.ID, admin.ID)
		_ = tenantRepo.Delete(ctx, tenant.ID)
	})

	expires := time.Now().Add(time.Hour)
	session := &repository.Session{
		Token:       fmt.Sprintf("tz-token-%d", time.Now().UnixNano()),
		AdminUserID: admin.ID,
		ExpiresAt:   expires,
	}
	if err := sessionRepo.Create(ctx, tenant.ID, session); err != nil {
		t.Fatalf("create session: %v", err)
	}

	t.Run("Go-written expires_at is ~60 minutes after DB NOW()", func(t *testing.T) {
		var minutes int
		if err := db.QueryRow("SELECT TIMESTAMPDIFF(MINUTE, NOW(), expires_at) FROM sessions WHERE id = ?", session.ID).Scan(&minutes); err != nil {
			t.Fatalf("query: %v", err)
		}
		if minutes < 58 || minutes > 60 {
			t.Fatalf("expected expires_at ~60 min after NOW(), got %d min (timezone mismatch between Go and MySQL)", minutes)
		}
	})

	t.Run("DB-default created_at reads back as the real instant", func(t *testing.T) {
		got, err := sessionRepo.FindByToken(ctx, session.Token)
		if err != nil {
			t.Fatalf("FindByToken: %v", err)
		}
		if drift := time.Since(got.CreatedAt); drift < -2*time.Minute || drift > 2*time.Minute {
			t.Fatalf("created_at drift %v from time.Now() (expected < 2m; 7h means WIB wall clock labeled UTC)", drift)
		}
		if drift := got.ExpiresAt.Sub(expires); drift < -time.Second || drift > time.Second {
			t.Fatalf("expires_at round-trip drift %v", drift)
		}
		if _, offset := got.CreatedAt.Zone(); offset != 7*3600 {
			t.Fatalf("expected timestamps read in WIB (+07:00), got offset %ds", offset)
		}
	})
}
