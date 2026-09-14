package repository_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"

	"klikumroh/internal/repository"
)

var tenantSeq uint64

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()

	// Load .env from workspace root
	envPath := filepath.Join("..", "..", ".env")
	_ = godotenv.Load(envPath)

	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	if dbPort == "" {
		dbPort = "3306"
	}
	if dbHost == "" || dbUser == "" || dbName == "" {
		t.Skip("Skipping test: Database configuration not found in .env")
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		dbUser, dbPassword, dbHost, dbPort, dbName,
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		t.Fatalf("Failed to open db: %v", err)
	}

	if err := db.Ping(); err != nil {
		t.Fatalf("Failed to ping db: %v", err)
	}

	return db
}

func createDummyTenant(t *testing.T, ctx context.Context, repo repository.TenantRepository, suffix string) *repository.Tenant {
	t.Helper()
	seq := atomic.AddUint64(&tenantSeq, 1)
	r := rand.Intn(100000)
	timestamp := time.Now().UnixNano()

	tenant := &repository.Tenant{
		Name: fmt.Sprintf("Tenant %s %d-%d", suffix, timestamp, seq),
		Slug: fmt.Sprintf("tenant-%s-%d-%d-%d", suffix, timestamp, seq, r),
	}
	if err := repo.Create(ctx, tenant); err != nil {
		t.Fatalf("Failed to create dummy tenant %s: %v", suffix, err)
	}
	return tenant
}

func TestCrossTenant_Domain(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	domainRepo := repository.NewDomainRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-dom")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-dom")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	domainA := &repository.Domain{
		Hostname: fmt.Sprintf("sub-%d-%d.klikumroh.test", time.Now().UnixNano(), rand.Intn(10000)),
		Type:     "subdomain",
		Status:   "active",
	}
	if err := domainRepo.Create(ctx, tenantA.ID, domainA); err != nil {
		t.Fatalf("Failed to create domain for Tenant A: %v", err)
	}
	defer domainRepo.Delete(ctx, tenantA.ID, domainA.ID)

	// 1. POSITIVE ASSERTIONS: Tenant A MUST be able to read and list its own domain
	t.Run("Positive assertion: Tenant A can access its own domain", func(t *testing.T) {
		got, err := domainRepo.GetByID(ctx, tenantA.ID, domainA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get its own domain: %v", err)
		}
		if got == nil || got.ID != domainA.ID || got.Hostname != domainA.Hostname || got.TenantID != tenantA.ID {
			t.Fatalf("Tenant A received unexpected domain data: %+v, expected ID=%d, Hostname=%s", got, domainA.ID, domainA.Hostname)
		}

		list, err := domainRepo.ListByTenant(ctx, tenantA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to list domains: %v", err)
		}
		found := false
		for _, d := range list {
			if d.ID == domainA.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("Tenant A's list does not contain its created domain %d", domainA.ID)
		}

		// Verify special exception FindByHostname returns domain with correct tenant_id
		byHost, err := domainRepo.FindByHostname(ctx, domainA.Hostname)
		if err != nil {
			t.Fatalf("FindByHostname failed: %v", err)
		}
		if byHost.ID != domainA.ID || byHost.TenantID != tenantA.ID {
			t.Fatalf("FindByHostname returned mismatched domain: %+v, expected ID=%d, TenantID=%d", byHost, domainA.ID, tenantA.ID)
		}
	})

	// 2. NEGATIVE ASSERTIONS: Tenant B MUST NOT be able to access, modify, delete, or list Tenant A's domain
	t.Run("GetByID cross-tenant isolation", func(t *testing.T) {
		got, err := domainRepo.GetByID(ctx, tenantB.ID, domainA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B accesses Tenant A's domain, got err=%v, data=%+v", err, got)
		}
		if got != nil {
			t.Errorf("Expected nil data when cross-tenant access occurs, got %+v", got)
		}
	})

	t.Run("Update cross-tenant isolation", func(t *testing.T) {
		tampered := &repository.Domain{
			ID:       domainA.ID,
			Hostname: "hijacked.example.com",
			Type:     "custom",
			Status:   "active",
		}
		err := domainRepo.Update(ctx, tenantB.ID, tampered)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A's domain, got err=%v", err)
		}
	})

	t.Run("Delete cross-tenant isolation", func(t *testing.T) {
		err := domainRepo.Delete(ctx, tenantB.ID, domainA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's domain, got err=%v", err)
		}
	})

	t.Run("ListByTenant cross-tenant isolation", func(t *testing.T) {
		list, err := domainRepo.ListByTenant(ctx, tenantB.ID)
		if err != nil {
			t.Fatalf("ListByTenant failed: %v", err)
		}
		for _, d := range list {
			if d.ID == domainA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's domain: %+v", d)
			}
		}
	})
}

func TestCrossTenant_Package(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	pkgRepo := repository.NewPackageRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-pkg")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-pkg")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	pkgA := &repository.Package{
		Name:   fmt.Sprintf("Paket Umroh Reguler %d", time.Now().UnixNano()),
		Status: "published",
	}
	if err := pkgRepo.Create(ctx, tenantA.ID, pkgA); err != nil {
		t.Fatalf("Failed to create package for Tenant A: %v", err)
	}
	defer pkgRepo.Delete(ctx, tenantA.ID, pkgA.ID)

	// 1. POSITIVE ASSERTIONS: Tenant A MUST be able to read and list its own package
	t.Run("Positive assertion: Tenant A can access its own package", func(t *testing.T) {
		got, err := pkgRepo.GetByID(ctx, tenantA.ID, pkgA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get its own package: %v", err)
		}
		if got == nil || got.ID != pkgA.ID || got.Name != pkgA.Name || got.TenantID != tenantA.ID {
			t.Fatalf("Tenant A received unexpected package data: %+v, expected ID=%d, Name=%s", got, pkgA.ID, pkgA.Name)
		}

		list, err := pkgRepo.List(ctx, tenantA.ID, nil)
		if err != nil {
			t.Fatalf("Tenant A failed to list packages: %v", err)
		}
		found := false
		for _, p := range list {
			if p.ID == pkgA.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("Tenant A's list does not contain its created package %d", pkgA.ID)
		}
	})

	// 2. NEGATIVE ASSERTIONS: Tenant B MUST NOT be able to access, modify, delete, or list Tenant A's package
	t.Run("GetByID cross-tenant isolation", func(t *testing.T) {
		got, err := pkgRepo.GetByID(ctx, tenantB.ID, pkgA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B accesses Tenant A's package, got err=%v, data=%+v", err, got)
		}
		if got != nil {
			t.Errorf("Expected nil data, got %+v", got)
		}
	})

	t.Run("Update cross-tenant isolation", func(t *testing.T) {
		tampered := &repository.Package{
			ID:     pkgA.ID,
			Name:   "Tampered Package Name",
			Status: "archived",
		}
		err := pkgRepo.Update(ctx, tenantB.ID, tampered)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A's package, got err=%v", err)
		}
	})

	t.Run("Delete cross-tenant isolation", func(t *testing.T) {
		err := pkgRepo.Delete(ctx, tenantB.ID, pkgA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's package, got err=%v", err)
		}
	})

	t.Run("List cross-tenant isolation", func(t *testing.T) {
		list, err := pkgRepo.List(ctx, tenantB.ID, nil)
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		for _, p := range list {
			if p.ID == pkgA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's package: %+v", p)
			}
		}
	})
}

