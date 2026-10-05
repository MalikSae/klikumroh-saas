package handler_test

import (
	"context"
	"encoding/json"
	"errors"
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

// stubStaffPayoutService implements only StaffRequestPayout; any other method panics (nil embedded interface).
type stubStaffPayoutService struct {
	service.AffiliatorService
	payout     *repository.AffiliatorPayout
	err        error
	gotID      uint64
	gotStaffID uint64
}

func (s *stubStaffPayoutService) StaffRequestPayout(_ context.Context, affiliatorID, staffUserID uint64) (*repository.AffiliatorPayout, error) {
	s.gotID, s.gotStaffID = affiliatorID, staffUserID
	return s.payout, s.err
}

// The staff payout endpoint maps each service outcome to the contract's status code and message.
func TestAffiliatorHandler_StaffRequestPayout_StatusCodes(t *testing.T) {
	created := time.Date(2026, 10, 5, 10, 0, 0, 0, time.UTC)
	payout := &repository.AffiliatorPayout{ID: 77, AffiliatorID: 12, AffiliatorName: "Affiliator X", Amount: 50000.45,
		Status: "pending", BankName: "BSI", BankAccountNumber: "123", BankAccountHolder: "X", CreatedAt: created}

	cases := []struct {
		name     string
		path     string
		payout   *repository.AffiliatorPayout
		err      error
		wantCode int
		wantErr  string
	}{
		{"created", "/api/staff/affiliators/12/payouts", payout, nil, http.StatusCreated, ""},
		{"affiliator not found", "/api/staff/affiliators/12/payouts", nil, repository.ErrNotFound, http.StatusNotFound, "affiliator tidak ditemukan"},
		{"pending payout exists", "/api/staff/affiliators/12/payouts", nil, service.ErrStaffPayoutPending, http.StatusConflict,
			"Masih ada pencairan yang sedang diproses untuk affiliator ini."},
		{"zero balance", "/api/staff/affiliators/12/payouts", nil, service.ErrStaffPayoutNothingAvailable, http.StatusBadRequest,
			"Tidak ada komisi yang bisa dicairkan."},
		{"bank missing", "/api/staff/affiliators/12/payouts", nil, service.ErrStaffPayoutBankMissing, http.StatusBadRequest,
			"Data rekening affiliator belum lengkap."},
		{"unexpected error", "/api/staff/affiliators/12/payouts", nil, errors.New("db down"), http.StatusInternalServerError, "internal server error"},
		{"invalid id", "/api/staff/affiliators/abc/payouts", nil, nil, http.StatusBadRequest, "ID tidak valid"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stub := &stubStaffPayoutService{payout: tc.payout, err: tc.err}
			r := chi.NewRouter()
			r.Group(func(g chi.Router) {
				g.Use(func(next http.Handler) http.Handler {
					return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
						next.ServeHTTP(w, req.WithContext(middleware.WithStaffUserID(req.Context(), 9)))
					})
				})
				handler.NewAffiliatorHandler(stub).RegisterStaffRoutes(g)
			})
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, tc.path, nil))
			if w.Code != tc.wantCode {
				t.Fatalf("expected %d, got %d: %s", tc.wantCode, w.Code, w.Body.String())
			}
			if tc.wantCode == http.StatusCreated {
				if stub.gotID != 12 || stub.gotStaffID != 9 {
					t.Fatalf("expected affiliator 12 by staff 9, got %d by %d", stub.gotID, stub.gotStaffID)
				}
				var got map[string]any
				if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
					t.Fatalf("parse: %v", err)
				}
				for _, k := range []string{"id", "affiliator_id", "affiliator_name", "amount", "status", "bank_name",
					"bank_account_number", "bank_account_holder", "rejection_reason", "reviewed_by", "reviewed_at", "created_at"} {
					if _, ok := got[k]; !ok {
						t.Fatalf("payout JSON misses %q: %s", k, w.Body.String())
					}
				}
				if got["amount"] != 50000.45 || got["status"] != "pending" {
					t.Fatalf("unexpected payout JSON: %s", w.Body.String())
				}
				return
			}
			var body map[string]string
			_ = json.Unmarshal(w.Body.Bytes(), &body)
			if body["error"] != tc.wantErr {
				t.Fatalf("expected error %q, got %q", tc.wantErr, body["error"])
			}
		})
	}
}
