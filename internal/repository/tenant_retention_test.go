package repository_test

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// onlyTenants limits the job to the test travels: the database may hold real (local development) travels
// that are past due too, and a test must never warn or purge those.
type onlyTenants struct {
	repository.TenantPurgeRepository
	ids map[uint64]bool
}

func (o onlyTenants) ListExpiredBefore(ctx context.Context, cutoff time.Time) ([]repository.PurgeCandidate, error) {
	all, err := o.TenantPurgeRepository.ListExpiredBefore(ctx, cutoff)
	if err != nil {
		return nil, err
	}
	var out []repository.PurgeCandidate
	for _, c := range all {
		if o.ids[c.TenantID] {
			out = append(out, c)
		}
	}
	return out, nil
}

// TestTenantRetention covers the data retention job (founder decision 10 Oct 2026): warnings 14 and 3
// days ahead, the purge of operational data after grace + 90 days, and that nothing else is touched.
// Every row it creates belongs to a test tenant that createDummyTenant removes when the test ends.
func TestTenantRetention(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	pkgRepo := repository.NewPackageRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	notifRepo := repository.NewNotificationRepository(db)
	basePurgeRepo := repository.NewTenantPurgeRepository(db)
	testTenants := map[uint64]bool{}
	purgeRepo := repository.TenantPurgeRepository(onlyTenants{TenantPurgeRepository: basePurgeRepo, ids: testTenants})

	var planID uint64
	if err := db.QueryRow(`SELECT id FROM pricing_plans ORDER BY id LIMIT 1`).Scan(&planID); err != nil {
		t.Skip("no pricing plan in the database: cannot create invoices")
	}

	now := time.Now()
	daysAgo := func(d int) time.Time { return now.AddDate(0, 0, -d) }
	stamp := now.UnixNano()

	type travel struct {
		tenant  *repository.Tenant
		picID   uint64
		pending bool
	}
	seq := 0
	// expiredDays: how long ago the subscription ended; pendingInvoice: a renewal waiting for review.
	mk := func(label string, expiredDays int, pendingInvoice bool) *travel {
		seq++
		tn := createDummyTenant(t, ctx, tenantRepo, "ret-"+label)
		if _, err := db.Exec(`UPDATE tenants SET status = 'active', subscription_expires_at = ? WHERE id = ?`, daysAgo(expiredDays), tn.ID); err != nil {
			t.Fatal(err)
		}
		pic := &repository.AdminUser{Email: fmt.Sprintf("ret-%s-%d@test.local", label, stamp), Name: "PIC " + label, PasswordHash: "x", Role: repository.RolePIC}
		if err := adminRepo.Create(ctx, tn.ID, pic); err != nil {
			t.Fatal(err)
		}
		phone := fmt.Sprintf("0815%07d%d", stamp%10000000, seq)
		agent := &repository.Agent{Name: "Agen " + label, Phone: &phone, Status: "active", ReferralCode: fmt.Sprintf("RT%s%d", label, stamp%100000)}
		if err := agentRepo.Create(ctx, tn.ID, agent); err != nil {
			t.Fatal(err)
		}
		pkg := &repository.Package{Name: "Paket " + label, Status: "published"}
		if err := pkgRepo.Create(ctx, tn.ID, pkg); err != nil {
			t.Fatal(err)
		}
		jumlah := 1
		p := &repository.Prospect{AgentID: &agent.ID, PackageID: &pkg.ID, Name: "Jamaah " + label, Phone: phone, JumlahJamaah: &jumlah, SourceChannel: "agen", Status: "baru"}
		if err := prospectRepo.Create(ctx, tn.ID, p); err != nil {
			t.Fatal(err)
		}
		// One approved invoice (bookkeeping, must survive) and, when asked, one waiting for review.
		inv := &repository.PaymentVerification{TenantID: tn.ID, PlanID: planID, Amount: 1000000, FinalAmount: 1000000, Status: "approved"}
		if err := pvRepo.Create(ctx, inv); err != nil {
			t.Fatalf("create invoice: %v", err)
		}
		if pendingInvoice {
			open := &repository.PaymentVerification{TenantID: tn.ID, PlanID: planID, Amount: 1000000, FinalAmount: 1000000, Status: "pending"}
			if err := pvRepo.Create(ctx, open); err != nil {
				t.Fatalf("create pending invoice: %v", err)
			}
		}
		testTenants[tn.ID] = true
		return &travel{tenant: tn, picID: pic.ID, pending: pendingInvoice}
	}

	pastDue := mk("due", 120, false)      // past grace + 90 days: warned first, then purged
	renewing := mk("renew", 120, true)    // past due but a renewal waits for review: kept
	recent := mk("recent", 30, false)     // only 30 days expired: untouched
	soon := mk("soon", 90, false)         // due in 7 days: 14-day warning only
	imminent := mk("imminent", 95, false) // due in 2 days: 3-day warning
	count := func(table string, tenantID uint64) int {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE tenant_id = ?`, tenantID).Scan(&n); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		return n
	}
	warned := func(tenantID uint64, col string) bool {
		var at sql.NullTime
		if err := db.QueryRow(`SELECT `+col+` FROM tenants WHERE id = ?`, tenantID).Scan(&at); err != nil {
			t.Fatal(err)
		}
		return at.Valid
	}
	run := func() service.RetentionSummary {
		sum, err := service.RunTenantRetention(ctx, purgeRepo, adminRepo, notifRepo, "", time.Now())
		if err != nil {
			t.Fatalf("run retention: %v", err)
		}
		return sum
	}

	t.Run("1. first run warns, purges nobody yet", func(t *testing.T) {
		sum := run()
		if sum.Purged != 0 {
			t.Fatalf("purged %d on the first run, want 0 (a warning must come first)", sum.Purged)
		}
		if !warned(pastDue.tenant.ID, "purge_warned_3_at") {
			t.Fatal("past-due travel got no 3-day warning")
		}
		if count("prospects", pastDue.tenant.ID) != 1 || count("agents", pastDue.tenant.ID) != 1 {
			t.Fatal("data removed before the warning had a day")
		}
		if n := count("notifications", pastDue.tenant.ID); n != 1 {
			t.Fatalf("notifications for PIC = %d, want 1", n)
		}
		if !warned(soon.tenant.ID, "purge_warned_14_at") || warned(soon.tenant.ID, "purge_warned_3_at") {
			t.Fatal("travel due in 7 days must get only the 14-day warning")
		}
		if !warned(imminent.tenant.ID, "purge_warned_3_at") {
			t.Fatal("travel due in 2 days must get the 3-day warning")
		}
		if warned(recent.tenant.ID, "purge_warned_14_at") || count("notifications", recent.tenant.ID) != 0 {
			t.Fatal("recently expired travel must not be warned")
		}
	})

	t.Run("2. second run purges the warned travel and nothing else", func(t *testing.T) {
		sum := run()
		if sum.Purged != 1 {
			t.Fatalf("purged %d, want 1", sum.Purged)
		}
		id := pastDue.tenant.ID
		for _, table := range []string{"prospects", "agents", "packages", "admin_users", "notifications"} {
			if n := count(table, id); n != 0 {
				t.Fatalf("%s still has %d row(s) after the purge", table, n)
			}
		}
		if n := count("payment_verifications", id); n != 1 {
			t.Fatalf("invoices = %d, want 1 kept", n)
		}
		var status string
		var purgedAt sql.NullTime
		if err := db.QueryRow(`SELECT status, data_purged_at FROM tenants WHERE id = ?`, id).Scan(&status, &purgedAt); err != nil {
			t.Fatal(err)
		}
		if status != "inactive" || !purgedAt.Valid {
			t.Fatalf("tenant row after purge: status=%q purged_at valid=%v", status, purgedAt.Valid)
		}
	})

	t.Run("3. other travels are untouched (renewal pending, recent, not yet due)", func(t *testing.T) {
		for name, tr := range map[string]*travel{"renewing": renewing, "recent": recent, "soon": soon, "imminent": imminent} {
			id := tr.tenant.ID
			if count("prospects", id) != 1 || count("agents", id) != 1 || count("packages", id) != 1 || count("admin_users", id) != 1 {
				t.Fatalf("%s lost data", name)
			}
		}
	})

	t.Run("4. a third run changes nothing", func(t *testing.T) {
		if sum := run(); sum.Purged != 0 {
			t.Fatalf("purged %d on a repeat run, want 0", sum.Purged)
		}
	})

	t.Run("5. a renewal after the warning cancels the purge", func(t *testing.T) {
		id := soon.tenant.ID
		if _, err := db.Exec(`UPDATE tenants SET subscription_expires_at = ? WHERE id = ?`, now.AddDate(0, 6, 0), id); err != nil {
			t.Fatal(err)
		}
		candidates, err := purgeRepo.ListExpiredBefore(ctx, now)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range candidates {
			if c.TenantID == id {
				t.Fatal("renewed travel is still a purge candidate")
			}
		}
	})
}