func TestPackageRepository_Delete_ForeignKeyViolation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	pkgRepo := repository.NewPackageRepository(db)
	prospectRepo := repository.NewProspectRepository(db)

	// 1. Membuat 1 tenant dummy dan 1 package dummy
	tenant := createDummyTenant(t, ctx, tenantRepo, "FK-test")
	defer tenantRepo.Delete(ctx, tenant.ID)

	pkg := &repository.Package{
		Name:   "Paket Terikat Prospek (FK Test)",
		Status: "published",
	}
	if err := pkgRepo.Create(ctx, tenant.ID, pkg); err != nil {
		t.Fatalf("Failed to create package: %v", err)
	}

	// 2. Membuat 1 prospect dummy yang package_id-nya menunjuk ke package tersebut
	prospect := &repository.Prospect{
		TenantID:      tenant.ID,
		PackageID:     &pkg.ID,
		Name:          "Jamaah Terkait FK",
		Phone:         "08123456789",
		SourceChannel: "organik",
		Status:        "baru",
	}
	if err := prospectRepo.Create(ctx, tenant.ID, prospect); err != nil {
		t.Fatalf("Failed to create prospect: %v", err)
	}

	// 3. Memanggil PackageRepository.Delete secara langsung untuk package itu
	err := pkgRepo.Delete(ctx, tenant.ID, pkg.ID)

	// 4. Assert error yang dikembalikan adalah errors.Is(err, repository.ErrForeignKeyViolation) — BUKAN error generik
	if err == nil {
		t.Fatalf("Expected ErrForeignKeyViolation when deleting package with existing prospects, got nil")
	}
	if !errors.Is(err, repository.ErrForeignKeyViolation) {
		t.Errorf("Expected ErrForeignKeyViolation, got: %v", err)
	}

	// 5. Cleanup: hapus prospect dulu, baru package, baru tenant (urutan sesuai foreign key)
	if err := prospectRepo.Delete(ctx, tenant.ID, prospect.ID); err != nil {
		t.Errorf("Failed to cleanup prospect: %v", err)
	}
	if err := pkgRepo.Delete(ctx, tenant.ID, pkg.ID); err != nil {
		t.Errorf("Failed to cleanup package after prospect deleted: %v", err)
	}
}

func TestCrossTenant_Agent(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-ag")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-ag")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	agentA := &repository.Agent{
		Name:         "Agent A",
		ReferralCode: fmt.Sprintf("REF-%d-%d", time.Now().UnixNano(), rand.Intn(10000)),
		Status:       "active",
	}
	if err := agentRepo.Create(ctx, tenantA.ID, agentA); err != nil {
		t.Fatalf("Failed to create agent for Tenant A: %v", err)
	}
	defer agentRepo.Delete(ctx, tenantA.ID, agentA.ID)

	// 1. POSITIVE ASSERTIONS: Tenant A MUST be able to read and list its own agent
	t.Run("Positive assertion: Tenant A can access its own agent", func(t *testing.T) {
		got, err := agentRepo.GetByID(ctx, tenantA.ID, agentA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get its own agent: %v", err)
		}
		if got == nil || got.ID != agentA.ID || got.ReferralCode != agentA.ReferralCode || got.TenantID != tenantA.ID {
			t.Fatalf("Tenant A received unexpected agent data: %+v, expected ID=%d, ReferralCode=%s", got, agentA.ID, agentA.ReferralCode)
		}

		list, err := agentRepo.List(ctx, tenantA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to list agents: %v", err)
		}
		found := false
		for _, a := range list {
			if a.ID == agentA.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("Tenant A's list does not contain its created agent %d", agentA.ID)
		}

		byRef, err := agentRepo.GetByReferralCode(ctx, agentA.ReferralCode)
		if err != nil {
			t.Fatalf("GetByReferralCode failed: %v", err)
		}
		if byRef.ID != agentA.ID || byRef.TenantID != tenantA.ID {
			t.Fatalf("GetByReferralCode returned unexpected agent: %+v", byRef)
		}
	})

	// 2. NEGATIVE ASSERTIONS: Tenant B MUST NOT be able to access, modify, delete, or list Tenant A's agent
	t.Run("GetByID cross-tenant isolation", func(t *testing.T) {
		got, err := agentRepo.GetByID(ctx, tenantB.ID, agentA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B accesses Tenant A's agent, got err=%v, data=%+v", err, got)
		}
		if got != nil {
			t.Errorf("Expected nil data, got %+v", got)
		}
	})

	t.Run("Update cross-tenant isolation", func(t *testing.T) {
		tampered := &repository.Agent{
			ID:           agentA.ID,
			Name:         "Tampered Agent",
			ReferralCode: agentA.ReferralCode,
			Status:       "inactive",
		}
		err := agentRepo.Update(ctx, tenantB.ID, tampered)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A's agent, got err=%v", err)
		}
	})

	t.Run("Delete cross-tenant isolation", func(t *testing.T) {
		err := agentRepo.Delete(ctx, tenantB.ID, agentA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's agent, got err=%v", err)
		}
	})

	t.Run("List cross-tenant isolation", func(t *testing.T) {
		list, err := agentRepo.List(ctx, tenantB.ID)
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		for _, a := range list {
			if a.ID == agentA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's agent: %+v", a)
			}
		}
	})
}

