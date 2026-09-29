package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Regresi temuan audit #4: approve harus atomik — approve paralel hanya boleh menang satu kali.
func TestApprove_ConcurrentRequestsWinOnce(t *testing.T) {
	ctx := context.Background()

	type env struct {
		svc        service.SubscriptionService
		pvRepo     *mockPVRepo
		couponRepo *mockCouponRepo
		tenantRepo *mockTenantRepoPublic
		pvID       uint64
		oldExpiry  time.Time
	}

	setup := func() env {
		pvRepo := newMockPVRepo()
		couponRepo := newMockCouponRepo()
		planRepo := newMockPlanRepoPublic()
		tenantRepo := newMockTenantRepoPublic()

		planRepo.plans[1] = &repository.PricingPlan{ID: 1, Name: "3 Bulan", PeriodMonths: 3, Price: 1500000}
		oldExpiry := time.Now().Add(30 * 24 * time.Hour).Truncate(time.Second)
		planID := uint64(1)
		tenantRepo.tenants[600] = &repository.Tenant{
			ID: 600, Name: "Travel Race", Slug: "travel-race", Status: "active",
			CurrentPlanID: &planID, SubscriptionExpiresAt: &oldExpiry,
		}
		couponRepo.coupons[1] = &repository.Coupon{ID: 1, Code: "HEMAT10", DiscountPercentage: 10, Status: "active"}

		code := "HEMAT10"
		pv := &repository.PaymentVerification{
			TenantID: 600, PlanID: 1, CouponCode: &code,
			Amount: 1500000, FinalAmount: 1350123, UniqueCode: 123, Status: "pending",
		}
		_ = pvRepo.Create(ctx, pv)

		svc := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenantRepo)
		return env{svc: svc, pvRepo: pvRepo, couponRepo: couponRepo, tenantRepo: tenantRepo, pvID: pv.ID, oldExpiry: oldExpiry}
	}

	t.Run("8 parallel approvals: exactly 1 succeeds, expiry and coupon applied once", func(t *testing.T) {
		e := setup()

		const n = 8
		var wg sync.WaitGroup
		results := make([]error, n)
		start := make(chan struct{})
		for i := 0; i < n; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				<-start
				results[i] = e.svc.ApproveVerification(ctx, e.pvID, 1)
			}(i)
		}
		close(start)
		wg.Wait()

		ok, already := 0, 0
		for _, err := range results {
			switch {
			case err == nil:
				ok++
			case errors.Is(err, service.ErrVerificationAlreadyDone):
				already++
			default:
				t.Fatalf("unexpected error: %v", err)
			}
		}
		if ok != 1 || already != n-1 {
			t.Fatalf("expected 1 success and %d already-done, got %d success / %d already-done", n-1, ok, already)
		}

		wantExpiry := e.oldExpiry.AddDate(0, 3, 0)
		gotExpiry := *e.tenantRepo.tenants[600].SubscriptionExpiresAt
		if !gotExpiry.Equal(wantExpiry) {
			t.Fatalf("expected expiry extended exactly once to %v, got %v", wantExpiry, gotExpiry)
		}
		if used := e.couponRepo.coupons[1].UsedCount; used != 1 {
			t.Fatalf("expected coupon used_count 1, got %d", used)
		}
		if len(e.couponRepo.redemptions) != 1 {
			t.Fatalf("expected 1 coupon redemption, got %d", len(e.couponRepo.redemptions))
		}
		if e.pvRepo.verifications[e.pvID].Status != "approved" {
			t.Fatalf("expected verification approved, got %s", e.pvRepo.verifications[e.pvID].Status)
		}
	})

	t.Run("second approve over HTTP returns 409 Conflict", func(t *testing.T) {
		e := setup()
		pvHandler := handler.NewPaymentVerificationHandler(e.svc)
		r := chi.NewRouter()
		r.Group(func(staff chi.Router) {
			staff.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
					next.ServeHTTP(w, req.WithContext(middleware.WithStaffUserID(req.Context(), 1)))
				})
			})
			staff.Patch("/api/staff/payment-verifications/{id}/approve", pvHandler.Approve)
			staff.Patch("/api/staff/payment-verifications/{id}/reject", pvHandler.Reject)
		})

		path := "/api/staff/payment-verifications/" + strconv.FormatUint(e.pvID, 10)
		w1 := httptest.NewRecorder()
		r.ServeHTTP(w1, httptest.NewRequest(http.MethodPatch, path+"/approve", nil))
		w2 := httptest.NewRecorder()
		r.ServeHTTP(w2, httptest.NewRequest(http.MethodPatch, path+"/approve", nil))
		if w1.Code != http.StatusOK || w2.Code != http.StatusConflict {
			t.Fatalf("expected 200 then 409, got %d then %d: %s", w1.Code, w2.Code, w2.Body.String())
		}
	})

	t.Run("failed activation releases the claim back to pending", func(t *testing.T) {
		e := setup()
		delete(e.tenantRepo.tenants, 600) // tenant lookup after the claim fails

		if err := e.svc.ApproveVerification(ctx, e.pvID, 1); err == nil {
			t.Fatalf("expected approve to fail when tenant is missing")
		}
		pv := e.pvRepo.verifications[e.pvID]
		if pv.Status != "pending" || pv.ReviewedBy != nil || pv.ReviewedAt != nil {
			t.Fatalf("expected claim released to pending with reviewer cleared, got status=%s reviewedBy=%v", pv.Status, pv.ReviewedBy)
		}
	})

	t.Run("reject after approve is rejected as already done", func(t *testing.T) {
		e := setup()
		if err := e.svc.ApproveVerification(ctx, e.pvID, 1); err != nil {
			t.Fatalf("approve: %v", err)
		}
		if err := e.svc.RejectVerification(ctx, e.pvID, "nominal salah", 1); !errors.Is(err, service.ErrVerificationAlreadyDone) {
			t.Fatalf("expected ErrVerificationAlreadyDone, got %v", err)
		}
		if e.pvRepo.verifications[e.pvID].Status != "approved" {
			t.Fatalf("approved verification must not flip to rejected")
		}
	})
}
