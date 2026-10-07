package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"

	"klikumroh/internal/handler"
	appMiddleware "klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
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

	dsn := repository.MySQLDSN(dbUser, dbPassword, dbHost, dbPort, dbName, "multiStatements=true", "clientFoundRows=true")

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
	accessLogRepo := repository.NewAccessLogRepository(db)

	// Initialize services
	notifService := service.NewNotificationService(notifRepo)
	tenantService := service.NewTenantService(tenantRepo)
	authService := service.NewAuthService(adminUserRepo, sessionRepo, tenantRepo)
	packageService := service.NewPackageService(packageRepo, packagePhotoRepo)
	packagePhotoService := service.NewPackagePhotoService(packagePhotoRepo, packageRepo)
	contentService := service.NewContentService(bannerRepo, testiRepo, faqRepo)
	agentTargetService := service.NewAgentTargetService(agentTargetRepo, agentRepo)
	if guard, ok := agentTargetService.(interface {
		SetPayoffGuard(repository.TargetPayoffRepository, repository.CommissionPolicyRepository)
	}); ok {
		guard.SetPayoffGuard(repository.NewTargetPayoffRepository(db), repository.NewCommissionPolicyRepository(db))
	}
	// Habit tracker store: also read by the leaderboard for each agent's streak badge.
	agentHabitRepo := repository.NewAgentHabitRepository(db)
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
		service.WithHabitBadges(agentHabitRepo),
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
	teamService := service.NewTeamService(adminUserRepo, sessionRepo)
	dashboardOverviewService := service.NewDashboardOverviewService(dashboardOverviewRepo)
	onboardingService := service.NewOnboardingService(repository.NewOnboardingRepository(db))
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
		accessLogRepo,
	)
	accessLogService := service.NewAccessLogService(accessLogRepo)
	pricingPlanService := service.NewPricingPlanService(pricingPlanRepo, pvRepo)
	couponService := service.NewCouponService(couponRepo)
	subscriptionService := service.NewSubscriptionService(pvRepo, couponRepo, couponService, pricingPlanRepo, tenantRepo, domainRepo)
	subscriptionService.SetContentRepos(packageRepo, faqRepo)
	// Manual activation/extension by staff: cancel open invoices, starter content, notify the travel.
	if st, ok := staffService.(interface {
		SetManualSubscriptionHook(service.ManualSubscriptionHook)
	}); ok {
		if hook, ok := subscriptionService.(service.ManualSubscriptionHook); ok {
			st.SetManualSubscriptionHook(hook)
		}
	}
	// Payment approved/rejected and renewal reminders for travels; new transfer proofs for staff.
	if n, ok := subscriptionService.(interface {
		SetNotifier(service.NotificationService, repository.AdminUserRepository, service.StaffLister, repository.SubscriptionReminderRepository)
		StartRenewalReminderLoop(context.Context, time.Duration)
	}); ok {
		n.SetNotifier(notifService, adminUserRepo, staffRepo, repository.NewSubscriptionReminderRepository(db))
		n.StartRenewalReminderLoop(context.Background(), 6*time.Hour)
	}

	// Unused banner images (form cancelled, image replaced before saving) are removed after a day.
	service.StartBannerFileSweep(context.Background(), contentService, filepath.Join(".", "uploads"), 6*time.Hour)

	// Self-signup travels still pending 30 days after signup with no payment activity at all are removed
	// daily, freeing their slug, admin email and WhatsApp number (keputusan pendiri 6 Okt 2026).
	service.StartUnpaidSignupCleanup(context.Background(), repository.NewUnpaidSignupRepository(db), filepath.Join(".", "uploads"), 24*time.Hour)

	// Daily DNS recheck of active custom domains: a domain whose CNAME keeps failing stops receiving the
	// subdomain redirect (the site stays reachable on its subdomain); after MaxDomainCheckFailures failed
	// daily checks in a row it is set to failed (no longer served, no new certificate) and the travel's
	// admins and staff are notified (keputusan pendiri 6 Okt 2026).
	if dn, ok := domainService.(interface {
		SetNotifier(service.NotificationService, repository.AdminUserRepository, service.StaffLister)
	}); ok {
		dn.SetNotifier(notifService, adminUserRepo, staffRepo)
	}
	// First run two minutes after start (a daily deploy must not postpone it forever), then daily; each
	// domain is counted at most once per ~day however often the API restarts.
	service.StartDailyDomainRecheck(context.Background(), domainService, 2*time.Minute, 24*time.Hour)

	// Initialize handlers
	notifHandler := handler.NewNotificationHandler(notifService)
	tenantHandler := handler.NewTenantHandler(tenantService)
	authHandler := handler.NewAuthHandler(authService)
	packageHandler := handler.NewPackageHandler(packageService, packagePhotoService)
	prospectService.SetCommissionPolicyRepo(repository.NewCommissionPolicyRepository(db))

	// Meta Pixel + Conversions API per travel. Without APP_ENCRYPTION_KEY the CAPI token cannot be stored
	// (it is never kept in plain text), so only the browser pixel works.
	secretBox, boxErr := util.NewSecretBox(os.Getenv("APP_ENCRYPTION_KEY"))
	if boxErr != nil {
		log.Printf("[Meta] Conversions API disabled: %v", boxErr)
		secretBox = nil
	}
	metaService := service.NewMetaService(repository.NewMetaIntegrationRepository(db), secretBox)
	prospectService.SetMetaTracker(metaService)
	metaIntegrationHandler := handler.NewMetaIntegrationHandler(metaService)
	prospectHandler := handler.NewProspectHandler(prospectService)
	contentHandler := handler.NewContentHandler(contentService)
	agentHandler := handler.NewAgentHandler(agentService)
	agentTargetHandler := handler.NewAgentTargetHandler(agentTargetService)
	agentJamaahHandler := handler.NewAgentJamaahHandler(prospectService)
	// Jamaah payment proofs from agents (closing DP, pelunasan) for the admin to verify, 7 Oct 2026.
	prospectService.SetPaymentRequestRepo(repository.NewPaymentRequestRepository(db))
	paymentRequestHandler := handler.NewPaymentRequestHandler(prospectService)
	// Agent habit tracker and "99 sumber jamaah" progress.
	agentHabitHandler := handler.NewAgentHabitHandler(service.NewAgentHabitService(agentRepo, agentHabitRepo, notifService))
	// Agent summary on the dashboard home (registered, active, productive, top agents).
	agentInsightHandler := handler.NewAgentInsightHandler(service.NewAgentInsightService(agentRepo, prospectRepo, agentHabitRepo))
	domainHandler := handler.NewDomainHandler(domainService, domainRepo)
	teamHandler := handler.NewTeamHandler(teamService)
	dashboardOverviewHandler := handler.NewDashboardOverviewHandler(dashboardOverviewService)
	onboardingHandler := handler.NewOnboardingHandler(onboardingService)
	staffHandler := handler.NewStaffHandler(staffService)
	accessLogHandler := handler.NewAccessLogHandler(accessLogService)
	pricingPlanHandler := handler.NewPricingPlanHandler(pricingPlanService)
	couponHandler := handler.NewCouponHandler(couponService)
	if checker, ok := subscriptionService.(handler.AffiliatorCouponChecker); ok {
		couponHandler.SetAffiliatorCouponChecker(checker)
	}
	subscriptionHandler := handler.NewSubscriptionHandler(subscriptionService, pricingPlanService)
	pvHandler := handler.NewPaymentVerificationHandler(subscriptionService)
	platformSettingsService := service.NewPlatformSettingsService(platformSettingsRepo)
	platformSettingsHandler := handler.NewPlatformSettingsHandler(platformSettingsService)

	publicSignupService := service.NewPublicSignupService(tenantRepo, adminUserRepo, pricingPlanRepo, couponService, pvRepo, domainRepo)
	publicSignupService.SetPlatformSettingsRepo(platformSettingsRepo)

	// Affiliator KlikUmroh: attribution at signup, commission on payment approval, portal, staff management.
	affiliatorRepo := repository.NewAffiliatorRepository(db)
	affiliatorService := service.NewAffiliatorService(affiliatorRepo, couponRepo, pvRepo, platformSettingsRepo)
	affiliatorHandler := handler.NewAffiliatorHandler(affiliatorService)
	if a, ok := publicSignupService.(interface {
		SetAffiliatorAttributor(service.AffiliatorAttributor)
	}); ok {
		a.SetAffiliatorAttributor(affiliatorService)
	}
	if rec, ok := subscriptionService.(interface {
		SetAffiliatorRecorder(service.AffiliatorCommissionRecorder)
	}); ok {
		rec.SetAffiliatorRecorder(affiliatorService)
	}
	publicSignupHandler := handler.NewPublicSignupHandler(publicSignupService, pricingPlanService, couponService)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	// Every request body is capped: 1 MB for JSON/forms, 16 MB for multipart (upload handlers set their own
	// smaller limit).
	r.Use(appMiddleware.BodySizeLimit(appMiddleware.MaxJSONBodyBytes, appMiddleware.MaxMultipartBodyBytes))

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
	staffHandler.RegisterPublicRoutes(r)

	// Public Domain Routes (Caddy ask-endpoint & Next.js custom domain target lookup)
	domainHandler.RegisterPublicRoutes(r)

	// Public Marketing & Signup Routes
	publicSignupHandler.RegisterPublicRoutes(r)
	r.Get("/api/public/platform-settings", platformSettingsHandler.GetPublic)

	// Affiliator KlikUmroh portal (own login and sessions, never a travel or staff token)
	affiliatorHandler.RegisterPublicRoutes(r)
	r.Group(func(affiliatorProtected chi.Router) {
		affiliatorProtected.Use(appMiddleware.AffiliatorAuthMiddleware(affiliatorRepo))
		affiliatorHandler.RegisterProtectedRoutes(affiliatorProtected)
	})

	// Protected Staff (Internal / Master Admin) API Routes
	r.Group(func(staffProtected chi.Router) {
		staffProtected.Use(appMiddleware.StaffAuthMiddleware(staffRepo, sessionRepo))

		staffProtected.Get("/api/staff/me", staffHandler.Me)
		staffProtected.Post("/api/staff/logout", staffHandler.Logout)
		staffProtected.Get("/api/staff/files", handler.ServeStaffPrivateFile)
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

		// Staff Affiliator KlikUmroh
		affiliatorHandler.RegisterStaffRoutes(staffProtected)

		// Staff Notifications
		notifHandler.RegisterStaffRoutes(staffProtected)
	})

	// Protected Admin Dashboard API Routes
	// The demo travel (demo.klikumroh.id) closes account, domain and Meta changes (middleware.DemoGuard).
	isDemoTenant := func(ctx context.Context, tenantID uint64) bool {
		t, err := tenantRepo.GetByID(ctx, tenantID)
		return err == nil && t != nil && t.IsDemo
	}
	r.Group(func(protected chi.Router) {
		protected.Use(appMiddleware.AuthMiddleware(sessionRepo, accessLogRepo))
		protected.Use(appMiddleware.SubscriptionEnforcementMiddleware(tenantRepo))
		protected.Use(appMiddleware.DemoGuard(isDemoTenant))

		// Subscription & Renewal Routes
		protected.Get("/api/dashboard/subscription", subscriptionHandler.GetSubscription)
		protected.Get("/api/dashboard/pricing-plans", subscriptionHandler.GetPricingPlans)
		protected.With(couponHandler.TravelValidateLimiters()...).Get("/api/dashboard/coupons/validate", couponHandler.ValidateTravel)
		// Same limiter instances as coupons/validate (shared per-travel and per-IP budget): a renewal request
		// validates its coupon_code too, so it must not be an unlimited coupon probe.
		protected.With(couponHandler.TravelValidateLimiters()...).Post("/api/dashboard/subscription/renewal-request", subscriptionHandler.CreateRenewalRequest)
		protected.Get("/api/dashboard/subscription/payment-verifications/{id}", subscriptionHandler.GetPaymentVerification)
		protected.Post("/api/dashboard/subscription/payment-verifications/{id}/proof", subscriptionHandler.UploadRenewalProof)
		protected.Get("/api/dashboard/platform-settings", platformSettingsHandler.GetDashboard)
		protected.Get("/api/dashboard/files", handler.ServeDashboardPrivateFile)

		// Team, Profile, Package, Prospect, Tenant, Content, Agent, Domain & Overview Dashboard Routes
		dashboardOverviewHandler.RegisterDashboardRoutes(protected)
		onboardingHandler.RegisterDashboardRoutes(protected)
		teamHandler.RegisterDashboardRoutes(protected)
		tenantHandler.RegisterDashboardRoutes(protected)
		packageHandler.RegisterDashboardRoutes(protected)
		prospectHandler.RegisterDashboardRoutes(protected)
		paymentRequestHandler.RegisterDashboardRoutes(protected)
		metaIntegrationHandler.RegisterDashboardRoutes(protected)
		contentHandler.RegisterDashboardRoutes(protected)
		agentHandler.RegisterDashboardRoutes(protected)
		agentHabitHandler.RegisterDashboardRoutes(protected)
		agentInsightHandler.RegisterDashboardRoutes(protected)
		protected.Get("/api/dashboard/agent-performance", handler.AgentPerformanceHandler(repository.NewAgentPerformanceRepository(db)))
		protected.Get("/api/dashboard/channel-report", handler.ChannelReportHandler(repository.NewChannelReportRepository(db)))
		agentTargetHandler.RegisterDashboardRoutes(protected)
		domainHandler.RegisterDashboardRoutes(protected)
		notifHandler.RegisterDashboardRoutes(protected)
		accessLogHandler.RegisterDashboardRoutes(protected)
	})

	// Protected Agent API Group
	r.Group(func(agentProtected chi.Router) {
		agentProtected.Use(appMiddleware.AgentAuthMiddleware(agentSessionRepo))
		// Read-only while the travel is suspended (same policy as the travel dashboard).
		agentProtected.Use(appMiddleware.AgentSuspensionMiddleware(tenantRepo))
		agentProtected.Use(appMiddleware.DemoGuard(isDemoTenant))
		agentHandler.RegisterAgentProtectedRoutes(agentProtected)
		agentProtected.Get("/api/agent/files", handler.ServeAgentPrivateFile)
		agentJamaahHandler.RegisterRoutes(agentProtected)
		paymentRequestHandler.RegisterAgentRoutes(agentProtected)
		agentHabitHandler.RegisterRoutes(agentProtected)
		notifHandler.RegisterAgentRoutes(agentProtected)
	})

	// Public Web Whitelabel Subdomain Routes
	r.Group(func(public chi.Router) {
		public.Use(appMiddleware.TenantResolutionMiddleware(domainRepo, tenantRepo))

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
		metaIntegrationHandler.RegisterPublicRoutes(public)
		contentHandler.RegisterPublicRoutes(public)
		agentHandler.RegisterPublicRoutes(public)
	})

	// DEV ONLY: di production, folder ini di-serve langsung oleh Nginx sebagai static file (lihat Arsitektur-Teknis-KlikUmroh.md),
	// BUKAN oleh Go backend — backend production tidak boleh diakses publik langsung (AGENTS.md Bagian 3.5).
	// Private files (transfer proofs) and directory listings are never served here.
	r.Handle("/uploads/*", handler.PublicUploadsHandler("./uploads"))

	host := os.Getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	// AGENTS.md 3.5: the API trusts X-Forwarded-Host from Next.js, which is only safe while it cannot be
	// reached from outside this machine. Refuse to start on any non-loopback address.
	if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		log.Fatalf("HOST=%q is not a loopback address; the API must bind to 127.0.0.1 only", host)
	}
	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("Server running on http://%s", addr)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
		// Slow or stalled clients cannot hold connections forever. ReadTimeout covers the whole body, so it
		// leaves room for a 10 MB transfer proof on a slow mobile link; WriteTimeout covers CSV exports.
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}