func TestCrossTenant_Prospect(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	prospectRepo := repository.NewProspectRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-pros")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-pros")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	prospectA := &repository.Prospect{
		Name:          "Calon Jamaah A",
		Phone:         "081234567890",
		SourceChannel: "organik",
		Status:        "baru",
	}
	if err := prospectRepo.Create(ctx, tenantA.ID, prospectA); err != nil {
		t.Fatalf("Failed to create prospect for Tenant A: %v", err)
	}
	defer prospectRepo.Delete(ctx, tenantA.ID, prospectA.ID)

	// 1. POSITIVE ASSERTIONS: Tenant A MUST be able to read and list its own prospect
	t.Run("Positive assertion: Tenant A can access its own prospect", func(t *testing.T) {
		got, err := prospectRepo.GetByID(ctx, tenantA.ID, prospectA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get its own prospect: %v", err)
		}
		if got == nil || got.ID != prospectA.ID || got.Name != prospectA.Name || got.TenantID != tenantA.ID {
			t.Fatalf("Tenant A received unexpected prospect data: %+v, expected ID=%d, Name=%s", got, prospectA.ID, prospectA.Name)
		}

		list, err := prospectRepo.List(ctx, tenantA.ID, nil)
		if err != nil {
			t.Fatalf("Tenant A failed to list prospects: %v", err)
		}
		found := false
		for _, p := range list {
			if p.ID == prospectA.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("Tenant A's list does not contain its created prospect %d", prospectA.ID)
		}
	})

	// 2. NEGATIVE ASSERTIONS: Tenant B MUST NOT be able to access, modify, delete, or list Tenant A's prospect
	t.Run("GetByID cross-tenant isolation", func(t *testing.T) {
		got, err := prospectRepo.GetByID(ctx, tenantB.ID, prospectA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B accesses Tenant A's prospect, got err=%v, data=%+v", err, got)
		}
		if got != nil {
			t.Errorf("Expected nil data, got %+v", got)
		}
	})

	t.Run("UpdateStatus cross-tenant isolation", func(t *testing.T) {
		lostReason := "Batal berangkat"
		err := prospectRepo.UpdateStatus(ctx, tenantB.ID, prospectA.ID, "tidak_lanjut", &lostReason)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A's prospect status, got err=%v", err)
		}
	})

	t.Run("Delete cross-tenant isolation", func(t *testing.T) {
		err := prospectRepo.Delete(ctx, tenantB.ID, prospectA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's prospect, got err=%v", err)
		}
	})

	t.Run("List cross-tenant isolation", func(t *testing.T) {
		list, err := prospectRepo.List(ctx, tenantB.ID, nil)
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		for _, p := range list {
			if p.ID == prospectA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's prospect: %+v", p)
			}
		}
	})

	t.Run("ListWithFilter cross-tenant isolation", func(t *testing.T) {
		status := "baru"
		source := "organik"
		search := prospectA.Name
		list, err := prospectRepo.ListWithFilter(ctx, tenantB.ID, repository.ProspectFilter{
			Status: &status,
			Source: &source,
			Search: &search,
		})
		if err != nil {
			t.Fatalf("ListWithFilter failed: %v", err)
		}
		for _, p := range list {
			if p.ID == prospectA.ID {
				t.Errorf("Tenant B's ListWithFilter leaked Tenant A's prospect: %+v", p)
			}
		}
	})
}

func TestCrossTenant_AdminUser(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-adm")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-adm")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	emailA := fmt.Sprintf("admin-%d-%d@tenantA.com", time.Now().UnixNano(), rand.Intn(10000))
	adminA := &repository.AdminUser{
		Email:        emailA,
		PasswordHash: "$2a$10$dummyhashdummyhashdummyhashdummyh",
		Name:         "Admin Travel A",
		Status:       "active",
	}
	if err := adminUserRepo.Create(ctx, tenantA.ID, adminA); err != nil {
		t.Fatalf("Failed to create admin user for Tenant A: %v", err)
	}
	defer adminUserRepo.Delete(ctx, tenantA.ID, adminA.ID)

	// 1. POSITIVE ASSERTIONS: Tenant A MUST be able to read and list its own admin user
	t.Run("Positive assertion: Tenant A can access its own admin user", func(t *testing.T) {
		got, err := adminUserRepo.GetByID(ctx, tenantA.ID, adminA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get its own admin user: %v", err)
		}
		if got == nil || got.ID != adminA.ID || got.Email != adminA.Email || got.TenantID != tenantA.ID {
			t.Fatalf("Tenant A received unexpected admin user data: %+v, expected ID=%d, Email=%s", got, adminA.ID, adminA.Email)
		}

		list, err := adminUserRepo.ListByTenant(ctx, tenantA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to list admin users: %v", err)
		}
		found := false
		for _, u := range list {
			if u.ID == adminA.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("Tenant A's list does not contain its created admin user %d", adminA.ID)
		}

		byEmail, err := adminUserRepo.FindByEmail(ctx, adminA.Email)
		if err != nil {
			t.Fatalf("FindByEmail failed: %v", err)
		}
		if byEmail.ID != adminA.ID || byEmail.TenantID != tenantA.ID {
			t.Fatalf("FindByEmail returned unexpected user: %+v", byEmail)
		}
	})

	// 2. NEGATIVE ASSERTIONS: Tenant B MUST NOT be able to access, modify, delete, or list Tenant A's admin user
	t.Run("GetByID cross-tenant isolation", func(t *testing.T) {
		got, err := adminUserRepo.GetByID(ctx, tenantB.ID, adminA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B accesses Tenant A's admin user, got err=%v, data=%+v", err, got)
		}
		if got != nil {
			t.Errorf("Expected nil data, got %+v", got)
		}
	})

	t.Run("Update cross-tenant isolation", func(t *testing.T) {
		tampered := &repository.AdminUser{
			ID:           adminA.ID,
			Email:        adminA.Email,
			PasswordHash: "tampered_hash",
			Name:         "Tampered Name",
			Status:       "inactive",
		}
		err := adminUserRepo.Update(ctx, tenantB.ID, tampered)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A's admin user, got err=%v", err)
		}
	})

	t.Run("Delete cross-tenant isolation", func(t *testing.T) {
		err := adminUserRepo.Delete(ctx, tenantB.ID, adminA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's admin user, got err=%v", err)
		}
	})

	t.Run("List cross-tenant isolation", func(t *testing.T) {
		list, err := adminUserRepo.ListByTenant(ctx, tenantB.ID)
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		for _, u := range list {
			if u.ID == adminA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's admin user: %+v", u)
			}
		}
	})
}

