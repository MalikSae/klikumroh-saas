package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/playbook"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// fakeSubReader returns the subscription of the tenant asked for; unknown tenants are not found.
type fakeSubReader struct {
	byTenant map[uint64]*service.TenantSubscriptionInfo
	err      error
}

func (f *fakeSubReader) GetSubscriptionInfo(_ context.Context, tenantID uint64) (*service.TenantSubscriptionInfo, error) {
	if f.err != nil {
		return nil, f.err
	}
	info, ok := f.byTenant[tenantID]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return info, nil
}

func playbookPeriod(m int) *int { return &m }

// fakeChecks keeps checks per tenant and page, and validates the item id like the real service.
type fakeChecks struct {
	byKey map[string]map[string]bool
}

func newFakeChecks() *fakeChecks { return &fakeChecks{byKey: map[string]map[string]bool{}} }

func (f *fakeChecks) key(tenantID uint64, slug string) string {
	return fmt.Sprintf("%d/%s", tenantID, slug)
}

func (f *fakeChecks) List(_ context.Context, tenantID uint64, slug string) ([]string, error) {
	out := []string{}
	for id := range f.byKey[f.key(tenantID, slug)] {
		out = append(out, id)
	}
	sort.Strings(out)
	return out, nil
}

func (f *fakeChecks) Set(ctx context.Context, tenantID uint64, slug, itemID string, checked bool, _ *uint64) error {
	if !service.ValidPlaybookItemID(itemID) {
		return service.ErrInvalidPlaybookItem
	}
	k := f.key(tenantID, slug)
	if f.byKey[k] == nil {
		f.byKey[k] = map[string]bool{}
	}
	if checked {
		f.byKey[k][itemID] = true
	} else {
		delete(f.byKey[k], itemID)
	}
	return nil
}

func newPlaybookRouter(t *testing.T, subs handler.PlaybookSubscriptionReader) chi.Router {
	return newPlaybookRouterWith(t, subs, newFakeChecks())
}

func newPlaybookRouterWith(t *testing.T, subs handler.PlaybookSubscriptionReader, checks service.PlaybookCheckService) chi.Router {
	t.Helper()
	lib, err := playbook.Load()
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	handler.NewPlaybookHandler(subs, lib, checks).RegisterDashboardRoutes(r)
	return r
}

