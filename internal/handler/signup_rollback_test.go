package handler_test

import (
	"context"
	"errors"
	"testing"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// adminRepoWithFailures wraps mockAdminUserRepo to simulate a failing insert and record deletes.
type adminRepoWithFailures struct {
	*mockAdminUserRepo
	failCreate bool
	deleted    []uint64
}

func (m *adminRepoWithFailures) Create(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	if m.failCreate {
		return errors.New("Error 1062: Duplicate entry for key 'admin_users.email'")
	}
	user.ID = 900
	return m.mockAdminUserRepo.Create(ctx, tenantID, user)
}

func (m *adminRepoWithFailures) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	m.deleted = append(m.deleted, id)
	return m.mockAdminUserRepo.Delete(ctx, tenantID, id)
}

// pvRepoWithFailure wraps mockPVRepo to simulate a failing invoice insert.
type pvRepoWithFailure struct {
	*mockPVRepo
	failCreate bool
}

func (m *pvRepoWithFailure) Create(ctx context.Context, pv *repository.PaymentVerification) error {
	if m.failCreate {
		return errors.New("db down")
	}
	return m.mockPVRepo.Create(ctx, pv)
}

// Regresi temuan audit #8: signup yang gagal di tengah jalan tidak boleh meninggalkan tenant yatim
// (slug & nomor WhatsApp terkunci selamanya).
func TestPublicSignup_RollsBackOnPartialFailure(t *testing.T) {
	ctx := context.Background()
	req := service.TenantSignupRequest{
		TravelName: "Travel Rollback", Slug: "travel-rollback", AdminName: "Admin Rollback",
		AdminEmail: "rollback@test.id", AdminPassword: "Password123", AdminWhatsApp: "081299990001", PlanID: 1,
	}

	setup := func(failAdmin, failPV bool) (service.PublicSignupService, *mockTenantRepoPublic, *adminRepoWithFailures, *pvRepoWithFailure) {
		tenantRepo := newMockTenantRepoPublic()
		adminRepo := &adminRepoWithFailures{mockAdminUserRepo: &mockAdminUserRepo{users: map[string]*repository.AdminUser{}}, failCreate: failAdmin}
		pvRepo := &pvRepoWithFailure{mockPVRepo: newMockPVRepo(), failCreate: failPV}
		planRepo := newMockPlanRepoPublic()
		planRepo.plans[1] = &repository.PricingPlan{ID: 1, Name: "Standard", PeriodMonths: 1, Price: 500000}
		couponRepo := newMockCouponRepo()
		svc := service.NewPublicSignupService(tenantRepo, adminRepo, planRepo, service.NewCouponService(couponRepo), pvRepo)
		return svc, tenantRepo, adminRepo, pvRepo
	}

	t.Run("admin insert fails -> tenant removed, slug reusable", func(t *testing.T) {
		svc, tenantRepo, adminRepo, _ := setup(true, false)
		if _, err := svc.TenantSignup(ctx, req); err == nil {
			t.Fatalf("expected signup error")
		}
		if len(tenantRepo.tenants) != 0 {
			t.Fatalf("orphan tenant left behind: %d tenants", len(tenantRepo.tenants))
		}

		adminRepo.failCreate = false
		if _, err := svc.TenantSignup(ctx, req); err != nil {
			t.Fatalf("expected retry with same slug/WhatsApp to succeed, got %v", err)
		}
	})

	t.Run("invoice insert fails -> admin and tenant removed", func(t *testing.T) {
		svc, tenantRepo, adminRepo, _ := setup(false, true)
		if _, err := svc.TenantSignup(ctx, req); err == nil {
			t.Fatalf("expected signup error")
		}
		if len(tenantRepo.tenants) != 0 {
			t.Fatalf("orphan tenant left behind: %d tenants", len(tenantRepo.tenants))
		}
		if len(adminRepo.deleted) != 1 || adminRepo.deleted[0] != 900 {
			t.Fatalf("expected created admin (id 900) to be deleted, got %v", adminRepo.deleted)
		}
	})

	t.Run("duplicate email race -> clean ErrAdminEmailAlreadyInUse, no raw DB error", func(t *testing.T) {
		_, tenantRepo, adminRepo, _ := setup(true, false)
		// Pre-check passes (email absent), the insert fails on the UNIQUE index, and the email then
		// exists because a concurrent signup won the race.
		racer := &raceAdminRepo{adminRepoWithFailures: adminRepo, email: req.AdminEmail}
		planRepo := newMockPlanRepoPublic()
		planRepo.plans[1] = &repository.PricingPlan{ID: 1, Name: "Standard", PeriodMonths: 1, Price: 500000}
		couponRepo := newMockCouponRepo()
		svc := service.NewPublicSignupService(tenantRepo, racer, planRepo, service.NewCouponService(couponRepo), newMockPVRepo())

		_, err := svc.TenantSignup(ctx, req)
		if !errors.Is(err, service.ErrAdminEmailAlreadyInUse) {
			t.Fatalf("expected ErrAdminEmailAlreadyInUse, got %v", err)
		}
		if len(tenantRepo.tenants) != 0 {
			t.Fatalf("orphan tenant left behind after race")
		}
	})
}

// raceAdminRepo makes the email appear only after the failed insert, like a concurrent signup would.
type raceAdminRepo struct {
	*adminRepoWithFailures
	email string
}

func (m *raceAdminRepo) Create(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	err := m.adminRepoWithFailures.Create(ctx, tenantID, user)
	m.users[m.email] = &repository.AdminUser{ID: 2, Email: m.email}
	return err
}
