package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found, using system environment variables")
	}

	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	if dbPort == "" {
		dbPort = "3306"
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		dbUser, dbPassword, dbHost, dbPort, dbName,
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Error opening db: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)
	domainRepo := repository.NewDomainRepository(db)
	packageRepo := repository.NewPackageRepository(db)
	staffRepo := repository.NewStaffRepository(db)
	pricingPlanRepo := repository.NewPricingPlanRepository(db)

	// Seed Master Admin / Staff User
	staffEmail := "staff@klikumroh.id"
	staffPass := "KlikUmrohStaff2026!"
	existingStaff, err := staffRepo.FindByEmail(ctx, staffEmail)
	staffHash, _ := bcrypt.GenerateFromPassword([]byte(staffPass), bcrypt.DefaultCost)
	if err != nil {
		staff := &repository.StaffUser{
			Name:         "Master Admin KlikUmroh",
			Email:        staffEmail,
			PasswordHash: string(staffHash),
			Status:       "active",
		}
		if err := staffRepo.Create(ctx, staff); err != nil {
			log.Fatalf("Failed to seed staff user: %v", err)
		}
		fmt.Printf("Created Staff User: %s (ID: %d)\n", staff.Email, staff.ID)
	} else {
		_, _ = db.ExecContext(ctx, "UPDATE staff_users SET password_hash = ?, status = 'active' WHERE id = ?", string(staffHash), existingStaff.ID)
		fmt.Printf("Staff User updated/synced: %s (ID: %d)\n", existingStaff.Email, existingStaff.ID)
	}

	// Seed Sample Pricing Plans if empty
	existingPlans, _ := pricingPlanRepo.List(ctx)
	if len(existingPlans) == 0 {
		samplePlans := []repository.PricingPlan{
			{Name: "3 Bulan", PeriodMonths: 3, Price: 1500000},
			{Name: "6 Bulan", PeriodMonths: 6, Price: 2000000},
			{Name: "12 Bulan", PeriodMonths: 12, Price: 3500000},
		}
		for _, sp := range samplePlans {
			plan := sp
			if err := pricingPlanRepo.Create(ctx, &plan); err != nil {
				log.Fatalf("Failed to seed pricing plan: %v", err)
			}
			fmt.Printf("Created Pricing Plan: %s (%d Bulan, Rp %.0f)\n", plan.Name, plan.PeriodMonths, plan.Price)
		}
	} else {
		fmt.Printf("Pricing Plans already exist (%d plans)\n", len(existingPlans))
	}

	// Seed Tenant A: Al-Barakah
	seedTenant(ctx, tenantRepo, domainRepo, adminUserRepo, packageRepo, tenantSeedData{
		name:              "Al-Barakah Travel",
		slug:              "albarakah",
		brandPrimaryColor: "#16A34A",
		domains: []string{
			"travela.klikumroh.local",
			"albarakah.klikumroh.id",
		},
		adminEmail: "admin@albarakah.com",
		adminName:  "H. Abdullah (Admin Al-Barakah)",
		packages: []packageSeedData{
			{
				name:          "Umroh Reguler Syawal 1448H (9 Hari)",
				description:   "Paket umroh reguler fasilitas hotel bintang 4 dekat Masjidil Haram dan Masjid Nabawi.",
				price:         29500000,
				departureDate: time.Date(2027, 4, 18, 0, 0, 0, 0, time.UTC),
				quota:         12,
				status:        "published",
			},
			{
				name:          "Umroh VIP Bintang 5 Plus Kereta Cepat (12 Hari)",
				description:   "Paket umroh VIP hotel bintang 5 pelataran masjid plus tiket kereta cepat Haramain High Speed Railway.",
				price:         44900000,
				departureDate: time.Date(2027, 5, 2, 0, 0, 0, 0, time.UTC),
				quota:         4,
				status:        "published",
			},
			{
				name:          "Umroh Awal Musim Promo 1449H (Draft Khusus Internal)",
				description:   "Paket early bird musim depan masih dalam tahap penyusunan maskapai.",
				price:         25000000,
				departureDate: time.Date(2027, 8, 15, 0, 0, 0, 0, time.UTC),
				quota:         25,
				status:        "draft",
			},
		},
	})

	// Seed Tenant B: Nur Iman
	seedTenant(ctx, tenantRepo, domainRepo, adminUserRepo, packageRepo, tenantSeedData{
		name:              "Nur Iman Travel",
		slug:              "nuriman",
		brandPrimaryColor: "#2563EB",
		domains: []string{
			"travelb.klikumroh.local",
			"nuriman.klikumroh.id",
		},
		adminEmail: "admin@nuriman.com",
		adminName:  "Hj. Fatimah (Admin Nur Iman)",
		packages: []packageSeedData{
			{
				name:          "Umroh Barokah Ramadhan Akhir 10 Hari (12 Hari)",
				description:   "Meraih malam Lailatul Qadar di Masjidil Haram dengan bimbingan ustadz pembimbing berpengalaman.",
				price:         38500000,
				departureDate: time.Date(2027, 3, 20, 0, 0, 0, 0, time.UTC),
				quota:         8,
				status:        "published",
			},
			{
				name:          "Umroh Liburan Sekolah Keluarga (10 Hari)",
				description:   "Paket ramah keluarga dan lansia dengan bimbingan manasik intensif.",
				price:         32000000,
				departureDate: time.Date(2027, 6, 25, 0, 0, 0, 0, time.UTC),
				quota:         15,
				status:        "published",
			},
			{
				name:          "Umroh Plus Turki Musim Gugur (Draft Belum Rilis)",
				description:   "Paket kombinasi ziarah Istanbul & Umroh Makkah Madinah.",
				price:         48000000,
				departureDate: time.Date(2027, 10, 10, 0, 0, 0, 0, time.UTC),
				quota:         20,
				status:        "draft",
			},
		},
	})

	fmt.Println("All seed data completed successfully.")
}

