package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// memoryDemoLeads is an in-memory DemoLeadRepository for the handler tests.
type memoryDemoLeads struct {
	mu    sync.Mutex
	items map[string]*repository.DemoLead
}

func (m *memoryDemoLeads) Upsert(_ context.Context, lead *repository.DemoLead) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.items[lead.Phone]; ok {
		existing.VisitCount++
		existing.Name, existing.TravelName, existing.City = lead.Name, lead.TravelName, lead.City
		return nil
	}
	copied := *lead
	copied.VisitCount = 1
	m.items[lead.Phone] = &copied
	return nil
}

func (m *memoryDemoLeads) List(context.Context, int) ([]repository.DemoLead, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []repository.DemoLead{}
	for _, l := range m.items {
		out = append(out, *l)
	}
	return out, nil
}

// The demo asks for a short form first: nothing opens without it, a valid one signs in and is recorded.
func TestDemoLogin_RequiresLeadForm(t *testing.T) {
	tenantRepo := newMockTenantRepo()
	demo := &repository.Tenant{Name: "Travel Demo", Slug: "demo", Status: "active", IsDemo: true}
	_ = tenantRepo.Create(context.Background(), demo)
	adminUsers := &mockAdminUserRepo{users: map[string]*repository.AdminUser{
		"admin@demo.id": {ID: 1, TenantID: demo.ID, Email: "admin@demo.id", Name: "Admin Demo", Status: "active"},
	}}
	sessions := &mockSessionRepo{sessions: map[string]*repository.Session{}}
	leads := &memoryDemoLeads{items: map[string]*repository.DemoLead{}}

	h := handler.NewAuthHandler(service.NewAuthService(adminUsers, sessions, tenantRepo))
	h.SetDemoLeads(service.NewDemoLeadService(leads))
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	post := func(body map[string]interface{}) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/demo-login", &buf))
		return rec
	}
	valid := func() map[string]interface{} {
		return map[string]interface{}{"name": "Siti Aminah", "phone": "0812 3456 7890", "travel_name": "Barokah Tours", "city": "Bandung", "consent": true, "source": "utm_source=meta"}
	}

	t.Run("no form: 400 and no session", func(t *testing.T) {
		if rec := post(nil); rec.Code != http.StatusBadRequest {
			t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
		}
		if len(sessions.sessions) != 0 || len(leads.items) != 0 {
			t.Fatal("a session or a lead was created without the form")
		}
	})

	t.Run("every field and the consent are required", func(t *testing.T) {
		for _, drop := range []string{"name", "phone", "travel_name", "city"} {
			body := valid()
			body[drop] = ""
			if rec := post(body); rec.Code != http.StatusBadRequest {
				t.Fatalf("empty %s: got %d, want 400", drop, rec.Code)
			}
		}
		noConsent := valid()
		noConsent["consent"] = false
		if rec := post(noConsent); rec.Code != http.StatusBadRequest {
			t.Fatalf("no consent: got %d, want 400", rec.Code)
		}
		badPhone := valid()
		badPhone["phone"] = "abc"
		if rec := post(badPhone); rec.Code != http.StatusBadRequest {
			t.Fatalf("bad phone: got %d, want 400", rec.Code)
		}
		if len(sessions.sessions) != 0 || len(leads.items) != 0 {
			t.Fatal("an invalid form created a session or a lead")
		}
	})

	t.Run("valid form signs in and records the lead with a normalized number", func(t *testing.T) {
		rec := post(valid())
		if rec.Code != http.StatusOK {
			t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
		}
		lead := leads.items["6281234567890"]
		if lead == nil || lead.Name != "Siti Aminah" || lead.TravelName != "Barokah Tours" || lead.City != "Bandung" {
			t.Fatalf("lead not recorded as expected: %+v", leads.items)
		}
	})

	t.Run("opening the demo again counts one more visit for the same number", func(t *testing.T) {
		if rec := post(valid()); rec.Code != http.StatusOK {
			t.Fatalf("got %d", rec.Code)
		}
		if n := leads.items["6281234567890"].VisitCount; n != 2 {
			t.Fatalf("visit_count = %d, want 2", n)
		}
		if len(leads.items) != 1 {
			t.Fatalf("leads = %d, want 1 row per number", len(leads.items))
		}
	})
}
