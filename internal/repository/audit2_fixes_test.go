package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Audit round 2 (5 Oct 2026) against the real database. All rows are removed when the test ends.
//   - Vuln 1: a staff password change or deactivation ends the user's staff sessions and the travel
//     sessions it opened by impersonation; reactivation does not revive them; changing your own
//     password keeps the session you use.
//   - A: a proof cannot be attached to an invoice that is no longer pending.
//   - B: "cname" (the custom-domain CNAME target) is a reserved slug.
func TestAudit2Fixes(t *testing.T) {
	db := setupTestDB(t)
	// Registered first so it runs last: t.Cleanup is LIFO and the data cleanup below needs an open connection.
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	staffRepo := repository.NewStaffRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	planRepo := repository.NewPricingPlanRepository(db)
	staffSvc := service.NewStaffService(staffRepo, tenantRepo, nil, nil, nil, nil, nil, adminUserRepo, sessionRepo)

	tenant := createDummyTenant(t, ctx, tenantRepo, "audit2")
	admin := &repository.AdminUser{Name: "Admin audit2", Email: fmt.Sprintf("audit2-admin-%d@klikumroh.test", time.Now().UnixNano()),
		PasswordHash: "[REDACTED-bcrypt-not-needed]", Status: "active"}
	if err := adminUserRepo.Create(ctx, tenant.ID, admin); err != nil {
		t.Fatalf("create admin: %v", err)
	}

	newStaff := func(label string) *repository.StaffUser {
		t.Helper()
		s := &repository.StaffUser{Name: "Staff " + label, Email: fmt.Sprintf("audit2-%s-%d@klikumroh.test", label, time.Now().UnixNano()),
			PasswordHash: "[REDACTED-bcrypt-not-needed]", Status: "active"}
		if err := staffRepo.Create(ctx, s); err != nil {
			t.Fatalf("create staff %s: %v", label, err)
		}
		// Runs before the tenant purge (LIFO): impersonation sessions reference the staff user.
		t.Cleanup(func() {
			_, _ = db.Exec("DELETE FROM sessions WHERE impersonated_by_staff_id = ?", s.ID)
			_, _ = db.Exec("DELETE FROM staff_users WHERE id = ?", s.ID)
		})
		return s
	}
	staffToken := func(s *repository.StaffUser) string {
		t.Helper()
		tok := fmt.Sprintf("audit2-staff-%d", time.Now().UnixNano())
		if err := staffRepo.CreateSession(ctx, &repository.StaffSession{StaffUserID: s.ID, Token: tok, ExpiresAt: time.Now().Add(time.Hour)}); err != nil {
			t.Fatalf("create staff session: %v", err)
		}
		return tok
	}
	impersonation := func(s *repository.StaffUser) string {
		t.Helper()
		tok := fmt.Sprintf("audit2-imp-%d", time.Now().UnixNano())
		id := s.ID
		reason := "Uji pencabutan sesi impersonasi"
		if err := sessionRepo.Create(ctx, tenant.ID, &repository.Session{Token: tok, AdminUserID: admin.ID,
			ExpiresAt: time.Now().Add(time.Hour), ImpersonatedByStaffID: &id, ImpersonationReason: &reason}); err != nil {
			t.Fatalf("create impersonation session: %v", err)
		}
		return tok
	}
	staffValid := func(tok string) bool {
		_, _, err := staffRepo.FindSessionByToken(ctx, tok)
		return err == nil
	}
	impValid := func(tok string) bool {
		_, err := sessionRepo.FindByToken(ctx, tok)
		return err == nil
	}
	newPassword := "sandi-baru-staf-123"

	t.Run("Vuln 1: another staff resets the password: every session of the target ends", func(t *testing.T) {
		actor, target := newStaff("actor"), newStaff("target")
		actorTok, t1, t2, imp := staffToken(actor), staffToken(target), staffToken(target), impersonation(target)

		if _, err := staffSvc.UpdateStaffUser(ctx, target.ID, target.Name, target.Email, &newPassword, "active", actor.ID, actorTok); err != nil {
			t.Fatalf("UpdateStaffUser: %v", err)
		}
		if staffValid(t1) || staffValid(t2) {
			t.Fatal("target staff tokens must be revoked after a password reset")
		}
		if impValid(imp) {
			t.Fatal("impersonation session of the target must be revoked")
		}
		if !staffValid(actorTok) {
			t.Fatal("the acting staff member's own session must stay valid")
		}
	})

	t.Run("Vuln 1: changing your own password keeps only the session you use", func(t *testing.T) {
		self := newStaff("self")
		current, stolen := staffToken(self), staffToken(self)
		if _, err := staffSvc.UpdateStaffUser(ctx, self.ID, self.Name, self.Email, &newPassword, "active", self.ID, current); err != nil {
			t.Fatalf("UpdateStaffUser: %v", err)
		}
		if !staffValid(current) {
			t.Fatal("current session must stay valid")
		}
		if staffValid(stolen) {
			t.Fatal("other session must be revoked")
		}
	})

	t.Run("Vuln 1: deactivation ends sessions and reactivation does not revive them", func(t *testing.T) {
		actor, target := newStaff("actor2"), newStaff("target2")
		actorTok, tok, imp := staffToken(actor), staffToken(target), impersonation(target)
		if _, err := staffSvc.UpdateStaffUser(ctx, target.ID, target.Name, target.Email, nil, "inactive", actor.ID, actorTok); err != nil {
			t.Fatalf("deactivate: %v", err)
		}
		if _, err := staffSvc.UpdateStaffUser(ctx, target.ID, target.Name, target.Email, nil, "active", actor.ID, actorTok); err != nil {
			t.Fatalf("reactivate: %v", err)
		}
		if staffValid(tok) || impValid(imp) {
			t.Fatal("old staff and impersonation tokens must stay dead after reactivation")
		}
	})

	t.Run("Vuln 1: editing name only does not sign anyone out", func(t *testing.T) {
		actor, target := newStaff("actor3"), newStaff("target3")
		actorTok, tok := staffToken(actor), staffToken(target)
		if _, err := staffSvc.UpdateStaffUser(ctx, target.ID, "Nama baru", target.Email, nil, "active", actor.ID, actorTok); err != nil {
			t.Fatalf("UpdateStaffUser: %v", err)
		}
		if !staffValid(tok) {
			t.Fatal("a name change must not revoke sessions")
		}
	})

	t.Run("A: proof cannot be attached to an invoice that is no longer pending", func(t *testing.T) {
		plan := &repository.PricingPlan{Name: fmt.Sprintf("Audit2 Plan %d", time.Now().UnixNano()), PeriodMonths: 3, Price: 1500000}
		if err := planRepo.Create(ctx, plan); err != nil {
			t.Fatalf("create plan: %v", err)
		}
		// Registered before the invoice cleanup so it runs after it (payment_verifications reference the plan).
		t.Cleanup(func() { _ = planRepo.Delete(context.Background(), plan.ID) })
		pv := &repository.PaymentVerification{TenantID: tenant.ID, PlanID: plan.ID, Amount: 1500000, FinalAmount: 1500123, UniqueCode: 123, Status: "pending"}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("create verification: %v", err)
		}
		t.Cleanup(func() { _, _ = db.Exec("DELETE FROM payment_verifications WHERE id = ?", pv.ID) })

		first := fmt.Sprintf("/uploads/%d/subscription-proofs/a.webp", tenant.ID)
		if err := pvRepo.UpdateProofURL(ctx, tenant.ID, pv.ID, first); err != nil {
			t.Fatalf("pending invoice: %v", err)
		}
		if err := pvRepo.UpdateProofURL(ctx, tenant.ID, pv.ID, first); err != nil {
			t.Fatalf("same proof again on a pending invoice: %v", err)
		}
		now := time.Now()
		var staffID *uint64
		if err := pvRepo.TransitionStatus(ctx, pv.ID, "pending", "approved", nil, staffID, &now); err != nil {
			t.Fatalf("approve: %v", err)
		}
		late := fmt.Sprintf("/uploads/%d/subscription-proofs/b.webp", tenant.ID)
		if err := pvRepo.UpdateProofURL(ctx, tenant.ID, pv.ID, late); !errors.Is(err, repository.ErrStatusConflict) {
			t.Fatalf("approved invoice: expected ErrStatusConflict, got %v", err)
		}
		got, _ := pvRepo.GetByID(ctx, pv.ID)
		if got.ProofURL == nil || *got.ProofURL != first {
			t.Fatalf("proof of the approved invoice must stay %q, got %v", first, got.ProofURL)
		}
		other := createDummyTenant(t, ctx, tenantRepo, "audit2-other")
		if err := pvRepo.UpdateProofURL(ctx, other.ID, pv.ID, late); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("another tenant: expected ErrNotFound, got %v", err)
		}
	})

	t.Run("B: cname is a reserved slug", func(t *testing.T) {
		signup := service.NewPublicSignupService(tenantRepo, adminUserRepo, planRepo, nil, pvRepo)
		ok, msg, err := signup.CheckSlug(ctx, "cname")
		if err != nil {
			t.Fatalf("CheckSlug: %v", err)
		}
		if ok {
			t.Fatalf("slug cname must be refused, got available (%q)", msg)
		}
	})
}