// playbookGet calls the router as the given tenant (0 means no session).
func playbookGet(r chi.Router, tenantID uint64, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if tenantID != 0 {
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantID))
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestPlaybook_AccessByPlanAndTenant(t *testing.T) {
	const (
		tenant12      = 1
		tenant3       = 2
		tenant6       = 3
		tenantExpired = 4
		tenantDemo    = 5
		tenantMissing = 99
	)
	subs := &fakeSubReader{byTenant: map[uint64]*service.TenantSubscriptionInfo{
		tenant12:      {TenantID: tenant12, IsActive: true, CurrentPlanPeriod: playbookPeriod(12)},
		tenant3:       {TenantID: tenant3, IsActive: true, CurrentPlanPeriod: playbookPeriod(3)},
		tenant6:       {TenantID: tenant6, IsActive: true, CurrentPlanPeriod: playbookPeriod(6)},
		tenantExpired: {TenantID: tenantExpired, IsActive: false, IsSubscriptionExpired: true, GracePeriodDaysRemaining: 2, CurrentPlanPeriod: playbookPeriod(12)},
		tenantDemo:    {TenantID: tenantDemo, IsDemo: true, IsActive: true, CurrentPlanPeriod: playbookPeriod(3)},
	}}
	r := newPlaybookRouter(t, subs)

	cases := []struct {
		name     string
		tenantID uint64
		path     string
		want     int
	}{
		{"12 month list", tenant12, "/api/dashboard/playbook", http.StatusOK},
		{"12 month page", tenant12, "/api/dashboard/playbook/mulai", http.StatusOK},
		{"3 month list", tenant3, "/api/dashboard/playbook", http.StatusForbidden},
		{"3 month page", tenant3, "/api/dashboard/playbook/mulai", http.StatusForbidden},
		{"6 month page", tenant6, "/api/dashboard/playbook/mulai", http.StatusForbidden},
		{"expired 12 month, inside grace", tenantExpired, "/api/dashboard/playbook/mulai", http.StatusForbidden},
		{"demo travel", tenantDemo, "/api/dashboard/playbook/mulai", http.StatusOK},
		{"no session", 0, "/api/dashboard/playbook", http.StatusUnauthorized},
		{"no session page", 0, "/api/dashboard/playbook/mulai", http.StatusUnauthorized},
		{"unknown travel", tenantMissing, "/api/dashboard/playbook", http.StatusNotFound},
		{"unknown slug", tenant12, "/api/dashboard/playbook/tidak-ada", http.StatusNotFound},
		{"slug with dots", tenant12, "/api/dashboard/playbook/..", http.StatusNotFound},
		{"slug uppercase", tenant12, "/api/dashboard/playbook/MULAI", http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := playbookGet(r, tc.tenantID, tc.path)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

// Tenant B (3-month plan) must not read the guide just because tenant A (12-month plan) can, and a locked
// answer carries the code the dashboard uses to show the offer.
func TestPlaybook_CrossTenantAndLockedCode(t *testing.T) {
	subs := &fakeSubReader{byTenant: map[uint64]*service.TenantSubscriptionInfo{
		1: {TenantID: 1, IsActive: true, CurrentPlanPeriod: playbookPeriod(12)},
		2: {TenantID: 2, IsActive: true, CurrentPlanPeriod: playbookPeriod(3)},
	}}
	r := newPlaybookRouter(t, subs)

	if rec := playbookGet(r, 1, "/api/dashboard/playbook/mulai"); rec.Code != http.StatusOK {
		t.Fatalf("tenant A status = %d, want 200", rec.Code)
	}
	rec := playbookGet(r, 2, "/api/dashboard/playbook/mulai")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("tenant B status = %d, want 403", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["code"] != "playbook_locked" {
		t.Fatalf("code = %q, want playbook_locked", body["code"])
	}
	if _, leaked := body["blocks"]; leaked {
		t.Fatal("a locked answer must not carry page content")
	}
}

func TestPlaybook_ContentShapeAndNoStore(t *testing.T) {
	subs := &fakeSubReader{byTenant: map[uint64]*service.TenantSubscriptionInfo{
		1: {TenantID: 1, IsActive: true, CurrentPlanPeriod: playbookPeriod(12)},
	}}
	r := newPlaybookRouter(t, subs)

	rec := playbookGet(r, 1, "/api/dashboard/playbook")
	if cc := rec.Header().Get("Cache-Control"); cc != "private, no-store" {
		t.Fatalf("Cache-Control = %q", cc)
	}
	var list struct {
		Pages []struct {
			Slug  string `json:"slug"`
			Title string `json:"title"`
		} `json:"pages"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Pages) == 0 || list.Pages[0].Slug == "" {
		t.Fatalf("empty index: %s", rec.Body.String())
	}

	rec = playbookGet(r, 1, "/api/dashboard/playbook/"+list.Pages[0].Slug)
	var page struct {
		Title  string `json:"title"`
		Blocks []struct {
			Type string `json:"type"`
		} `json:"blocks"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if page.Title == "" || len(page.Blocks) == 0 {
		t.Fatalf("page has no content: %s", rec.Body.String())
	}
}

func TestPlaybook_ServiceErrorIsGeneric(t *testing.T) {
	r := newPlaybookRouter(t, &fakeSubReader{err: context.DeadlineExceeded})
	rec := playbookGet(r, 1, "/api/dashboard/playbook")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
}

// playbookCall sends a request as the given tenant (0 means no session).
func playbookCall(r chi.Router, tenantID uint64, method, path string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	if tenantID != 0 {
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantID))
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func checkedIDs(t *testing.T, rec *httptest.ResponseRecorder) []string {
	t.Helper()
	var out struct {
		Checked []string `json:"checked"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("bad body %s: %v", rec.Body.String(), err)
	}
	return out.Checked
}

func TestPlaybookChecks_RoundTripAndTenantIsolation(t *testing.T) {
	subs := &fakeSubReader{byTenant: map[uint64]*service.TenantSubscriptionInfo{
		1: {TenantID: 1, IsActive: true, CurrentPlanPeriod: playbookPeriod(12)},
		2: {TenantID: 2, IsActive: true, CurrentPlanPeriod: playbookPeriod(12)},
	}}
	r := newPlaybookRouter(t, subs)
	const path = "/api/dashboard/playbook/mulai/checks"

	if rec := playbookCall(r, 1, http.MethodPut, path, map[string]any{"item_id": "3:abc12", "checked": true}); rec.Code != http.StatusOK {
		t.Fatalf("check status = %d: %s", rec.Code, rec.Body.String())
	}
	if rec := playbookCall(r, 1, http.MethodPut, path, map[string]any{"item_id": "3:abc12", "checked": true}); rec.Code != http.StatusOK {
		t.Fatalf("repeat check must be fine, status = %d", rec.Code)
	}
	if got := checkedIDs(t, playbookCall(r, 1, http.MethodGet, path, nil)); len(got) != 1 || got[0] != "3:abc12" {
		t.Fatalf("tenant 1 sees %v, want [3:abc12]", got)
	}
	// CRITICAL: tenant 2 (also on a 12-month plan) must not see tenant 1's checks, nor remove them.
	if got := checkedIDs(t, playbookCall(r, 2, http.MethodGet, path, nil)); len(got) != 0 {
		t.Fatalf("tenant 2 sees tenant 1's checks: %v", got)
	}
	playbookCall(r, 2, http.MethodPut, path, map[string]any{"item_id": "3:abc12", "checked": false})
	if got := checkedIDs(t, playbookCall(r, 1, http.MethodGet, path, nil)); len(got) != 1 {
		t.Fatalf("tenant 2 unchecking removed tenant 1's check: %v", got)
	}
	playbookCall(r, 1, http.MethodPut, path, map[string]any{"item_id": "3:abc12", "checked": false})
	if got := checkedIDs(t, playbookCall(r, 1, http.MethodGet, path, nil)); len(got) != 0 {
		t.Fatalf("uncheck did not clear: %v", got)
	}
}

func TestPlaybookChecks_AccessAndValidation(t *testing.T) {
	subs := &fakeSubReader{byTenant: map[uint64]*service.TenantSubscriptionInfo{
		1: {TenantID: 1, IsActive: true, CurrentPlanPeriod: playbookPeriod(12)},
		3: {TenantID: 3, IsActive: true, CurrentPlanPeriod: playbookPeriod(3)},
	}}
	r := newPlaybookRouter(t, subs)
	const path = "/api/dashboard/playbook/mulai/checks"
	ok := map[string]any{"item_id": "1:zz", "checked": true}

	cases := []struct {
		name   string
		tenant uint64
		method string
		path   string
		body   any
		want   int
	}{
		{"3 month list", 3, http.MethodGet, path, nil, http.StatusForbidden},
		{"3 month set", 3, http.MethodPut, path, ok, http.StatusForbidden},
		{"no session list", 0, http.MethodGet, path, nil, http.StatusUnauthorized},
		{"no session set", 0, http.MethodPut, path, ok, http.StatusUnauthorized},
		{"unknown page list", 1, http.MethodGet, "/api/dashboard/playbook/tidak-ada/checks", nil, http.StatusNotFound},
		{"unknown page set", 1, http.MethodPut, "/api/dashboard/playbook/tidak-ada/checks", ok, http.StatusNotFound},
		{"item id with sql", 1, http.MethodPut, path, map[string]any{"item_id": "1:a' OR 1=1", "checked": true}, http.StatusBadRequest},
		{"item id too long", 1, http.MethodPut, path, map[string]any{"item_id": "1:aaaaaaaaaaaaaaaaaaaaaaaa", "checked": true}, http.StatusBadRequest},
		{"item id no index", 1, http.MethodPut, path, map[string]any{"item_id": "abc", "checked": true}, http.StatusBadRequest},
		{"empty item id", 1, http.MethodPut, path, map[string]any{"checked": true}, http.StatusBadRequest},
		{"valid", 1, http.MethodPut, path, ok, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := playbookCall(r, tc.tenant, tc.method, tc.path, tc.body)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}
