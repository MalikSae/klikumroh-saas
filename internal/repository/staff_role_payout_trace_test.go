package repository_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// staff_users.role (migration 000062) is scanned by every staff read, new staff default to admin, and the
// founder's first account (lowest id) is the owner. Display only: nothing here grants a permission.
func TestStaffRole_Scan(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	staffRepo := repository.NewStaffRepository(db)

	staff := &repository.StaffUser{Name: "Staff role test", Email: fmt.Sprintf("staff-role-%d@klikumroh.test", time.Now().UnixNano()),
		PasswordHash: "[REDACTED-bcrypt-not-needed]", Status: "active"}
	if err := staffRepo.Create(ctx, staff); err != nil {
		t.Fatalf("create staff: %v", err)
	}
	tok := fmt.Sprintf("staff-role-tok-%d", time.Now().UnixNano())
	if err := staffRepo.CreateSession(ctx, &repository.StaffSession{StaffUserID: staff.ID, Token: tok, ExpiresAt: time.Now().Add(time.Hour)}); err != nil {
		t.Fatalf("create session: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM staff_sessions WHERE staff_user_id = ?", staff.ID)
		_, _ = db.Exec("DELETE FROM staff_users WHERE id = ?", staff.ID)
	})

	t.Run("New staff defaults to admin in the database", func(t *testing.T) {
		var role string
		if err := db.QueryRow("SELECT role FROM staff_users WHERE id = ?", staff.ID).Scan(&role); err != nil {
			t.Fatalf("read role: %v", err)
		}
		if role != repository.StaffRoleAdmin || staff.Role != repository.StaffRoleAdmin {
			t.Fatalf("expected admin, db=%q struct=%q", role, staff.Role)
		}
	})

	t.Run("FindByID, FindByEmail, FindSessionByToken, ListStaffUsers scan role", func(t *testing.T) {
		byID, err := staffRepo.FindByID(ctx, staff.ID)
		if err != nil || byID.Role != "admin" {
			t.Fatalf("FindByID role: %v %+v", err, byID)
		}
		byEmail, err := staffRepo.FindByEmail(ctx, staff.Email)
		if err != nil || byEmail.Role != "admin" {
			t.Fatalf("FindByEmail role: %v %+v", err, byEmail)
		}
		_, sessUser, err := staffRepo.FindSessionByToken(ctx, tok)
		if err != nil || sessUser.Role != "admin" {
			t.Fatalf("FindSessionByToken role: %v %+v", err, sessUser)
		}
		list, err := staffRepo.ListStaffUsers(ctx)
		if err != nil {
			t.Fatalf("ListStaffUsers: %v", err)
		}
		found := false
		for _, u := range list {
			if u.Role != "owner" && u.Role != "admin" {
				t.Fatalf("staff %d has unexpected role %q", u.ID, u.Role)
			}
			if u.ID == staff.ID {
				found = u.Role == "admin"
			}
		}
		if !found {
			t.Fatalf("test staff not listed as admin")
		}
	})

	t.Run("Lowest id staff (founder's first account) is the owner", func(t *testing.T) {
		var minID uint64
		if err := db.QueryRow("SELECT MIN(id) FROM staff_users").Scan(&minID); err != nil {
			t.Fatalf("min id: %v", err)
		}
		first, err := staffRepo.FindByID(ctx, minID)
		if err != nil {
			t.Fatalf("FindByID first: %v", err)
		}
		if first.ID != staff.ID && first.Role != repository.StaffRoleOwner {
			t.Fatalf("expected staff %d to be owner, got %q", minID, first.Role)
		}
	})

	t.Run("Update never changes role", func(t *testing.T) {
		u, _ := staffRepo.FindByID(ctx, staff.ID)
		u.Role = repository.StaffRoleOwner // ignored: updateStaffUser does not write role
		u.Name = "Staff role test renamed"
		if err := staffRepo.Update(ctx, u); err != nil {
			t.Fatalf("Update: %v", err)
		}
		var role string
		_ = db.QueryRow("SELECT role FROM staff_users WHERE id = ?", staff.ID).Scan(&role)
		if role != "admin" {
			t.Fatalf("Update must not change role, got %q", role)
		}
	})
}