func TestCrossTenant_Session(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)
	sessionRepo := repository.NewSessionRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-ses")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-ses")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	adminA := &repository.AdminUser{
		Email:        fmt.Sprintf("admin-%d-%d@tenantA.com", time.Now().UnixNano(), rand.Intn(10000)),
		PasswordHash: "$2a$10$dummyhashdummyhashdummyhashdummyh",
		Name:         "Admin Travel A",
		Status:       "active",
	}
	if err := adminUserRepo.Create(ctx, tenantA.ID, adminA); err != nil {
		t.Fatalf("Failed to create admin user for Tenant A: %v", err)
	}
	defer adminUserRepo.Delete(ctx, tenantA.ID, adminA.ID)

	sessionA := &repository.Session{
		Token:       fmt.Sprintf("token_%d_%d", time.Now().UnixNano(), rand.Intn(10000)),
		AdminUserID: adminA.ID,
		ExpiresAt:   time.Now().Add(7 * 24 * time.Hour),
	}
	if err := sessionRepo.Create(ctx, tenantA.ID, sessionA); err != nil {
		t.Fatalf("Failed to create session for Tenant A: %v", err)
	}
	defer sessionRepo.Delete(ctx, tenantA.ID, sessionA.ID)

	// 1. POSITIVE ASSERTIONS: Tenant A MUST be able to read and list its own session
	t.Run("Positive assertion: Tenant A can access its own session", func(t *testing.T) {
		got, err := sessionRepo.GetByID(ctx, tenantA.ID, sessionA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get its own session: %v", err)
		}
		if got == nil || got.ID != sessionA.ID || got.Token != sessionA.Token || got.TenantID != tenantA.ID {
			t.Fatalf("Tenant A received unexpected session data: %+v, expected ID=%d, Token=%s", got, sessionA.ID, sessionA.Token)
		}

		list, err := sessionRepo.ListByAdminUser(ctx, tenantA.ID, adminA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to list sessions: %v", err)
		}
		found := false
		for _, s := range list {
			if s.ID == sessionA.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("Tenant A's list does not contain its created session %d", sessionA.ID)
		}

		byToken, err := sessionRepo.FindByToken(ctx, sessionA.Token)
		if err != nil {
			t.Fatalf("FindByToken failed: %v", err)
		}
		if byToken.ID != sessionA.ID || byToken.TenantID != tenantA.ID {
			t.Fatalf("FindByToken returned unexpected session: %+v", byToken)
		}
	})

	// 2. NEGATIVE ASSERTIONS: Tenant B MUST NOT be able to access, delete, or list Tenant A's session
	t.Run("GetByID cross-tenant isolation", func(t *testing.T) {
		got, err := sessionRepo.GetByID(ctx, tenantB.ID, sessionA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B accesses Tenant A's session, got err=%v, data=%+v", err, got)
		}
		if got != nil {
			t.Errorf("Expected nil data, got %+v", got)
		}
	})

	t.Run("Delete cross-tenant isolation", func(t *testing.T) {
		err := sessionRepo.Delete(ctx, tenantB.ID, sessionA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's session, got err=%v", err)
		}
	})

	t.Run("List cross-tenant isolation", func(t *testing.T) {
		list, err := sessionRepo.ListByAdminUser(ctx, tenantB.ID, adminA.ID)
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		for _, s := range list {
			if s.ID == sessionA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's session: %+v", s)
			}
		}
	})
}

func TestCrossTenant_TenantBranding(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-brand")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-brand")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	// 1. Initial assertion: both tenants have nil/unset brand primary color
	tAInit, err := tenantRepo.GetByID(ctx, tenantA.ID)
	if err != nil {
		t.Fatalf("Failed to fetch tenant A: %v", err)
	}
	tBInit, err := tenantRepo.GetByID(ctx, tenantB.ID)
	if err != nil {
		t.Fatalf("Failed to fetch tenant B: %v", err)
	}

	if tAInit.BrandPrimaryColor != nil {
		t.Errorf("Expected initial tenant A color nil, got %v", *tAInit.BrandPrimaryColor)
	}
	if tBInit.BrandPrimaryColor != nil {
		t.Errorf("Expected initial tenant B color nil, got %v", *tBInit.BrandPrimaryColor)
	}

	// 2. Tenant A updates branding to #2563EB
	if err := tenantRepo.UpdateBranding(ctx, tenantA.ID, "#2563EB"); err != nil {
		t.Fatalf("Failed to update tenant A branding: %v", err)
	}

	// 3. Verify Tenant A updated
	tAUpdated, err := tenantRepo.GetByID(ctx, tenantA.ID)
	if err != nil {
		t.Fatalf("Failed to fetch tenant A after update: %v", err)
	}
	if tAUpdated.BrandPrimaryColor == nil || *tAUpdated.BrandPrimaryColor != "#2563EB" {
		t.Errorf("Expected tenant A color #2563EB, got %v", tAUpdated.BrandPrimaryColor)
	}

	// 4. Verify Tenant B is completely unchanged (isolation)
	tBAfterAUpdate, err := tenantRepo.GetByID(ctx, tenantB.ID)
	if err != nil {
		t.Fatalf("Failed to fetch tenant B: %v", err)
	}
	if tBAfterAUpdate.BrandPrimaryColor != nil {
		t.Errorf("Expected tenant B color nil after tenant A updated, got %v", *tBAfterAUpdate.BrandPrimaryColor)
	}

	// 5. Tenant B updates branding to #7C3AED
	if err := tenantRepo.UpdateBranding(ctx, tenantB.ID, "#7C3AED"); err != nil {
		t.Fatalf("Failed to update tenant B branding: %v", err)
	}

	// 6. Verify Tenant B updated and Tenant A was not affected by Tenant B's update
	tBUpdated, err := tenantRepo.GetByID(ctx, tenantB.ID)
	if err != nil {
		t.Fatalf("Failed to fetch tenant B after update: %v", err)
	}
	if tBUpdated.BrandPrimaryColor == nil || *tBUpdated.BrandPrimaryColor != "#7C3AED" {
		t.Errorf("Expected tenant B color #7C3AED, got %v", tBUpdated.BrandPrimaryColor)
	}

	tAFinal, err := tenantRepo.GetByID(ctx, tenantA.ID)
	if err != nil {
		t.Fatalf("Failed to fetch tenant A: %v", err)
			t.Errorf("Expected tenant A color to remain #2563EB, got %v", tAFinal.BrandPrimaryColor)
	}
}

