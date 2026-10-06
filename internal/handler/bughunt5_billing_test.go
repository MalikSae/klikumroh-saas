package handler_test

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/service"
)

// Bug hunt putaran 5 (M1 coupon limiter bypass): POST /api/dashboard/subscription/renewal-request is mounted
// with the SAME limiter instances as GET /api/dashboard/coupons/validate (cmd/api/main.go), so coupon
// guesses through either route share one budget of 20 per minute per travel and per IP.
func TestBugHunt5_RenewalRequestSharesCouponLimit(t *testing.T) {
	coupons := newMockCouponRepo()
	ch := handler.NewCouponHandler(service.NewCouponService(coupons))
	renewal := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest) // "kupon tidak ditemukan"
	})
	r := chi.NewRouter()
	r.Route("/t/{tenant}", func(sub chi.Router) {
		sub.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				var id uint64
				_, _ = fmt.Sscan(chi.URLParam(req, "tenant"), &id)
				next.ServeHTTP(w, req.WithContext(middleware.WithTenantID(req.Context(), id)))
			})
		})
		// Same wiring as main.go.
		sub.With(ch.TravelValidateLimiters()...).Get("/api/dashboard/coupons/validate", ch.ValidateTravel)
		sub.With(ch.TravelValidateLimiters()...).Post("/api/dashboard/subscription/renewal-request", renewal)
	})
	call := func(method, path string, tenant uint64, ip string) int {
		req := httptest.NewRequest(method, fmt.Sprintf("/t/%d%s", tenant, path), nil)
		req.RemoteAddr = net.JoinHostPort(ip, "5000")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec.Code
	}
	for i := 0; i < 10; i++ {
		if code := call(http.MethodGet, "/api/dashboard/coupons/validate?code=NOPE", 80, fmt.Sprintf("198.51.100.%d", i+1)); code != http.StatusBadRequest {
			t.Fatalf("validate %d: expected 400, got %d", i+1, code)
		}
		if code := call(http.MethodPost, "/api/dashboard/subscription/renewal-request", 80, fmt.Sprintf("198.51.100.%d", i+101)); code != http.StatusBadRequest {
			t.Fatalf("renewal %d: expected 400, got %d", i+1, code)
		}
	}
	code := call(http.MethodPost, "/api/dashboard/subscription/renewal-request", 80, "198.51.100.250")
	t.Logf("21st coupon attempt of the travel (renewal-request, new IP): %d", code)
	if code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 once validate + renewal reach 20, got %d", code)
	}
	if code := call(http.MethodPost, "/api/dashboard/subscription/renewal-request", 81, "198.51.100.251"); code != http.StatusBadRequest {
		t.Fatalf("another travel must not be limited, got %d", code)
	}
}
