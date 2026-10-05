package repository_test

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Staff request a payout on an affiliator's behalf (keputusan pendiri, opsi a), against the real database
// and through the real staff middleware: works for an inactive affiliator, ignores the program minimum,
// links exactly the summed available commissions (held ones stay), refuses a second one while pending,
// and refuses missing bank details, an empty balance, and an unknown affiliator. All rows are removed.
func TestAffiliator_StaffRequestPayout(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	affRepo := repository.NewAffiliatorRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	staffRepo := repository.NewStaffRepository(db)
	planRepo := repository.NewPricingPlanRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewAffiliatorService(affRepo, repository.NewCouponRepository(db), pvRepo, repository.NewPlatformSettingsRepository(db))

	// Pin a minimum payout above the balance used below, to prove staff payouts ignore it.
	original, err := svc.GetSettings(ctx)
	if err != nil {
		t.Fatalf("GetSettings: %v", err)
	}
	t.Cleanup(func() { _, _ = svc.UpdateSettings(context.Background(), *original) })
	pinned := *original
	pinned.MinPayout = 100000
	if _, err := svc.UpdateSettings(ctx, pinned); err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}

	plan := &repository.PricingPlan{Name: fmt.Sprintf("Plan aff staff payout %d", time.Now().UnixNano()), PeriodMonths: 3, Price: 1500000}
	if err := planRepo.Create(ctx, plan); err != nil {
		t.Fatalf("create plan: %v", err)
	}
	// Registered before the tenant so it runs after its cleanup (payment_verifications reference the plan).
	t.Cleanup(func() { _, _ = db.Exec("DELETE FROM pricing_plans WHERE id = ?", plan.ID) })
	tenant := createDummyTenant(t, ctx, tenantRepo, "aff-staff-payout")

	staff := &repository.StaffUser{Name: "Staff aff payout", Email: fmt.Sprintf("staff-affpayout-%d@klikumroh.test", time.Now().UnixNano()),
		PasswordHash: "[REDACTED-bcrypt-not-needed]", Status: "active"}
	if err := staffRepo.Create(ctx, staff); err != nil {
		t.Fatalf("create staff: %v", err)
	}
	staffTok := fmt.Sprintf("affpayout-staff-%d", time.Now().UnixNano())
	if err := staffRepo.CreateSession(ctx, &repository.StaffSession{StaffUserID: staff.ID, Token: staffTok, ExpiresAt: time.Now().Add(time.Hour)}); err != nil {
		t.Fatalf("create staff session: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM staff_sessions WHERE staff_user_id = ?", staff.ID)
		_, _ = db.Exec("DELETE FROM staff_users WHERE id = ?", staff.ID)
	})

	var affiliatorIDs []uint64
	t.Cleanup(func() {
		for _, id := range affiliatorIDs {
			_, _ = db.Exec("DELETE FROM affiliator_payouts WHERE affiliator_id = ?", id)
			_, _ = db.Exec("DELETE FROM affiliator_commissions WHERE affiliator_id = ?", id)
			_, _ = db.Exec("DELETE FROM coupons WHERE affiliator_id = ?", id)
			_, _ = db.Exec("DELETE FROM affiliators WHERE id = ?", id)
		}
	})
	register := func(label string, withBank bool) *service.AffiliatorLoginResult {
		t.Helper()
		res, err := svc.Register(ctx, service.AffiliatorRegisterRequest{Name: "Affiliator " + label,
			Email: fmt.Sprintf("aff-sp-%s-%d@klikumroh.test", label, time.Now().UnixNano()), Password: "rahasia-test-123"})
		if err != nil {
			t.Fatalf("register %s: %v", label, err)
		}
		affiliatorIDs = append(affiliatorIDs, res.Affiliator.ID)
		if withBank {
			if err := svc.UpdateBank(ctx, res.Affiliator.ID, service.AffiliatorBankRequest{
				BankName: "BSI", BankAccountNumber: "7001" + label, BankAccountHolder: "Pemilik " + label}); err != nil {
				t.Fatalf("UpdateBank %s: %v", label, err)
			}
		}
		return res
	}
	commission := func(affiliatorID uint64, amount float64, availableAt time.Time) uint64 {
		t.Helper()
		pv := &repository.PaymentVerification{TenantID: tenant.ID, PlanID: plan.ID, Amount: plan.Price,
			FinalAmount: plan.Price, Status: "pending"}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("create pv: %v", err)
		}
		c := &repository.AffiliatorCommission{AffiliatorID: affiliatorID, TenantID: tenant.ID, PaymentVerificationID: pv.ID,
			Kind: "first", BaseAmount: plan.Price, Rate: 10, Amount: amount, AvailableAt: availableAt}
		if err := affRepo.CreateCommission(ctx, c); err != nil {
			t.Fatalf("create commission: %v", err)
		}
		return c.ID
	}
	past, future := time.Now().Add(-2*time.Hour), time.Now().Add(14*24*time.Hour)

	r := chi.NewRouter()
	r.Group(func(g chi.Router) {
		g.Use(middleware.StaffAuthMiddleware(staffRepo, repository.NewSessionRepository(db)))
		handler.NewAffiliatorHandler(svc).RegisterStaffRoutes(g)
	})
	post := func(affiliatorID uint64, token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/staff/affiliators/%d/payouts", affiliatorID), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	errorOf := func(w *httptest.ResponseRecorder) string {
		var body map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		return body["error"]
	}

	inactive := register("inactive", true)
	c1 := commission(inactive.Affiliator.ID, 30000, past)
	c2 := commission(inactive.Affiliator.ID, 20000.45, past)
	held := commission(inactive.Affiliator.ID, 99999, future)
	if err := svc.SetStatus(ctx, inactive.Affiliator.ID, "inactive"); err != nil {
		t.Fatalf("SetStatus inactive: %v", err)
	}

	t.Run("Only staff can call it", func(t *testing.T) {
		if w := post(inactive.Affiliator.ID, inactive.Token); w.Code != http.StatusUnauthorized {
			t.Fatalf("SECURITY VIOLATION: affiliator token requested a staff payout (%d)", w.Code)
		}
	})

	var payout repository.AffiliatorPayout
	t.Run("Inactive affiliator: 201, whole available balance under the minimum, exact commissions linked", func(t *testing.T) {
		w := post(inactive.Affiliator.ID, staffTok)
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		if err := json.Unmarshal(w.Body.Bytes(), &payout); err != nil {
			t.Fatalf("parse: %v", err)
		}
		if payout.ID == 0 || payout.AffiliatorID != inactive.Affiliator.ID || payout.Status != "pending" ||
			payout.Amount != 50000.45 || payout.AffiliatorName != inactive.Affiliator.Name ||
			payout.BankName != "BSI" || payout.BankAccountNumber != "7001inactive" || payout.BankAccountHolder != "Pemilik inactive" {
			t.Fatalf("unexpected payout: %+v", payout)
		}

		rows, err := db.Query("SELECT id, amount FROM affiliator_commissions WHERE payout_id = ? ORDER BY id", payout.ID)
		if err != nil {
			t.Fatalf("query linked: %v", err)
		}
		var linked []uint64
		var cents int64
		for rows.Next() {
			var id uint64
			var amount float64
			if err := rows.Scan(&id, &amount); err != nil {
				t.Fatalf("scan: %v", err)
			}
			linked = append(linked, id)
			cents += int64(math.Round(amount * 100))
		}
		rows.Close()
		want := []uint64{c1, c2}
		sort.Slice(want, func(i, j int) bool { return want[i] < want[j] })
		if fmt.Sprint(linked) != fmt.Sprint(want) {
			t.Fatalf("expected commissions %v linked, got %v", want, linked)
		}
		var dbAmount float64
		if err := db.QueryRow("SELECT amount FROM affiliator_payouts WHERE id = ?", payout.ID).Scan(&dbAmount); err != nil {
			t.Fatalf("read payout: %v", err)
		}
		if cents != 5000045 || int64(math.Round(dbAmount*100)) != cents {
			t.Fatalf("linked sum %d cents must equal payout amount %v (5000045 cents)", cents, dbAmount)
		}
		var heldPayout *uint64
		if err := db.QueryRow("SELECT payout_id FROM affiliator_commissions WHERE id = ?", held).Scan(&heldPayout); err != nil {
			t.Fatalf("read held: %v", err)
		}
		if heldPayout != nil {
			t.Fatalf("held commission (hold_days) must not be paid out, linked to %d", *heldPayout)
		}
	})

	t.Run("Second call while pending: 409", func(t *testing.T) {
		w := post(inactive.Affiliator.ID, staffTok)
		if w.Code != http.StatusConflict || errorOf(w) != "Masih ada pencairan yang sedang diproses untuk affiliator ini." {
			t.Fatalf("expected 409 pending, got %d: %s", w.Code, w.Body.String())
		}
		var n int
		_ = db.QueryRow("SELECT COUNT(*) FROM affiliator_payouts WHERE affiliator_id = ?", inactive.Affiliator.ID).Scan(&n)
		if n != 1 {
			t.Fatalf("expected exactly one payout, got %d", n)
		}
	})

	t.Run("After marking paid, an empty balance: 400", func(t *testing.T) {
		if err := svc.MarkPayoutPaid(ctx, payout.ID, staff.ID); err != nil {
			t.Fatalf("MarkPayoutPaid: %v", err)
		}
		w := post(inactive.Affiliator.ID, staffTok)
		if w.Code != http.StatusBadRequest || errorOf(w) != "Tidak ada komisi yang bisa dicairkan." {
			t.Fatalf("expected 400 nothing available, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Active affiliator with only held commissions: 400", func(t *testing.T) {
		a := register("heldonly", true)
		commission(a.Affiliator.ID, 75000, future)
		w := post(a.Affiliator.ID, staffTok)
		if w.Code != http.StatusBadRequest || errorOf(w) != "Tidak ada komisi yang bisa dicairkan." {
			t.Fatalf("expected 400 nothing available, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Active affiliator: 201", func(t *testing.T) {
		a := register("active", true)
		commission(a.Affiliator.ID, 12345, past)
		w := post(a.Affiliator.ID, staffTok)
		var p repository.AffiliatorPayout
		_ = json.Unmarshal(w.Body.Bytes(), &p)
		if w.Code != http.StatusCreated || p.Amount != 12345 {
			t.Fatalf("expected 201 for 12345, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Bank details missing: 400, nothing created", func(t *testing.T) {
		a := register("nobank", false)
		commission(a.Affiliator.ID, 50000, past)
		w := post(a.Affiliator.ID, staffTok)
		if w.Code != http.StatusBadRequest || errorOf(w) != "Data rekening affiliator belum lengkap." {
			t.Fatalf("expected 400 bank missing, got %d: %s", w.Code, w.Body.String())
		}
		var n int
		_ = db.QueryRow("SELECT COUNT(*) FROM affiliator_payouts WHERE affiliator_id = ?", a.Affiliator.ID).Scan(&n)
		if n != 0 {
			t.Fatalf("expected no payout, got %d", n)
		}
	})

	t.Run("Unknown affiliator: 404", func(t *testing.T) {
		if w := post(math.MaxInt64, staffTok); w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
		}
	})
}