func TestPackagePhotoIsolation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	packageRepo := repository.NewPackageRepository(db)

	// 1. Setup Tenant A and its package
	tenantA := &repository.Tenant{Name: "Tenant Photo A", Slug: fmt.Sprintf("photo-a-%d", time.Now().UnixNano())}
	if err := tenantRepo.Create(ctx, tenantA); err != nil {
		t.Fatalf("Failed to create tenant A: %v", err)
	}
	defer tenantRepo.Delete(ctx, tenantA.ID)

	pkgA := &repository.Package{Name: "Paket A", Status: "draft"}
	if err := packageRepo.Create(ctx, tenantA.ID, pkgA); err != nil {
		t.Fatalf("Failed to create package for Tenant A: %v", err)
	}
	defer packageRepo.Delete(ctx, tenantA.ID, pkgA.ID)

	// 2. Setup Tenant B and its package
	tenantB := &repository.Tenant{Name: "Tenant Photo B", Slug: fmt.Sprintf("photo-b-%d", time.Now().UnixNano())}
	if err := tenantRepo.Create(ctx, tenantB); err != nil {
		t.Fatalf("Failed to create tenant B: %v", err)
	}
	defer tenantRepo.Delete(ctx, tenantB.ID)

	pkgB := &repository.Package{Name: "Paket B", Status: "draft"}
	if err := packageRepo.Create(ctx, tenantB.ID, pkgB); err != nil {
		t.Fatalf("Failed to create package for Tenant B: %v", err)
	}
	defer packageRepo.Delete(ctx, tenantB.ID, pkgB.ID)

	// 3. Insert Photo for Tenant A's Package
	photoRepo := repository.NewPackagePhotoRepository(db)
	
	photoA := &repository.PackagePhoto{
		PackageID: pkgA.ID,
		FilePath:  "/uploads/a/test.webp",
		SortOrder: 1,
	}
	if err := photoRepo.Create(ctx, tenantA.ID, photoA); err != nil {
		t.Fatalf("Failed to create photo A: %v", err)
	}

	// 4. Verify Tenant A can fetch its photo
	t.Run("Positive assertion: Tenant A can access its own photo", func(t *testing.T) {
		photosA, err := photoRepo.ListByPackage(ctx, tenantA.ID, pkgA.ID)
		if err != nil {
			t.Fatalf("Failed to list photos for Tenant A: %v", err)
		}
		if len(photosA) != 1 {
			t.Errorf("Expected 1 photo for Tenant A, got %d", len(photosA))
		}
	})

	// 5. Verify Tenant B CANNOT fetch Tenant A's photo (using Tenant B's ID but Tenant A's package ID)
	t.Run("ListByPackage cross-tenant isolation", func(t *testing.T) {
		photosB_Hack, err := photoRepo.ListByPackage(ctx, tenantB.ID, pkgA.ID)
		if err != nil {
			t.Fatalf("ListByPackage returned error: %v", err)
		}
		if len(photosB_Hack) != 0 {
			t.Errorf("Tenant B should not be able to list Tenant A's photos")
		}
	})

	// 6. Verify Tenant B CANNOT delete Tenant A's photo
	t.Run("Delete cross-tenant isolation", func(t *testing.T) {
		err := photoRepo.Delete(ctx, tenantB.ID, photoA.ID)
		if err != repository.ErrNotFound {
			t.Errorf("Expected ErrNotFound when Tenant B tries to delete Tenant A's photo, got %v", err)
		}
	})

	// 7. Verify Tenant B CANNOT get Tenant A's photo by ID
	t.Run("GetByID cross-tenant isolation", func(t *testing.T) {
		_, err := photoRepo.GetByID(ctx, tenantB.ID, photoA.ID)
		if err != repository.ErrNotFound {
			t.Errorf("Expected ErrNotFound when Tenant B tries to get Tenant A's photo, got %v", err)
		}
	})

	// 8. Verify Tenant B CANNOT update Tenant A's photo sort order
	t.Run("UpdateSortOrder cross-tenant isolation", func(t *testing.T) {
		err := photoRepo.UpdateSortOrder(ctx, tenantB.ID, photoA.ID, 5)
		if err != repository.ErrNotFound {
			t.Errorf("Expected ErrNotFound when Tenant B tries to update Tenant A's photo, got %v", err)
		}
	})
}

func TestCrossTenant_Banners(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	bannerRepo := repository.NewBannerRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-ban")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-ban")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	bannerA := &repository.Banner{
		Title:        "Promo Umroh Akbar",
		ImageURL:     "https://example.com/banner-a.webp",
		DisplayOrder: 1,
		IsActive:     true,
	}
	if err := bannerRepo.Create(ctx, tenantA.ID, bannerA); err != nil {
		t.Fatalf("Failed to create banner for Tenant A: %v", err)
	}

	t.Run("Positive assertion: Tenant A can access its own banner", func(t *testing.T) {
		got, err := bannerRepo.GetByID(ctx, tenantA.ID, bannerA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get banner: %v", err)
		}
		if got.ID != bannerA.ID || got.Title != "Promo Umroh Akbar" {
			t.Errorf("Unexpected banner data: %+v", got)
		}

		list, err := bannerRepo.ListByTenantID(ctx, tenantA.ID, false)
		if err != nil {
			t.Fatalf("Tenant A list failed: %v", err)
		}
		if len(list) != 1 || list[0].ID != bannerA.ID {
			t.Errorf("Tenant A list unexpected: %+v", list)
		}
	})

	t.Run("Negative assertion: Tenant B cannot access Tenant A's banner", func(t *testing.T) {
		got, err := bannerRepo.GetByID(ctx, tenantB.ID, bannerA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B gets Tenant A's banner, got err=%v, data=%+v", err, got)
		}

		list, err := bannerRepo.ListByTenantID(ctx, tenantB.ID, false)
		if err != nil {
			t.Fatalf("Tenant B list failed: %v", err)
		}
		for _, b := range list {
			if b.ID == bannerA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's banner: %+v", b)
			}
		}

		bannerA.Title = "Hacked Title"
		err = bannerRepo.Update(ctx, tenantB.ID, bannerA)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A's banner, got err=%v", err)
		}

		err = bannerRepo.Delete(ctx, tenantB.ID, bannerA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's banner, got err=%v", err)
		}
	})
}

