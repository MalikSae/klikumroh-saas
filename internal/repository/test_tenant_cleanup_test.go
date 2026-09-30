package repository_test

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"

	"klikumroh/internal/repository"
)

// openCleanupDB opens a dedicated connection for test cleanup. Tests often `defer db.Close()`, and defers
// run before t.Cleanup, so the cleanup cannot rely on the test's own connection still being open.
func openCleanupDB() (*sql.DB, error) {
	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "3306"
	}
	dsn := repository.MySQLDSN(os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_HOST"), port, os.Getenv("DB_NAME"))
	return sql.Open("mysql", dsn)
}

// purgeTestTenant deletes a test tenant and every row it owns, children first so no foreign key blocks
// the delete. It is idempotent: tests that already cleaned up their own data are unaffected.
func purgeTestTenant(db *sql.DB, tenantID uint64) error {
	stmts := []string{
		// Tables without tenant_id, reached through tenant-owned parents.
		"DELETE FROM event_rsvps WHERE event_id IN (SELECT id FROM agent_events WHERE tenant_id = ?)",
		"DELETE FROM event_rsvps WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = ?)",
		"DELETE FROM agent_sessions WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = ?)",
		// Prospect data.
		"DELETE FROM referral_clicks WHERE tenant_id = ?",
		"DELETE FROM commission_ledger WHERE tenant_id = ?",
		"DELETE FROM prospect_notes WHERE tenant_id = ?",
		"DELETE FROM prospect_status_history WHERE tenant_id = ?",
		"DELETE FROM notifications WHERE tenant_id = ?",
		"DELETE FROM prospects WHERE tenant_id = ?",
		// Packages.
		"DELETE FROM package_photos WHERE tenant_id = ?",
		"DELETE FROM packages WHERE tenant_id = ?",
		// Agents.
		"DELETE FROM agent_target_achievements WHERE tenant_id = ?",
		"DELETE FROM agent_targets WHERE tenant_id = ?",
		"DELETE FROM commission_payout_requests WHERE tenant_id = ?",
		"UPDATE agents SET parent_agent_id = NULL WHERE tenant_id = ?",
		"DELETE FROM agents WHERE tenant_id = ?",
		"DELETE FROM agent_events WHERE tenant_id = ?",
		"DELETE FROM promo_tips WHERE tenant_id = ?",
		// Admin access and tenant settings.
		"DELETE FROM sessions WHERE tenant_id = ?",
		"DELETE FROM access_logs WHERE tenant_id = ?",
		"DELETE FROM admin_users WHERE tenant_id = ?",
		"DELETE FROM domains WHERE tenant_id = ?",
		"DELETE FROM coupon_redemptions WHERE tenant_id = ?",
		"DELETE FROM payment_verifications WHERE tenant_id = ?",
		"DELETE FROM tenant_banners WHERE tenant_id = ?",
		"DELETE FROM tenant_faqs WHERE tenant_id = ?",
		"DELETE FROM tenant_testimonials WHERE tenant_id = ?",
		"DELETE FROM tenants WHERE id = ?",
	}
	for _, s := range stmts {
		if _, err := db.Exec(s, tenantID); err != nil {
			return fmt.Errorf("%s: %w", s, err)
		}
	}
	return nil
}
