package handler_test

import (
	"context"
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

// stubPortalPayoutService implements only the affiliator's own payout methods; anything else panics.
type stubPortalPayoutService struct {
	service.AffiliatorService
	payout repository.AffiliatorPayout
}

func (s *stubPortalPayoutService) ListPayouts(_ context.Context, _ uint64) ([]repository.AffiliatorPayout, error) {
	return []repository.AffiliatorPayout{s.payout}, nil
}

func (s *stubPortalPayoutService) RequestPayout(_ context.Context, _ uint64) (*repository.AffiliatorPayout, error) {
	p := s.payout
	return &p, nil
}

// The affiliator portal never sees which staff requested a payout on its behalf: GET and POST
// /api/affiliator/payouts leave out requested_by_staff_id and requested_by_staff_name, while the staff
// endpoints keep them.
func TestAffiliatorHandler_PortalPayoutsHideStaff(t *testing.T) {
	staffID := uint64(9)
	staffName := "Nama Staf Rahasia"
	stub := &stubPortalPayoutService{payout: repository.AffiliatorPayout{ID: 5, AffiliatorID: 12, Amount: 40000, Status: "pending",
		BankName: "BSI", BankAccountNumber: "123", BankAccountHolder: "X", RequestedByStaffID: &staffID,
		RequestedByStaffName: &staffName, CreatedAt: time.Date(2026, 10, 6, 9, 0, 0, 0, time.UTC)}}

	r := chi.NewRouter()
	r.Group(func(g chi.Router) {
		g.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				next.ServeHTTP(w, req.WithContext(middleware.WithAffiliatorID(req.Context(), 12)))
			})
		})
		handler.NewAffiliatorHandler(stub).RegisterProtectedRoutes(g)
	})

	for _, method := range []string{http.MethodGet, http.MethodPost} {
		t.Run(method, func(t *testing.T) {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(method, "/api/affiliator/payouts", nil))
			if w.Code != http.StatusOK && w.Code != http.StatusCreated {
				t.Fatalf("unexpected status %d: %s", w.Code, w.Body.String())
			}
			body := w.Body.String()
			if !strings.Contains(body, `"id":5`) || !strings.Contains(body, `"bank_account_holder":"X"`) {
				t.Fatalf("payout missing from response: %s", body)
			}
			if strings.Contains(body, "requested_by_staff") || strings.Contains(body, staffName) {
				t.Fatalf("SECURITY VIOLATION: portal payout JSON exposes staff data: %s", body)
			}
		})
	}
}