type packageSeedData struct {
	name          string
	description   string
	price         float64
	departureDate time.Time
	quota         int
	status        string
}

type tenantSeedData struct {
	name              string
	slug              string
	brandPrimaryColor string
	domains           []string
	adminEmail        string
	adminName         string
	packages          []packageSeedData
}

func seedTenant(
	ctx context.Context,
	tenantRepo repository.TenantRepository,
	domainRepo repository.DomainRepository,
	adminUserRepo repository.AdminUserRepository,
	packageRepo repository.PackageRepository,
	data tenantSeedData,
) {
	tenant, err := tenantRepo.GetBySlug(ctx, data.slug)
	if err != nil {
		tenant = &repository.Tenant{
			Name:              data.name,
			Slug:              data.slug,
			Status:            "active",
			CommissionScheme:  "flat",
			BrandPrimaryColor: &data.brandPrimaryColor,
		}
		if err := tenantRepo.Create(ctx, tenant); err != nil {
			log.Fatalf("Failed to create tenant %s: %v", data.name, err)
		}
		fmt.Printf("Created Tenant: %s (ID: %d)\n", tenant.Name, tenant.ID)
	} else {
		fmt.Printf("Tenant already exists: %s (ID: %d)\n", tenant.Name, tenant.ID)
	}

	for _, host := range data.domains {
		domain, err := domainRepo.FindByHostname(ctx, host)
		if err != nil {
			domain = &repository.Domain{
				Hostname: host,
				Type:     "subdomain",
				Status:   "active",
			}
			if err := domainRepo.Create(ctx, tenant.ID, domain); err != nil {
				log.Fatalf("Failed to create domain %s: %v", host, err)
			}
			fmt.Printf("Created Domain: %s (ID: %d, Tenant: %d)\n", domain.Hostname, domain.ID, tenant.ID)
		} else {
			fmt.Printf("Domain already exists: %s (ID: %d)\n", domain.Hostname, domain.ID)
		}
	}

	adminUser, err := adminUserRepo.FindByEmail(ctx, data.adminEmail)
	hash, errHash := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if errHash != nil {
		log.Fatalf("Failed to hash password: %v", errHash)
	}

	if err != nil {
		adminUser = &repository.AdminUser{
			Email:        data.adminEmail,
			PasswordHash: string(hash),
			Name:         data.adminName,
			Status:       "active",
		}
		if err := adminUserRepo.Create(ctx, tenant.ID, adminUser); err != nil {
			log.Fatalf("Failed to create admin user %s: %v", data.adminEmail, err)
		}
		fmt.Printf("Created Admin User: %s (ID: %d)\n", adminUser.Email, adminUser.ID)
	} else {
		adminUser.PasswordHash = string(hash)
		adminUser.Status = "active"
		_ = adminUserRepo.Update(ctx, tenant.ID, adminUser)
		fmt.Printf("Admin User updated: %s (ID: %d)\n", adminUser.Email, adminUser.ID)
	}

	existingPackages, _ := packageRepo.List(ctx, tenant.ID, nil)
	existingNames := make(map[string]bool)
	for _, p := range existingPackages {
		existingNames[p.Name] = true
	}

	for _, pData := range data.packages {
		if !existingNames[pData.name] {
			pkg := &repository.Package{
				Name:          pData.name,
				Description:   &pData.description,
				Price:         &pData.price,
				DepartureDate: &pData.departureDate,
				Quota:         &pData.quota,
				Status:        pData.status,
			}
			if err := packageRepo.Create(ctx, tenant.ID, pkg); err != nil {
				log.Fatalf("Failed to create package %s: %v", pData.name, err)
			}
			fmt.Printf("Created Package [%s]: %s (ID: %d, Tenant: %d)\n", pkg.Status, pkg.Name, pkg.ID, tenant.ID)
		}
	}
}