func TestCrossTenant_Testimonials(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	testiRepo := repository.NewTestimonialRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-tst")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-tst")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	testiA := &repository.Testimonial{
		Name:         "H. Bambang",
		PackageName:  "Paket VVIP",
		Rating:       5,
		Quote:        "Sangat amanah dan berkah",
		DisplayOrder: 1,
		IsActive:     true,
	}
	if err := testiRepo.Create(ctx, tenantA.ID, testiA); err != nil {
		t.Fatalf("Failed to create testimonial for Tenant A: %v", err)
	}

	t.Run("Positive assertion: Tenant A can access its own testimonial", func(t *testing.T) {
		got, err := testiRepo.GetByID(ctx, tenantA.ID, testiA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get testimonial: %v", err)
		}
		if got.ID != testiA.ID || got.Name != "H. Bambang" {
			t.Errorf("Unexpected testimonial data: %+v", got)
		}

		list, err := testiRepo.ListByTenantID(ctx, tenantA.ID, false)
		if err != nil {
			t.Fatalf("Tenant A list failed: %v", err)
		}
		if len(list) != 1 || list[0].ID != testiA.ID {
			t.Errorf("Tenant A list unexpected: %+v", list)
		}
	})

	t.Run("Negative assertion: Tenant B cannot access Tenant A's testimonial", func(t *testing.T) {
		got, err := testiRepo.GetByID(ctx, tenantB.ID, testiA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B gets Tenant A's testimonial, got err=%v, data=%+v", err, got)
		}

		list, err := testiRepo.ListByTenantID(ctx, tenantB.ID, false)
		if err != nil {
			t.Fatalf("Tenant B list failed: %v", err)
		}
		for _, item := range list {
			if item.ID == testiA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's testimonial: %+v", item)
			}
		}

		testiA.Name = "Hacked Name"
		err = testiRepo.Update(ctx, tenantB.ID, testiA)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A's testimonial, got err=%v", err)
		}

		err = testiRepo.Delete(ctx, tenantB.ID, testiA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's testimonial, got err=%v", err)
		}
	})
}

func TestCrossTenant_FAQs(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	faqRepo := repository.NewFAQRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-faq")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-faq")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	faqA := &repository.FAQ{
		Question:     "Apakah sudah termasuk visa?",
		Answer:       "Ya, sudah all-in.",
		DisplayOrder: 1,
		IsActive:     true,
	}
	if err := faqRepo.Create(ctx, tenantA.ID, faqA); err != nil {
		t.Fatalf("Failed to create FAQ for Tenant A: %v", err)
	}

	t.Run("Positive assertion: Tenant A can access its own FAQ", func(t *testing.T) {
		got, err := faqRepo.GetByID(ctx, tenantA.ID, faqA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get FAQ: %v", err)
		}
		if got.ID != faqA.ID || got.Question != "Apakah sudah termasuk visa?" {
			t.Errorf("Unexpected FAQ data: %+v", got)
		}

		list, err := faqRepo.ListByTenantID(ctx, tenantA.ID, false)
		if err != nil {
			t.Fatalf("Tenant A list failed: %v", err)
		}
		if len(list) != 1 || list[0].ID != faqA.ID {
			t.Errorf("Tenant A list unexpected: %+v", list)
		}
	})

	t.Run("Negative assertion: Tenant B cannot access Tenant A's FAQ", func(t *testing.T) {
		got, err := faqRepo.GetByID(ctx, tenantB.ID, faqA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B gets Tenant A's FAQ, got err=%v, data=%+v", err, got)
		}

		list, err := faqRepo.ListByTenantID(ctx, tenantB.ID, false)
		if err != nil {
			t.Fatalf("Tenant B list failed: %v", err)
		}
		for _, item := range list {
			if item.ID == faqA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's FAQ: %+v", item)
			}
		}

		faqA.Question = "Hacked Question"
		err = faqRepo.Update(ctx, tenantB.ID, faqA)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A's FAQ, got err=%v", err)
		}

		err = faqRepo.Delete(ctx, tenantB.ID, faqA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's FAQ, got err=%v", err)
		}
	})
}

func TestCrossTenant_ProfileAndTrust(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-prof")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-prof")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	taglineA := "Bimbingan Sesuai Sunnah"
	aboutA := "Profil singkat Travel A"
	logoA := "https://example.com/logo-a.png"
	if err := tenantRepo.UpdateProfile(ctx, tenantA.ID, "Travel A Super", &logoA, &taglineA, &aboutA); err != nil {
		t.Fatalf("Failed to update Tenant A profile: %v", err)
	}

	ppiuA := "SK/U.123/2024"
	addrA := "Jl. Merdeka No. 10 Jakarta"
	phoneA := "021-123456"
	emailA := "info@travela.id"
	waA := "6281111111111"
	igA := "https://instagram.com/travela"
	fbA := "https://facebook.com/travela"
	ytA := "https://youtube.com/@travela"
	if err := tenantRepo.UpdateContactAndLegal(ctx, tenantA.ID, &ppiuA, &addrA, &phoneA, &emailA, &waA, &igA, &fbA, &ytA); err != nil {
		t.Fatalf("Failed to update Tenant A contact/legal: %v", err)
	}

	ratingA := "4.95"
	alumniA := "2.500+ Jamaah"
	guaranteeA := "Garansi 100% Berangkat"
	if err := tenantRepo.UpdateTrustMetrics(ctx, tenantA.ID, &ratingA, &alumniA, &guaranteeA); err != nil {
		t.Fatalf("Failed to update Tenant A trust metrics: %v", err)
	}

	// Verify Tenant A
	tAGot, err := tenantRepo.GetByID(ctx, tenantA.ID)
	if err != nil {
		t.Fatalf("Failed to get Tenant A: %v", err)
	}
	if tAGot.Name != "Travel A Super" || tAGot.Tagline == nil || *tAGot.Tagline != taglineA {
		t.Errorf("Tenant A profile unexpected: %+v", tAGot)
	}
	if tAGot.PPIUNumber == nil || *tAGot.PPIUNumber != ppiuA {
		t.Errorf("Tenant A PPIU unexpected: %+v", tAGot)
	}
	if tAGot.TrustRating == nil || *tAGot.TrustRating != ratingA {
		t.Errorf("Tenant A trust rating unexpected: %+v", tAGot)
	}

	// Verify Tenant B is completely unchanged (still nil/defaults)
	tBGot, err := tenantRepo.GetByID(ctx, tenantB.ID)
	if err != nil {
		t.Fatalf("Failed to get Tenant B: %v", err)
	}
	if tBGot.Tagline != nil {
		t.Errorf("Tenant B leaked Tenant A's tagline: %v", *tBGot.Tagline)
	}
	if tBGot.PPIUNumber != nil {
		t.Errorf("Tenant B leaked Tenant A's PPIU: %v", *tBGot.PPIUNumber)
	}
}