// affiliator_payouts.requested_by_staff_id (migration 000063): written with the staff id by the staff path,
// NULL by the affiliator's own request; staff lists carry the staff name; the affiliator portal JSON never
// carries either field. All rows are removed.
func TestAffiliatorPayout_RequestedByStaff(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	affRepo := repository.NewAffiliatorRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	staffRepo := repository.NewStaffRepository(db)
	planRepo := repository.NewPricingPlanRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewAffiliatorService(affRepo, repository.NewCouponRepository(db), pvRepo, repository.NewPlatformSettingsRepository(db))

	// A low program minimum so the self-request below passes.
	original, err := svc.GetSettings(ctx)
	if err != nil {
		t.Fatalf("GetSettings: %v", err)
	}
	t.Cleanup(func() { _, _ = svc.UpdateSettings(context.Background(), *original) })
	pinned := *original
	pinned.MinPayout = 1000
	if _, err := svc.UpdateSettings(ctx, pinned); err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}

	plan := &repository.PricingPlan{Name: fmt.Sprintf("Plan payout trace %d", time.Now().UnixNano()), PeriodMonths: 3, Price: 1500000}
	if err := planRepo.Create(ctx, plan); err != nil {
		t.Fatalf("create plan: %v", err)
	}
	t.Cleanup(func() { _, _ = db.Exec("DELETE FROM pricing_plans WHERE id = ?", plan.ID) })
	tenant := createDummyTenant(t, ctx, tenantRepo, "aff-payout-trace")

	staffName := fmt.Sprintf("Staf Jejak %d", time.Now().UnixNano())
	staff := &repository.StaffUser{Name: staffName, Email: fmt.Sprintf("staff-trace-%d@klikumroh.test", time.Now().UnixNano()),
		PasswordHash: "[REDACTED-bcrypt-not-needed]", Status: "active"}
	if err := staffRepo.Create(ctx, staff); err != nil {
		t.Fatalf("create staff: %v", err)
	}
	t.Cleanup(func() { _, _ = db.Exec("DELETE FROM staff_users WHERE id = ?", staff.ID) })

	var affiliatorIDs []uint64
	t.Cleanup(func() {
		for _, id := range affiliatorIDs {
			_, _ = db.Exec("DELETE FROM affiliator_payouts WHERE affiliator_id = ?", id)
			_, _ = db.Exec("DELETE FROM affiliator_commissions WHERE affiliator_id = ?", id)
			_, _ = db.Exec("DELETE FROM coupons WHERE affiliator_id = ?", id)
			_, _ = db.Exec("DELETE FROM affiliator_logins WHERE affiliator_id = ?", id)
			_, _ = db.Exec("DELETE FROM affiliators WHERE id = ?", id)
		}
	})
	register := func(label string) *service.AffiliatorLoginResult {
		t.Helper()
		res, err := svc.Register(ctx, service.AffiliatorRegisterRequest{Name: "Affiliator " + label,
			Email: fmt.Sprintf("aff-trace-%s-%d@klikumroh.test", label, time.Now().UnixNano()), Password: "rahasia-test-123"})
		if err != nil {
			t.Fatalf("register %s: %v", label, err)
		}
		affiliatorIDs = append(affiliatorIDs, res.Affiliator.ID)
		if err := svc.UpdateBank(ctx, res.Affiliator.ID, service.AffiliatorBankRequest{
			BankName: "BSI", BankAccountNumber: "8001" + label, BankAccountHolder: "Pemilik " + label, CurrentPassword: "rahasia-test-123"}); err != nil {
			t.Fatalf("UpdateBank %s: %v", label, err)
		}
		pv := &repository.PaymentVerification{TenantID: tenant.ID, PlanID: plan.ID, Amount: plan.Price, FinalAmount: plan.Price, Status: "pending"}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("create pv: %v", err)
		}
		c := &repository.AffiliatorCommission{AffiliatorID: res.Affiliator.ID, TenantID: tenant.ID, PaymentVerificationID: pv.ID,
			Kind: "first", BaseAmount: plan.Price, Rate: 10, Amount: 40000, AvailableAt: time.Now().Add(-2 * time.Hour)}
		if err := affRepo.CreateCommission(ctx, c); err != nil {
			t.Fatalf("create commission: %v", err)
		}
		return res
	}
	dbRequestedBy := func(payoutID uint64) sql.NullInt64 {
		t.Helper()
		var v sql.NullInt64
		if err := db.QueryRow("SELECT requested_by_staff_id FROM affiliator_payouts WHERE id = ?", payoutID).Scan(&v); err != nil {
			t.Fatalf("read requested_by_staff_id: %v", err)
		}
		return v
	}
	findPayout := func(list []repository.AffiliatorPayout, id uint64) *repository.AffiliatorPayout {
		for i := range list {
			if list[i].ID == id {
				return &list[i]
			}
		}
		t.Fatalf("payout %d not listed", id)
		return nil
	}

	byStaff := register("bystaff")
	self := register("self")

	staffPayout, err := svc.StaffRequestPayout(ctx, byStaff.Affiliator.ID, staff.ID)
	if err != nil {
		t.Fatalf("StaffRequestPayout: %v", err)
	}
	selfPayout, err := svc.RequestPayout(ctx, self.Affiliator.ID)
	if err != nil {
		t.Fatalf("RequestPayout (self): %v", err)
	}

	t.Run("Staff path stores the staff id and returns the name", func(t *testing.T) {
		if v := dbRequestedBy(staffPayout.ID); !v.Valid || uint64(v.Int64) != staff.ID {
			t.Fatalf("expected requested_by_staff_id=%d, got %+v", staff.ID, v)
		}
		if staffPayout.RequestedByStaffID == nil || *staffPayout.RequestedByStaffID != staff.ID ||
			staffPayout.RequestedByStaffName == nil || *staffPayout.RequestedByStaffName != staffName {
			t.Fatalf("unexpected staff trace in response: %+v", staffPayout)
		}
	})

	t.Run("Self path stores NULL", func(t *testing.T) {
		if v := dbRequestedBy(selfPayout.ID); v.Valid {
			t.Fatalf("self-request must store NULL, got %d", v.Int64)
		}
		if selfPayout.RequestedByStaffID != nil || selfPayout.RequestedByStaffName != nil {
			t.Fatalf("self-request must have no staff trace: %+v", selfPayout)
		}
	})

	t.Run("Staff lists (all payouts, affiliator detail) carry id and name", func(t *testing.T) {
		all, err := svc.ListAllPayouts(ctx, "")
		if err != nil {
			t.Fatalf("ListAllPayouts: %v", err)
		}
		sp := findPayout(all, staffPayout.ID)
		if sp.RequestedByStaffID == nil || *sp.RequestedByStaffID != staff.ID || sp.RequestedByStaffName == nil || *sp.RequestedByStaffName != staffName {
			t.Fatalf("ListAllPayouts staff payout trace wrong: %+v", sp)
		}
		if p := findPayout(all, selfPayout.ID); p.RequestedByStaffID != nil || p.RequestedByStaffName != nil {
			t.Fatalf("ListAllPayouts self payout must have no trace: %+v", p)
		}
		detail, err := svc.GetDetail(ctx, byStaff.Affiliator.ID)
		if err != nil {
			t.Fatalf("GetDetail: %v", err)
		}
		dp := findPayout(detail.Payouts, staffPayout.ID)
		if dp.RequestedByStaffName == nil || *dp.RequestedByStaffName != staffName {
			t.Fatalf("detail payout trace wrong: %+v", dp)
		}
		raw, _ := json.Marshal(dp)
		if !strings.Contains(string(raw), `"requested_by_staff_name":"`+staffName+`"`) {
			t.Fatalf("staff JSON must carry requested_by_staff_name: %s", raw)
		}
	})

	t.Run("Affiliator portal JSON has no staff id or name", func(t *testing.T) {
		r := chi.NewRouter()
		r.Group(func(g chi.Router) {
			g.Use(middleware.AffiliatorAuthMiddleware(affRepo))
			handler.NewAffiliatorHandler(svc).RegisterProtectedRoutes(g)
		})
		req := httptest.NewRequest(http.MethodGet, "/api/affiliator/payouts", nil)
		req.Header.Set("Authorization", "Bearer "+byStaff.Token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		body := w.Body.String()
		if !strings.Contains(body, fmt.Sprintf(`"id":%d`, staffPayout.ID)) {
			t.Fatalf("own payout missing from portal list: %s", body)
		}
		if strings.Contains(body, "requested_by_staff") || strings.Contains(body, staffName) {
			t.Fatalf("SECURITY VIOLATION: affiliator portal exposes staff data: %s", body)
		}
	})

	t.Run("Deleting the staff keeps the payout, trace becomes NULL", func(t *testing.T) {
		if _, err := db.Exec("DELETE FROM staff_users WHERE id = ?", staff.ID); err != nil {
			t.Fatalf("delete staff: %v", err)
		}
		if v := dbRequestedBy(staffPayout.ID); v.Valid {
			t.Fatalf("ON DELETE SET NULL expected, got %d", v.Int64)
		}
	})
}
