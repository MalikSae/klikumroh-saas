package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

func staffPatch(r http.Handler, path, body string) *httptest.ResponseRecorder {
	var rdr *bytes.Reader
	if body != "" {
		rdr = bytes.NewReader([]byte(body))
	} else {
		rdr = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(http.MethodPatch, path, rdr)
	req.Header.Set("Authorization", "Bearer valid-staff-token")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func errorOf(rr *httptest.ResponseRecorder) string {
	var m map[string]string
	_ = json.Unmarshal(rr.Body.Bytes(), &m)
	return m["error"]
}

// M1: an invoice above Rp 0 without a transfer proof cannot be approved (409); a free invoice can.
func TestApprove_RequiresProofWhenAmountDue(t *testing.T) {
	_, pvRepo, _, tenantRepo, _, _, r := setupSubTestEnv()
	ctx := context.Background()

	noProof := &repository.PaymentVerification{TenantID: 78, PlanID: 1, Amount: 1500000, FinalAmount: 1500123, UniqueCode: 123, Status: "pending"}
	_ = pvRepo.Create(ctx, noProof)
	rr := staffPatch(r, fmt.Sprintf("/api/staff/payment-verifications/%d/approve", noProof.ID), "")
	if rr.Code != http.StatusConflict {
		t.Fatalf("no proof: expected 409, got %d (%s)", rr.Code, rr.Body.String())
	}
	if got := errorOf(rr); got != "Bukti transfer belum diunggah. Tagihan di atas Rp 0 hanya bisa disetujui setelah ada bukti transfer." {
		t.Fatalf("unexpected message %q", got)
	}
	if got, _ := pvRepo.GetByID(ctx, noProof.ID); got.Status != "pending" {
		t.Fatalf("refused invoice must stay pending, got %q", got.Status)
	}
	if tenantRepo.tenants[78].SubscriptionExpiresAt != nil {
		t.Fatal("subscription must not be extended")
	}

	free := &repository.PaymentVerification{TenantID: 53, PlanID: 1, Amount: 1500000, FinalAmount: 0, Status: "pending"}
	_ = pvRepo.Create(ctx, free)
	if rr := staffPatch(r, fmt.Sprintf("/api/staff/payment-verifications/%d/approve", free.ID), ""); rr.Code != http.StatusOK {
		t.Fatalf("free invoice without proof: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
}

// M1: with {"expected_plan_id","expected_final_amount"} the approval is refused (409) when the invoice no
// longer matches what staff reviewed, and goes through when it matches.
func TestApprove_ExpectedPlanAndAmount(t *testing.T) {
	_, pvRepo, _, tenantRepo, _, _, r := setupSubTestEnv()
	ctx := context.Background()

	pv := &repository.PaymentVerification{TenantID: 78, PlanID: 2, Amount: 2700000, FinalAmount: 2700456, UniqueCode: 456, Status: "pending", ProofURL: testProofURL()}
	_ = pvRepo.Create(ctx, pv)
	path := fmt.Sprintf("/api/staff/payment-verifications/%d/approve", pv.ID)

	cases := []struct{ name, body string }{
		{"plan differs", `{"expected_plan_id": 1, "expected_final_amount": 2700456}`},
		{"amount differs", `{"expected_plan_id": 2, "expected_final_amount": 1500123}`},
		{"amount only differs", `{"expected_final_amount": 2700455}`},
	}
	for _, c := range cases {
		rr := staffPatch(r, path, c.body)
		if rr.Code != http.StatusConflict {
			t.Fatalf("%s: expected 409, got %d (%s)", c.name, rr.Code, rr.Body.String())
		}
		if got := errorOf(rr); got != "Tagihan sudah diubah oleh travel. Muat ulang lalu periksa lagi." {
			t.Fatalf("%s: unexpected message %q", c.name, got)
		}
	}
	if got, _ := pvRepo.GetByID(ctx, pv.ID); got.Status != "pending" {
		t.Fatalf("refused invoice must stay pending, got %q", got.Status)
	}

	if rr := staffPatch(r, path, `{bad json`); rr.Code != http.StatusBadRequest {
		t.Fatalf("malformed body: expected 400, got %d", rr.Code)
	}

	rr := staffPatch(r, path, `{"expected_plan_id": 2, "expected_final_amount": 2700456}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("matching expectation: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	exp := tenantRepo.tenants[78].SubscriptionExpiresAt
	if exp == nil {
		t.Fatal("subscription must be extended")
	}
	// Plan 2 is 6 months.
	if want := time.Now().AddDate(0, 6, 0); exp.Before(want.AddDate(0, 0, -4)) || exp.After(want.AddDate(0, 0, 1)) {
		t.Fatalf("expected ~6 months, got %v", exp)
	}
}

// racyPVRepo simulates the travel replacing the invoice (ReplaceDetails) in the window between the
// service reading the invoice and claiming it.
type racyPVRepo struct {
	*mockPVRepo
	raced bool
}

func (m *racyPVRepo) GetByID(ctx context.Context, id uint64) (*repository.PaymentVerification, error) {
	pv, err := m.mockPVRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	cp := *pv // a real repository returns a fresh copy on every read
	return &cp, nil
}

func (m *racyPVRepo) TransitionStatus(ctx context.Context, id uint64, from, to string, reason *string, by *uint64, at *time.Time) error {
	if !m.raced && from == "pending" && to == "approved" {
		m.raced = true
		pv := m.mockPVRepo.verifications[id]
		pv.PlanID, pv.Amount, pv.FinalAmount = 2, 2700000, 2700456
	}
	return m.mockPVRepo.TransitionStatus(ctx, id, from, to, reason, by, at)
}

// M1: a change landing between the read and the claim is detected after the claim: the approval is
// refused with ErrVerificationChanged, the claim is released and the subscription is untouched.
func TestApprove_ChangeBetweenReadAndClaim(t *testing.T) {
	couponRepo, basePV, planRepo, tenantRepo, _, _, _ := setupSubTestEnv()
	pvRepo := &racyPVRepo{mockPVRepo: basePV}
	ctx := context.Background()

	pv := &repository.PaymentVerification{TenantID: 78, PlanID: 1, Amount: 1500000, FinalAmount: 1500123, UniqueCode: 123, Status: "pending", ProofURL: testProofURL()}
	_ = basePV.Create(ctx, pv)

	svc := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenantRepo)
	err := svc.ApproveVerification(ctx, pv.ID, 1)
	if !errors.Is(err, service.ErrVerificationChanged) {
		t.Fatalf("expected ErrVerificationChanged, got %v", err)
	}
	if got := basePV.verifications[pv.ID]; got.Status != "pending" {
		t.Fatalf("claim must be released, status %q", got.Status)
	}
	if tenantRepo.tenants[78].SubscriptionExpiresAt != nil {
		t.Fatal("subscription must not be extended")
	}

	// Approving again now uses the new row (plan 2, 6 months).
	if err := svc.ApproveVerification(ctx, pv.ID, 1); err != nil {
		t.Fatalf("second approve: %v", err)
	}
	exp := tenantRepo.tenants[78].SubscriptionExpiresAt
	if want := time.Now().AddDate(0, 6, 0); exp == nil || exp.Before(want.AddDate(0, 0, -4)) || exp.After(want.AddDate(0, 0, 1)) {
		t.Fatalf("expected ~6 months from plan 2, got %v", exp)
	}
}

// M3: the period of a plan cannot change while an invoice for that plan is pending; name and price can.
func TestPricingPlanUpdate_PeriodLockedByPendingInvoice(t *testing.T) {
	_, pvRepo, planRepo, _, staffRepo, sessionRepo, _ := setupSubTestEnv()
	ctx := context.Background()

	ppHandler := handler.NewPricingPlanHandler(service.NewPricingPlanService(planRepo, pvRepo))
	r := chi.NewRouter()
	r.Group(func(sp chi.Router) {
		sp.Use(middleware.StaffAuthMiddleware(staffRepo, sessionRepo))
		sp.Put("/api/staff/pricing-plans/{id}", ppHandler.Update)
	})
	put := func(id uint64, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/staff/pricing-plans/%d", id), bytes.NewReader([]byte(body)))
		req.Header.Set("Authorization", "Bearer valid-staff-token")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		return rr
	}

	pending := &repository.PaymentVerification{TenantID: 53, PlanID: 2, Amount: 2700000, FinalAmount: 2700456, Status: "pending"}
	_ = pvRepo.Create(ctx, pending)

	rr := put(2, `{"name":"Paket 6 Bulan","period_months":12,"price":2700000}`)
	if rr.Code != http.StatusConflict {
		t.Fatalf("period change with pending invoice: expected 409, got %d (%s)", rr.Code, rr.Body.String())
	}
	if planRepo.plans[2].PeriodMonths != 6 {
		t.Fatalf("period must stay 6, got %d", planRepo.plans[2].PeriodMonths)
	}
	if rr := put(2, `{"name":"Paket Semester","period_months":6,"price":2500000}`); rr.Code != http.StatusOK {
		t.Fatalf("name/price change: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	// Plan 1 has no pending invoice: its period can change.
	if rr := put(1, `{"name":"Paket 4 Bulan","period_months":4,"price":1500000}`); rr.Code != http.StatusOK {
		t.Fatalf("plan without pending invoices: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	// Once the invoice is no longer pending, the period of plan 2 can change.
	pending.Status = "rejected"
	if rr := put(2, `{"name":"Paket Semester","period_months":12,"price":2500000}`); rr.Code != http.StatusOK {
		t.Fatalf("after invoice handled: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
}

// Plan price is capped (Rp 1 miliar): an absurd value is a 400, not a database error, on create and update.
func TestPricingPlan_PriceUpperBound(t *testing.T) {
	_, pvRepo, planRepo, _, staffRepo, sessionRepo, _ := setupSubTestEnv()

	ppHandler := handler.NewPricingPlanHandler(service.NewPricingPlanService(planRepo, pvRepo))
	r := chi.NewRouter()
	r.Group(func(sp chi.Router) {
		sp.Use(middleware.StaffAuthMiddleware(staffRepo, sessionRepo))
		sp.Post("/api/staff/pricing-plans", ppHandler.Create)
		sp.Put("/api/staff/pricing-plans/{id}", ppHandler.Update)
	})
	send := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
		req.Header.Set("Authorization", "Bearer valid-staff-token")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		return rr
	}

	for _, price := range []string{"1000000001", "1e300"} {
		body := `{"name":"Paket Mahal","period_months":6,"price":` + price + `}`
		if rr := send(http.MethodPost, "/api/staff/pricing-plans", body); rr.Code != http.StatusBadRequest {
			t.Fatalf("create price %s: expected 400, got %d (%s)", price, rr.Code, rr.Body.String())
		}
		if rr := send(http.MethodPut, "/api/staff/pricing-plans/2", body); rr.Code != http.StatusBadRequest {
			t.Fatalf("update price %s: expected 400, got %d (%s)", price, rr.Code, rr.Body.String())
		}
	}
	if planRepo.plans[2].Price > service.MaxPlanPrice {
		t.Fatalf("plan price must stay unchanged, got %.0f", planRepo.plans[2].Price)
	}
	// The cap itself is allowed.
	if rr := send(http.MethodPut, "/api/staff/pricing-plans/2", `{"name":"Paket Batas","period_months":6,"price":1000000000}`); rr.Code != http.StatusOK {
		t.Fatalf("price at the cap: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
}