func TestAdminUser_CrossTenantIsolation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "adm-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "adm-b")

	emailA := fmt.Sprintf("staff-a-%d@test.com", time.Now().UnixNano())
	emailB := fmt.Sprintf("staff-b-%d@test.com", time.Now().UnixNano())

	// 1. Tenant A creates user with emailA
	userA := &repository.AdminUser{
		TenantID:     tenantA.ID,
		Email:        emailA,
		Name:         "Staff Tenant A",
		PasswordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
		Status:       "active",
	}
	if err := adminUserRepo.Create(ctx, tenantA.ID, userA); err != nil {
		t.Fatalf("Failed to create user in Tenant A: %v", err)
	}

	// 2. Tenant B attempts to create user with the SAME emailA -> MUST FAIL with duplicate key error (global unique index)
	duplicateUser := &repository.AdminUser{
		TenantID:     tenantB.ID,
		Email:        emailA,
		Name:         "Duplicate User Tenant B",
		PasswordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
		Status:       "active",
	}
	if err := adminUserRepo.Create(ctx, tenantB.ID, duplicateUser); err == nil {
		t.Fatalf("Expected error when creating user with duplicate email across tenants, got nil")
	}

	// 2b. Tenant B creates user with unique emailB -> MUST SUCCEED
	userB := &repository.AdminUser{
		TenantID:     tenantB.ID,
		Email:        emailB,
		Name:         "Staff Tenant B",
		PasswordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
		Status:       "active",
	}
	if err := adminUserRepo.Create(ctx, tenantB.ID, userB); err != nil {
		t.Fatalf("Failed to create user in Tenant B: %v", err)
	}

	// 3. Tenant A tries to access user B by ID -> must return ErrNotFound
	_, err := adminUserRepo.GetByID(ctx, tenantA.ID, userB.ID)
	if !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("Expected ErrNotFound when Tenant A accesses Tenant B's user, got %v", err)
	}

	// 4. Tenant A lists users -> must NOT contain user B
	listA, err := adminUserRepo.ListByTenant(ctx, tenantA.ID)
	if err != nil {
		t.Fatalf("Failed to list Tenant A users: %v", err)
	}
	for _, u := range listA {
		if u.ID == userB.ID {
			t.Errorf("Cross-tenant leakage: user B found in Tenant A's user list")
		}
	}

	// 5. Tenant A tries to update user B -> must fail with ErrNotFound
	hackedUserB := *userB
	hackedUserB.Name = "Hacked Name"
	err = adminUserRepo.Update(ctx, tenantA.ID, &hackedUserB)
	if !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("Expected ErrNotFound when Tenant A attempts to update Tenant B user, got %v", err)
	}

	// 6. Tenant A checks active count -> must only count Tenant A's users
	countA, err := adminUserRepo.CountActiveByTenant(ctx, tenantA.ID)
	if err != nil {
		t.Fatalf("Failed to count active users for Tenant A: %v", err)
	}
	countB, err := adminUserRepo.CountActiveByTenant(ctx, tenantB.ID)
	if err != nil {
		t.Fatalf("Failed to count active users for Tenant B: %v", err)
	}
	if countA < 1 || countB < 1 {
		t.Errorf("Expected count >= 1 for both tenants, got countA=%d, countB=%d", countA, countB)
	}
}

