package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type mockDashboardOverviewService struct {
	getOverviewFunc func(ctx context.Context, tenantID uint64) (*service.DashboardOverviewResponse, error)
}

func (m *mockDashboardOverviewService) GetOverview(ctx context.Context, tenantID uint64) (*service.DashboardOverviewResponse, error) {
	if m.getOverviewFunc != nil {
		return m.getOverviewFunc(ctx, tenantID)
	}
	return &service.DashboardOverviewResponse{
		UrgentAlerts: repository.UrgentAlertsData{
			UncontactedProspectsCount: 3,
			PendingPayoutsCount:        1,
			PendingPayoutsTotal:        1500000,
		},
		KPIs: service.OverviewKPIsDTO{
			TotalProspects:              10,
			TotalClosingJamaah:          4,
			ClosingRate:                 40.0,
			AgentContributionPercentage: 60.0,
		},
	}, nil
}

func TestDashboardOverviewHandler_GetOverview(t *testing.T) {
	t.Run("Unauthorized if no tenant in context", func(t *testing.T) {
		h := handler.NewDashboardOverviewHandler(&mockDashboardOverviewService{})
		r := chi.NewRouter()
		h.RegisterDashboardRoutes(r)

		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/overview", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized, got %d", rec.Code)
		}
	})

	t.Run("Success with valid tenant context", func(t *testing.T) {
		var receivedTenantID uint64
		mockSvc := &mockDashboardOverviewService{
			getOverviewFunc: func(ctx context.Context, tenantID uint64) (*service.DashboardOverviewResponse, error) {
				receivedTenantID = tenantID
				return &service.DashboardOverviewResponse{
					UrgentAlerts: repository.UrgentAlertsData{
						UncontactedProspectsCount: 5,
					},
					KPIs: service.OverviewKPIsDTO{
						TotalProspects: 20,
						ClosingRate:    25.0,
					},
				}, nil
			},
		}

		h := handler.NewDashboardOverviewHandler(mockSvc)
		r := chi.NewRouter()
		h.RegisterDashboardRoutes(r)

		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/overview", nil)
		ctx := middleware.WithTenantID(req.Context(), 42)
		req = req.WithContext(ctx)

		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		if receivedTenantID != 42 {
			t.Errorf("expected tenantID 42, got %d", receivedTenantID)
		}

		var res service.DashboardOverviewResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if res.UrgentAlerts.UncontactedProspectsCount != 5 {
			t.Errorf("expected 5 uncontacted prospects, got %d", res.UrgentAlerts.UncontactedProspectsCount)
		}
		if res.KPIs.TotalProspects != 20 {
			t.Errorf("expected 20 total prospects, got %d", res.KPIs.TotalProspects)
		}
	})
}
