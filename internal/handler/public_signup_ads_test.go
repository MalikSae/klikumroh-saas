package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Ad attribution + Lead event at travel signup (KlikUmroh's own Meta Pixel).

type fakeAdAttributionRepo struct {
	mu   sync.Mutex
	rows map[uint64]*repository.TenantAdAttribution
}

func (f *fakeAdAttributionRepo) Save(_ context.Context, a *repository.TenantAdAttribution) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.rows[a.TenantID]; !ok {
		f.rows[a.TenantID] = a
	}
	return nil
}
func (f *fakeAdAttributionRepo) Get(_ context.Context, tenantID uint64) (*repository.TenantAdAttribution, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if a, ok := f.rows[tenantID]; ok {
		return a, nil
	}
	return nil, repository.ErrNotFound
}
func (f *fakeAdAttributionRepo) ClaimPurchaseSend(context.Context, uint64) (bool, error) {
	return false, nil
}
func (f *fakeAdAttributionRepo) ReleasePurchaseSend(context.Context, uint64) error { return nil }

type recordingLeadTracker struct {
	mu     sync.Mutex
	events []service.PlatformLeadEvent
}

func (r *recordingLeadTracker) TrackLead(ev service.PlatformLeadEvent) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, ev)
}

func signupWithAds(t *testing.T, ad map[string]interface{}) (*httptest.ResponseRecorder, *fakeAdAttributionRepo, *recordingLeadTracker, *mockTenantRepoPublic) {
	t.Helper()
	tenantRepo := newMockTenantRepoPublic()
	adminUserRepo := &mockAdminUserRepo{users: make(map[string]*repository.AdminUser)}
	planRepo := newMockPlanRepoPublic()
	planRepo.plans[1] = &repository.PricingPlan{ID: 1, Name: "Standard Bulanan", PeriodMonths: 1, Price: 500000}
	couponRepo := newMockCouponRepo()

	svc := service.NewPublicSignupService(tenantRepo, adminUserRepo, planRepo, service.NewCouponService(couponRepo), newMockPVRepo())
	attribution := &fakeAdAttributionRepo{rows: map[uint64]*repository.TenantAdAttribution{}}
	tracker := &recordingLeadTracker{}
	svc.(interface {
		SetAdTracking(repository.TenantAdAttributionRepository, service.PlatformLeadTracker)
	}).SetAdTracking(attribution, tracker)

	h := handler.NewPublicSignupHandler(svc, service.NewPricingPlanService(planRepo), service.NewCouponService(couponRepo))
	r := chi.NewRouter()
	h.RegisterPublicRoutes(r)

	payload := map[string]interface{}{
		"travel_name": "Travel Iklan", "slug": "travel-iklan", "admin_name": "Budi Santoso",
		"admin_email": "budi@travel-iklan.id", "admin_password": "Password123",
		"admin_whatsapp": "081234567890", "plan_id": 1,
	}
	if ad != nil {
		payload["ad_context"] = ad
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/public/tenant-signup", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "TestAgent/1.0")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w, attribution, tracker, tenantRepo
}

func TestPublicSignup_AdAttributionAndLeadEvent(t *testing.T) {
	w, attribution, tracker, _ := signupWithAds(t, map[string]interface{}{
		"fbp":              "fb.1.1700000000000.1234567890",
		"fbc":              "not-a-valid-cookie",
		"fbclid":           "IwAR-click_123",
		"utm_source":       "facebook",
		"utm_campaign":     "umroh-oct",
		"event_source_url": "https://klikumroh.id/checkout?utm_source=facebook#frag",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var res service.TenantSignupResult
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if res.MetaEventID == "" {
		t.Fatalf("response must carry the Lead event ID for browser deduplication")
	}

	row, err := attribution.Get(context.Background(), res.TenantID)
	if err != nil {
		t.Fatalf("attribution row missing: %v", err)
	}
	if row.Fbp == nil || *row.Fbp != "fb.1.1700000000000.1234567890" {
		t.Fatalf("fbp must be stored, got %v", row.Fbp)
	}
	// Invalid fbc is dropped, then rebuilt from the fbclid in Meta's documented format.
	if row.Fbc == nil || !strings.HasPrefix(*row.Fbc, "fb.1.") || !strings.HasSuffix(*row.Fbc, ".IwAR-click_123") {
		t.Fatalf("fbc must be rebuilt from fbclid, got %v", row.Fbc)
	}
	if row.UTMSource == nil || *row.UTMSource != "facebook" || row.UTMCampaign == nil || *row.UTMCampaign != "umroh-oct" {
		t.Fatalf("utm values must be stored: %+v", row)
	}
	if row.EventSourceURL == nil || strings.Contains(*row.EventSourceURL, "#") {
		t.Fatalf("source URL must be stored without fragment, got %v", row.EventSourceURL)
	}
	if row.UserAgent == nil || *row.UserAgent != "TestAgent/1.0" {
		t.Fatalf("user agent must come from the request, got %v", row.UserAgent)
	}
	if row.LeadEventID == nil || *row.LeadEventID != res.MetaEventID {
		t.Fatalf("stored event ID must match the response")
	}

	if len(tracker.events) != 1 {
		t.Fatalf("expected 1 Lead event, got %d", len(tracker.events))
	}
	ev := tracker.events[0]
	if ev.EventID != res.MetaEventID || ev.User.Email != "budi@travel-iklan.id" || ev.User.Phone != "6281234567890" {
		t.Fatalf("lead event mismatch: %+v", ev)
	}
	if ev.User.Fbp == "" || ev.User.Fbc == "" || ev.User.UserAgent != "TestAgent/1.0" || ev.ContentName != "Standard Bulanan" {
		t.Fatalf("lead event must carry matching data: %+v", ev)
	}
}

func TestPublicSignup_AdContextOptionalAndUntrustedFieldsDropped(t *testing.T) {
	// No ad context at all: signup works, row and Lead still created.
	w, attribution, tracker, _ := signupWithAds(t, nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 without ad context, got %d: %s", w.Code, w.Body.String())
	}
	var res service.TenantSignupResult
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if _, err := attribution.Get(context.Background(), res.TenantID); err != nil {
		t.Fatalf("row must exist without ad context (purchase claim needs it): %v", err)
	}
	if len(tracker.events) != 1 {
		t.Fatalf("expected 1 Lead event, got %d", len(tracker.events))
	}

	// Garbage values are dropped, never fail the signup.
	w, attribution, _, _ = signupWithAds(t, map[string]interface{}{
		"fbp": "<script>", "fbc": "x", "fbclid": "bad value with spaces", "event_source_url": "javascript:alert(1)",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("garbage ad context must not block signup, got %d: %s", w.Code, w.Body.String())
	}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	row, _ := attribution.Get(context.Background(), res.TenantID)
	if row.Fbp != nil || row.Fbc != nil || row.Fbclid != nil || row.EventSourceURL != nil {
		t.Fatalf("invalid values must be dropped: %+v", row)
	}
}
