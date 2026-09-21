package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"

	"klikumroh/internal/handler"
	appMiddleware "klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

func main() {
	// Load .env file if present
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

	if dbHost == "" || dbUser == "" || dbName == "" {
		log.Fatalf("Error: Database configuration is incomplete. Please configure DB_HOST, DB_USER, and DB_NAME in .env")
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&multiStatements=true&clientFoundRows=true",
		dbUser, dbPassword, dbHost, dbPort, dbName,
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Error: Failed to initialize database connection pool: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Error: Failed to ping database: %v", err)
	}

	fmt.Println("Database connected")

	// Initialize repositories
	tenantRepo := repository.NewTenantRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	agentSessionRepo := repository.NewAgentSessionRepository(db)
	domainRepo := repository.NewDomainRepository(db)
	packageRepo := repository.NewPackageRepository(db)
	packagePhotoRepo := repository.NewPackagePhotoRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	commissionLedgerRepo := repository.NewCommissionLedgerRepository(db)
	prospectStatusHistoryRepo := repository.NewProspectStatusHistoryRepository(db)
	prospectNoteRepo := repository.NewProspectNoteRepository(db)
	bannerRepo := repository.NewBannerRepository(db)
	testiRepo := repository.NewTestimonialRepository(db)
	faqRepo := repository.NewFAQRepository(db)
	payoutRepo := repository.NewCommissionPayoutRequestRepository(db)
	dashboardOverviewRepo := repository.NewDashboardOverviewRepository(db)
	staffRepo := repository.NewStaffRepository(db)
	pricingPlanRepo := repository.NewPricingPlanRepository(db)
	couponRepo := repository.NewCouponRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	platformSettingsRepo := repository.NewPlatformSettingsRepository(db)
	notifRepo := repository.NewNotificationRepository(db)
	agentTargetRepo := repository.NewAgentTargetRepository(db)

	// Initialize services
	notifService := service.NewNotificationService(notifRepo)
	tenantService := service.NewTenantService(tenantRepo)
	authService := service.NewAuthService(adminUserRepo, sessionRepo, tenantRepo)
	authService.SetPaymentVerificationRepo(pvRepo)
	packageService := service.NewPackageService(packageRepo, packagePhotoRepo)
	packagePhotoService := service.NewPackagePhotoService(packagePhotoRepo, packageRepo)
	contentService := service.NewContentService(bannerRepo, testiRepo, faqRepo)
	agentTargetService := service.NewAgentTargetService(agentTargetRepo, agentRepo)
	agentService := service.NewAgentService(
		agentRepo,
		agentSessionRepo,
		tenantRepo,
		commissionLedgerRepo,
		prospectRepo,
		payoutRepo,
		adminUserRepo,
		notifService,
		agentTargetService,
	)
	prospectService := service.NewProspectService(
		prospectRepo,
		packageRepo,
		agentRepo,
		tenantRepo,
		commissionLedgerRepo,
		prospectStatusHistoryRepo,
		prospectNoteRepo,
		adminUserRepo,
		notifService,
	)

	domainService := service.NewDomainService(domainRepo, nil)
	teamService := service.NewTeamService(adminUserRepo)
	dashboardOverviewService := service.NewDashboardOverviewService(dashboardOverviewRepo)
	staffService := service.NewStaffService(
		staffRepo,
		tenantRepo,
		domainRepo,
		pricingPlanRepo,
		packageRepo,
		prospectRepo,
		agentRepo,
		adminUserRepo,
		sessionRepo,
		pvRepo,
	)
	pricingPlanService := service.NewPricingPlanService(pricingPlanRepo)
	couponService := service.NewCouponService(couponRepo)
	subscriptionService := service.NewSubscriptionService(pvRepo, couponRepo, couponService, pricingPlanRepo, tenantRepo, domainRepo)
	subscriptionService.SetContentRepos(packageRepo, faqRepo)

	// Initialize handlers
	notifHandler := handler.NewNotificationHandler(notifService)
	tenantHandler := handler.NewTenantHandler(tenantService)
	authHandler := handler.NewAuthHandler(authService)
	packageHandler := handler.NewPackageHandler(packageService, packagePhotoService)
	prospectHandler := handler.NewProspectHandler(prospectService)
	contentHandler := handler.NewContentHandler(contentService)
	agentHandler := handler.NewAgentHandler(agentService)
	agentTargetHandler := handler.NewAgentTargetHandler(agentTargetService)
	agentJamaahHandler := handler.NewAgentJamaahHandler(prospectService)
	domainHandler := handler.NewDomainHandler(domainService, domainRepo)
	teamHandler := handler.NewTeamHandler(teamService)
	dashboardOverviewHandler := handler.NewDashboardOverviewHandler(dashboardOverviewService)
	staffHandler := handler.NewStaffHandler(staffService)
	pricingPlanHandler := handler.NewPricingPlanHandler(pricingPlanService)
	couponHandler := handler.NewCouponHandler(couponService)
	subscriptionHandler := handler.NewSubscriptionHandler(subscriptionService, pricingPlanService)
	pvHandler := handler.NewPaymentVerificationHandler(subscriptionService)
	platformSettingsService := service.NewPlatformSettingsService(platformSettingsRepo)
	platformSettingsHandler := handler.NewPlatformSettingsHandler(platformSettingsService)

	publicSignupService := service.NewPublicSignupService(tenantRepo, adminUserRepo, pricingPlanRepo, couponService, pvRepo, domainRepo)
	publicSignupHandler := handler.NewPublicSignupHandler(publicSignupService, pricingPlanService, couponService)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Enable CORS for frontend dashboard and web clients
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Host, X-Forwarded-Host")
			if req.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, req)
		})
	})

	// Public Auth Routes (Tenant Admin & Staff)
	authHandler.RegisterRoutes(r)
	r.Post("/api/staff/login", staffHandler.Login)

	// Public Domain Routes (Caddy ask-endpoint & Next.js custom domain target lookup)
	domainHandler.RegisterPublicRoutes(r)

	// Public Marketing & Signup Routes
	publicSignupHandler.RegisterPublicRoutes(r)
	r.Get("/api/public/platform-settings", platformSettingsHandler.GetPublic)

	// Protected Staff (Internal / Master Admin) API Routes
	r.Group(func(staffProtected chi.Router) {
		staffProtected.Use(appMiddleware.StaffAuthMiddleware(staffRepo, sessionRepo))

		staffProtected.Get("/api/staff/me", staffHandler.Me)
		staffProtected.Get("/api/staff/overview", staffHandler.GetOverview)
		staffProtected.Get("/api/staff/tenants", staffHandler.ListTenants)
		staffProtected.Get("/api/staff/tenants/{id}", staffHandler.GetTenantDetail)
		staffProtected.Post("/api/staff/tenants/{id}/impersonate", staffHandler.ImpersonateTenant)
		staffProtected.Patch("/api/staff/tenants/{id}/subscription", staffHandler.UpdateTenantSubscription)
		staffProtected.Patch("/api/staff/tenants/{id}/admin-users/{admin_user_id}/reset-password", staffHandler.ResetTenantAdminPassword)

		// Staff Users Management
		staffProtected.Get("/api/staff/users", staffHandler.ListStaffUsers)
		staffProtected.Post("/api/staff/users", staffHandler.CreateStaffUser)
		staffProtected.Put("/api/staff/users/{id}", staffHandler.UpdateStaffUser)

		staffProtected.Get("/api/staff/pricing-plans", pricingPlanHandler.List)
		staffProtected.Post("/api/staff/pricing-plans", pricingPlanHandler.Create)
		staffProtected.Put("/api/staff/pricing-plans/{id}", pricingPlanHandler.Update)
		staffProtected.Delete("/api/staff/pricing-plans/{id}", pricingPlanHandler.Delete)

		// Staff Coupons
		staffProtected.Get("/api/staff/coupons", couponHandler.ListStaff)
		staffProtected.Post("/api/staff/coupons", couponHandler.CreateStaff)
		staffProtected.Patch("/api/staff/coupons/{id}/deactivate", couponHandler.DeactivateStaff)

		// Staff Payment Verifications
		staffProtected.Get("/api/staff/payment-verifications", pvHandler.List)
		staffProtected.Patch("/api/staff/payment-verifications/{id}/approve", pvHandler.Approve)
		staffProtected.Patch("/api/staff/payment-verifications/{id}/reject", pvHandler.Reject)
		staffProtected.Patch("/api/staff/payment-verifications/{id}/plan", pvHandler.UpdatePlan)
		staffProtected.Patch("/api/staff/payment-verifications/{id}/coupon", pvHandler.ApplyCoupon)

		// Staff Platform Settings
		staffProtected.Get("/api/staff/platform-settings", platformSettingsHandler.GetStaff)
		staffProtected.Put("/api/staff/platform-settings", platformSettingsHandler.UpdateStaff)

		// Staff Notifications
		notifHandler.RegisterStaffRoutes(staffProtected)
	})

	// Protected Admin Dashboard API Routes
	r.Group(func(protected chi.Router) {
		protected.Use(appMiddleware.AuthMiddleware(sessionRepo))
		protected.Use(appMiddleware.SubscriptionEnforcementMiddleware(tenantRepo))

		// Subscription & Renewal Routes
		protected.Get("/api/dashboard/subscription", subscriptionHandler.GetSubscription)
		protected.Get("/api/dashboard/pricing-plans", subscriptionHandler.GetPricingPlans)
		protected.Get("/api/dashboard/coupons/validate", couponHandler.ValidateTravel)
		protected.Post("/api/dashboard/subscription/renewal-request", subscriptionHandler.CreateRenewalRequest)
		protected.Get("/api/dashboard/subscription/payment-verifications/{id}", subscriptionHandler.GetPaymentVerification)
		protected.Post("/api/dashboard/subscription/payment-verifications/{id}/proof", subscriptionHandler.UploadRenewalProof)
		protected.Get("/api/dashboard/platform-settings", platformSettingsHandler.GetDashboard)

		// Team, Profile, Package, Prospect, Tenant, Content, Agent, Domain & Overview Dashboard Routes
		dashboardOverviewHandler.RegisterDashboardRoutes(protected)
		teamHandler.RegisterDashboardRoutes(protected)
		tenantHandler.RegisterDashboardRoutes(protected)
		packageHandler.RegisterDashboardRoutes(protected)
		prospectHandler.RegisterDashboardRoutes(protected)
		contentHandler.RegisterDashboardRoutes(protected)
		agentHandler.RegisterDashboardRoutes(protected)
		agentTargetHandler.RegisterDashboardRoutes(protected)
		domainHandler.RegisterDashboardRoutes(protected)
		notifHandler.RegisterDashboardRoutes(protected)
	})

	// Protected Agent API Group
	r.Group(func(agentProtected chi.Router) {
		agentProtected.Use(appMiddleware.AgentAuthMiddleware(agentSessionRepo))
		agentHandler.RegisterAgentProtectedRoutes(agentProtected)
		agentJamaahHandler.RegisterRoutes(agentProtected)
		notifHandler.RegisterAgentRoutes(agentProtected)
	})

	// Public Web Whitelabel Subdomain Routes
	r.Group(func(public chi.Router) {
		public.Use(appMiddleware.TenantResolutionMiddleware(domainRepo))

		public.Get("/api/public/tenant", func(w http.ResponseWriter, req *http.Request) {
			tenantID, _ := appMiddleware.GetTenantID(req.Context())
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = fmt.Fprintf(w, `{"resolved_tenant_id":%d}`, tenantID)
		})

		// Public Tenant info, Package catalog, Prospect interest form, Content & Agent public endpoints
		tenantHandler.RegisterPublicRoutes(public)
		packageHandler.RegisterPublicRoutes(public)
		prospectHandler.RegisterPublicRoutes(public)
		contentHandler.RegisterPublicRoutes(public)
		agentHandler.RegisterPublicRoutes(public)
	})

	// DEV ONLY: di production, folder ini di-serve langsung oleh Nginx sebagai static file (lihat Arsitektur-Teknis-KlikUmroh.md),
	// BUKAN oleh Go backend — backend production tidak boleh diakses publik langsung (AGENTS.md Bagian 3.5).
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

	host := os.Getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("Server running on http://%s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}