func TestDashboardOverview_CrossTenantIsolation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	overviewRepo := repository.NewDashboardOverviewRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "ov-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "ov-b")

	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM prospects WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
		_, _ = db.Exec("DELETE FROM commission_payout_requests WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
		_, _ = db.Exec("DELETE FROM referral_clicks WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
		_, _ = db.Exec("DELETE FROM packages WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
		_, _ = db.Exec("DELETE FROM agents WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
		_ = tenantRepo.Delete(ctx, tenantA.ID)
		_ = tenantRepo.Delete(ctx, tenantB.ID)
	})

	// 1. Insert prospects for Tenant A
	pax3 := 3
	prospectA1 := &repository.Prospect{
		Name:          "Prospect A1",
		Phone:         "0811111111",
		Status:        "baru",
		SourceChannel: "organik",
		JumlahJamaah:  &pax3,
	}
	if err := prospectRepo.Create(ctx, tenantA.ID, prospectA1); err != nil {
		t.Fatalf("Failed to create prospect A1: %v", err)
	}

	pax2 := 2
	prospectA2 := &repository.Prospect{
		Name:          "Prospect A2",
		Phone:         "0811111112",
		Status:        "closing",
		SourceChannel: "organik",
		JumlahJamaah:  &pax2,
	}
	if err := prospectRepo.Create(ctx, tenantA.ID, prospectA2); err != nil {
		t.Fatalf("Failed to create prospect A2: %v", err)
	}

	// 2. Insert prospects for Tenant B
	pax5 := 5
	prospectB1 := &repository.Prospect{
		Name:          "Prospect B1",
		Phone:         "0822222221",
		Status:        "baru",
		SourceChannel: "paid",
		JumlahJamaah:  &pax5,
	}
	if err := prospectRepo.Create(ctx, tenantB.ID, prospectB1); err != nil {
		t.Fatalf("Failed to create prospect B1: %v", err)
	}

	pax10 := 10
	prospectB2 := &repository.Prospect{
		Name:          "Prospect B2",
		Phone:         "0822222222",
		Status:        "closing",
		SourceChannel: "agen",
		JumlahJamaah:  &pax10,
	}
	if err := prospectRepo.Create(ctx, tenantB.ID, prospectB2); err != nil {
		t.Fatalf("Failed to create prospect B2: %v", err)
	}

	pax1 := 1
	prospectB3 := &repository.Prospect{
		Name:          "Prospect B3",
		Phone:         "0822222223",
		Status:        "baru",
		SourceChannel: "organik",
		JumlahJamaah:  &pax1,
	}
	if err := prospectRepo.Create(ctx, tenantB.ID, prospectB3); err != nil {
		t.Fatalf("Failed to create prospect B3: %v", err)
	}

	// 3. Query overview for Tenant A -> must only see Tenant A data
	ovA, err := overviewRepo.GetOverview(ctx, tenantA.ID)
	if err != nil {
		t.Fatalf("Failed to get overview for Tenant A: %v", err)
	}

	if ovA.Alerts.UncontactedProspectsCount != 1 {
		t.Errorf("Tenant A uncontacted prospects: expected 1, got %d", ovA.Alerts.UncontactedProspectsCount)
	}
	if ovA.KPIs.TotalProspects != 2 {
		t.Errorf("Tenant A total prospects: expected 2, got %d", ovA.KPIs.TotalProspects)
	}
	if ovA.KPIs.TotalClosingJamaah != 2 {
		t.Errorf("Tenant A closing jamaah: expected 2, got %d", ovA.KPIs.TotalClosingJamaah)
	}

	// 4. Query overview for Tenant B -> must only see Tenant B data
	ovB, err := overviewRepo.GetOverview(ctx, tenantB.ID)
	if err != nil {
		t.Fatalf("Failed to get overview for Tenant B: %v", err)
	}

	if ovB.Alerts.UncontactedProspectsCount != 2 {
		t.Errorf("Tenant B uncontacted prospects: expected 2, got %d", ovB.Alerts.UncontactedProspectsCount)
	}
	if ovB.KPIs.TotalProspects != 3 {
		t.Errorf("Tenant B total prospects: expected 3, got %d", ovB.KPIs.TotalProspects)
	}
	if ovB.KPIs.TotalClosingJamaah != 10 {
		t.Errorf("Tenant B closing jamaah: expected 10, got %d", ovB.KPIs.TotalClosingJamaah)
	}

	// 5. Verify recent prospects isolation
	for _, p := range ovA.RecentProspects {
		if p.ID == prospectB1.ID || p.ID == prospectB2.ID || p.ID == prospectB3.ID {
			t.Errorf("Cross-tenant leakage: Tenant B prospect found in Tenant A overview")
		}
	}
	for _, p := range ovB.RecentProspects {
		if p.ID == prospectA1.ID || p.ID == prospectA2.ID {
			t.Errorf("Cross-tenant leakage: Tenant A prospect found in Tenant B overview")
		}
	}

	// 6. Verify pending pipeline isolation
	if ovA.PendingPipeline.TotalProspects != 1 || ovA.PendingPipeline.TotalPax != 3 {
		t.Errorf("Tenant A pending pipeline: expected 1 prospect / 3 pax, got %d prospects / %d pax",
			ovA.PendingPipeline.TotalProspects, ovA.PendingPipeline.TotalPax)
	}
	if ovB.PendingPipeline.TotalProspects != 2 || ovB.PendingPipeline.TotalPax != 6 {
		t.Errorf("Tenant B pending pipeline: expected 2 prospects / 6 pax, got %d prospects / %d pax",
			ovB.PendingPipeline.TotalProspects, ovB.PendingPipeline.TotalPax)
	}
}

func TestRecordReferralClick_CrossTenantIsolation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	prospectRepo := repository.NewProspectRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "refclick-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "refclick-b")

	// Clean up any lingering test agents
	_, _ = db.Exec("DELETE FROM agents WHERE referral_code LIKE 'REFA-CLICK%' OR referral_code LIKE 'REFB-CLICK%'")

	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM referral_clicks WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
		_, _ = db.Exec("DELETE FROM agents WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
		_ = tenantRepo.Delete(ctx, tenantA.ID)
		_ = tenantRepo.Delete(ctx, tenantB.ID)
	})

	ts := time.Now().UnixNano()
	emailA := fmt.Sprintf("agentA_refclick_%d@test.local", ts)
	phoneA := fmt.Sprintf("0812%08d", ts%100000000)
	refCodeA := fmt.Sprintf("REFA-CLICK-%d", ts)
	agentA := &repository.Agent{
		Name:         "Agent Tenant A",
		Email:        &emailA,
		Phone:        &phoneA,
		Status:       "active",
		ReferralCode: refCodeA,
	}
	if err := agentRepo.Create(ctx, tenantA.ID, agentA); err != nil {
		t.Fatalf("Failed to create agent A: %v", err)
	}

	emailB := fmt.Sprintf("agentB_refclick_%d@test.local", ts)
	phoneB := fmt.Sprintf("0813%08d", ts%100000000)
	refCodeB := fmt.Sprintf("REFB-CLICK-%d", ts)
	agentB := &repository.Agent{
		Name:         "Agent Tenant B",
		Email:        &emailB,
		Phone:        &phoneB,
		Status:       "active",
		ReferralCode: refCodeB,
	}
	if err := agentRepo.Create(ctx, tenantB.ID, agentB); err != nil {
		t.Fatalf("Failed to create agent B: %v", err)
	}

	// Record click for Agent A under Tenant A
	if err := prospectRepo.RecordReferralClick(ctx, tenantA.ID, agentA.ID, "127.0.0.1"); err != nil {
		t.Fatalf("Failed to record click for agent A: %v", err)
	}
	// Record second click for Agent A
	if err := prospectRepo.RecordReferralClick(ctx, tenantA.ID, agentA.ID, "127.0.0.2"); err != nil {
		t.Fatalf("Failed to record 2nd click for agent A: %v", err)
	}

	// Record click for Agent B under Tenant B
	if err := prospectRepo.RecordReferralClick(ctx, tenantB.ID, agentB.ID, "127.0.0.3"); err != nil {
		t.Fatalf("Failed to record click for agent B: %v", err)
	}

	// Verify Tenant A counts 2 clicks for Agent A
	countA, err := prospectRepo.GetAgentReferralClicksCount(ctx, tenantA.ID, agentA.ID)
	if err != nil {
		t.Fatalf("Failed to get clicks count for Agent A: %v", err)
	}
	if countA != 2 {
		t.Errorf("Expected 2 clicks for Agent A under Tenant A, got %d", countA)
	}

	// Verify Tenant B counts 1 click for Agent B
	countB, err := prospectRepo.GetAgentReferralClicksCount(ctx, tenantB.ID, agentB.ID)
	if err != nil {
		t.Fatalf("Failed to get clicks count for Agent B: %v", err)
	}
	if countB != 1 {
		t.Errorf("Expected 1 click for Agent B under Tenant B, got %d", countB)
	}

	// CROSS-TENANT ISOLATION: Tenant B must see 0 clicks for Agent A
	countCross, err := prospectRepo.GetAgentReferralClicksCount(ctx, tenantB.ID, agentA.ID)
	if err != nil {
		t.Fatalf("Failed to get cross clicks count: %v", err)
	}
	if countCross != 0 {
		t.Errorf("CRITICAL SECURITY VIOLATION: Tenant B saw %d clicks for Tenant A's agent", countCross)
	}
}




