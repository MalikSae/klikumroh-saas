package repository_test

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// Meta Pixel + Conversions API per travel, run against real MySQL and a fake Graph API.

type capturedMetaCall struct {
	Path string
	Body map[string]interface{}
}

type fakeGraph struct {
	mu    sync.Mutex
	calls []capturedMetaCall
	srv   *httptest.Server
	// fail makes the fake answer like Meta does for an invalid token.
	fail bool
}

func newFakeGraph(t *testing.T) *fakeGraph {
	g := &fakeGraph{}
	g.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]interface{}
		_ = json.Unmarshal(raw, &body)
		g.mu.Lock()
		g.calls = append(g.calls, capturedMetaCall{Path: r.URL.String(), Body: body})
		fail := g.fail
		g.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if fail {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"Invalid OAuth access token."}}`))
			return
		}
		_, _ = w.Write([]byte(`{"events_received":1,"fbtrace_id":"trace-1"}`))
	}))
	t.Cleanup(g.srv.Close)
	return g
}

func (g *fakeGraph) events(name string) []map[string]interface{} {
	g.mu.Lock()
	defer g.mu.Unlock()
	var out []map[string]interface{}
	for _, c := range g.calls {
		for _, d := range c.Body["data"].([]interface{}) {
			ev := d.(map[string]interface{})
			if ev["event_name"] == name {
				out = append(out, ev)
			}
		}
	}
	return out
}

func testSecretBox(t *testing.T) *util.SecretBox {
	key := make([]byte, 32)
	_, _ = rand.Read(key)
	box, err := util.NewSecretBox(base64.StdEncoding.EncodeToString(key))
	if err != nil {
		t.Fatalf("secret box: %v", err)
	}
	return box
}

func sha(v string) string {
	sum := sha256.Sum256([]byte(v))
	return hex.EncodeToString(sum[:])
}

func TestMeta_SettingsAreTenantScopedAndTokenEncrypted(t *testing.T) {
	e := setupProspectAudit(t)
	metaRepo := repository.NewMetaIntegrationRepository(e.db)
	meta := service.NewMetaServiceForTest(metaRepo, testSecretBox(t), "http://127.0.0.1:1")

	token := "EAAGtesttoken1234567890abcd"
	if _, err := meta.SaveSettings(e.ctx, e.tenantA.ID, service.MetaSettingsInput{PixelID: "123", AccessToken: &token}); !errors.Is(err, service.ErrInvalidMetaPixelID) {
		t.Fatalf("short pixel id must be refused, got %v", err)
	}
	view, err := meta.SaveSettings(e.ctx, e.tenantA.ID, service.MetaSettingsInput{PixelID: "1234567890123456", AccessToken: &token, TestEventCode: "TEST123"})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if !view.TokenConfigured || view.TokenHint != "abcd" || view.PixelID != "1234567890123456" {
		t.Fatalf("unexpected view %+v", view)
	}
	var stored string
	_ = e.db.QueryRow(`SELECT meta_capi_token_enc FROM tenants WHERE id = ?`, e.tenantA.ID).Scan(&stored)
	if stored == "" || strings.Contains(stored, "EAAG") {
		t.Fatalf("token must be stored encrypted, got %q", stored)
	}

	// Tenant B is untouched and cannot see tenant A's settings.
	other, _ := meta.GetSettings(e.ctx, e.tenantB.ID)
	if other.PixelID != "" || other.TokenConfigured {
		t.Fatalf("CRITICAL: tenant B must not see tenant A Meta settings, got %+v", other)
	}
	if px, _ := meta.PublicPixelID(e.ctx, e.tenantB.ID); px != "" {
		t.Fatalf("CRITICAL: tenant B public pixel must be empty, got %q", px)
	}
	if px, _ := meta.PublicPixelID(e.ctx, e.tenantA.ID); px != "1234567890123456" {
		t.Fatalf("tenant A public pixel, got %q", px)
	}

	// Saving without a token keeps it; clear_token removes it.
	view, _ = meta.SaveSettings(e.ctx, e.tenantA.ID, service.MetaSettingsInput{PixelID: "1234567890123456"})
	if !view.TokenConfigured {
		t.Fatalf("token must be kept when not sent again")
	}
	view, _ = meta.SaveSettings(e.ctx, e.tenantA.ID, service.MetaSettingsInput{PixelID: "1234567890123456", ClearToken: true})
	if view.TokenConfigured {
		t.Fatalf("clear_token must remove the token")
	}

	// Without an encryption key a token is refused, never stored in plain text.
	noKey := service.NewMetaServiceForTest(metaRepo, nil, "http://127.0.0.1:1")
	if _, err := noKey.SaveSettings(e.ctx, e.tenantA.ID, service.MetaSettingsInput{PixelID: "1234567890123456", AccessToken: &token}); !errors.Is(err, util.ErrEncryptionKeyMissing) {
		t.Fatalf("expected ErrEncryptionKeyMissing, got %v", err)
	}
}

func TestMeta_LeadAndPurchaseEvents(t *testing.T) {
	e := setupProspectAudit(t)
	graph := newFakeGraph(t)
	metaRepo := repository.NewMetaIntegrationRepository(e.db)
	meta := service.NewMetaServiceForTest(metaRepo, testSecretBox(t), graph.srv.URL)
	e.svc.SetMetaTracker(meta)

	// Not configured yet: no event is sent.
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Belum Aktif", Phone: "081399991000"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if len(graph.events("Lead")) != 0 {
		t.Fatalf("no event may be sent before the travel configures Meta")
	}

	token := "EAAGtesttoken1234567890abcd"
	if _, err := meta.SaveSettings(e.ctx, e.tenantA.ID, service.MetaSettingsInput{PixelID: "1234567890123456", AccessToken: &token, TestEventCode: "TEST123"}); err != nil {
		t.Fatalf("save: %v", err)
	}
	city := "Kota Bandung"
	email := "Siti@Example.com"
	res, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{
		Consent: true, ConsentMeta: true, Name: "Siti Aminah", Phone: "0813-9999-1001", Email: &email, Domicile: &city, PackageID: &e.pkgA.ID,
		Meta:     &service.PublicMetaContext{Fbp: "fb.1.1727600000000.123456789", Fbc: "bad value", EventSourceURL: "https://travel.example/paket/1"},
		ClientIP: "198.51.100.7", UserAgent: "Mozilla/5.0 test",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if res.MetaEventID == "" {
		t.Fatalf("a new lead must return meta_event_id for browser deduplication")
	}
	leads := graph.events("Lead")
	if len(leads) != 1 {
		t.Fatalf("expected 1 Lead event, got %d", len(leads))
	}
	lead := leads[0]
	if lead["event_id"] != res.MetaEventID || lead["action_source"] != "website" || lead["event_source_url"] != "https://travel.example/paket/1" {
		t.Fatalf("lead event fields wrong: %+v", lead)
	}
	ud := lead["user_data"].(map[string]interface{})
	if ud["ph"].([]interface{})[0] != sha("6281399991001") || ud["em"].([]interface{})[0] != sha("siti@example.com") ||
		ud["fn"].([]interface{})[0] != sha("siti") || ud["ln"].([]interface{})[0] != sha("aminah") || ud["ct"].([]interface{})[0] != sha("kotabandung") {
		t.Fatalf("user data must be normalized and hashed: %+v", ud)
	}
	if ud["client_ip_address"] != "198.51.100.7" || ud["client_user_agent"] != "Mozilla/5.0 test" || ud["fbp"] != "fb.1.1727600000000.123456789" {
		t.Fatalf("browser identifiers missing: %+v", ud)
	}
	if _, bad := ud["fbc"]; bad {
		t.Fatalf("a malformed _fbc must be dropped, got %v", ud["fbc"])
	}
	graph.mu.Lock()
	call := graph.calls[len(graph.calls)-1]
	graph.mu.Unlock()
	if strings.Contains(call.Path, "access_token") || call.Body["access_token"] != token || call.Body["test_event_code"] != "TEST123" {
		t.Fatalf("token must be in the body only (not the URL), test code included: %s %+v", call.Path, call.Body)
	}
	// P1: never an expired Marketing API version (v21.0 expired 9 Sep 2025).
	if !strings.HasPrefix(call.Path, "/v25.0/1234567890123456/events") {
		t.Fatalf("unexpected Graph path %s", call.Path)
	}

	// A repeat submission is not a new lead: no Lead event, no event id.
	res2, _ := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Siti Aminah", Phone: "081399991001"})
	if res2.MetaEventID != "" || len(graph.events("Lead")) != 1 {
		t.Fatalf("repeat submission must not send another Lead")
	}

	// Closing a web-form lead sends Purchase with the package value.
	q := "081399991001"
	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{Search: &q})
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, list[0].ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	purchases := graph.events("Purchase")
	if len(purchases) != 1 {
		t.Fatalf("expected 1 Purchase event, got %d", len(purchases))
	}
	cd := purchases[0]["custom_data"].(map[string]interface{})
	if cd["currency"] != "IDR" || purchases[0]["action_source"] != "system_generated" {
		t.Fatalf("purchase fields wrong: %+v", purchases[0])
	}
	pud := purchases[0]["user_data"].(map[string]interface{})
	if pud["fbp"] != "fb.1.1727600000000.123456789" || pud["external_id"].([]interface{})[0] != ud["external_id"].([]interface{})[0] {
		t.Fatalf("purchase must reuse the lead's fbp and external_id: %+v", pud)
	}

	// An agent's manual input never came through the website: closing it sends no Purchase.
	manual, err := e.svc.CreateManualByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, service.AgentCreateProspectInput{Consent: true, Name: "Manual", Phone: "081399991002"})
	if err != nil {
		t.Fatalf("manual: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, manual.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing manual: %v", err)
	}
	if len(graph.events("Purchase")) != 1 {
		t.Fatalf("agent manual closing must not send Purchase")
	}

	// Tenant B has no Meta settings: its leads send nothing.
	before := len(graph.events("Lead"))
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantB.ID, service.PublicProspectInput{Consent: true, ConsentMeta: true, Name: "Tenant B", Phone: "081399991003"}); err != nil {
		t.Fatalf("tenant B create: %v", err)
	}
	if len(graph.events("Lead")) != before {
		t.Fatalf("CRITICAL: tenant B lead must not use tenant A Meta settings")
	}

	// Test event requires a test code and carries the admin's browser (required for website events).
	result, err := meta.SendTestEvent(e.ctx, e.tenantA.ID, "203.0.113.5", "Mozilla/5.0 admin")
	if err != nil || result.EventsReceived != 1 {
		t.Fatalf("test event: %+v %v", result, err)
	}
	pv := graph.events("PageView")
	if len(pv) != 1 || pv[0]["user_data"].(map[string]interface{})["client_user_agent"] != "Mozilla/5.0 admin" {
		t.Fatalf("test event must include the admin's user agent: %+v", pv)
	}

	// M2: every event sent as "website" carries client_user_agent (Meta rejects it otherwise).
	for _, name := range []string{"PageView", "Lead", "Purchase"} {
		for _, ev := range graph.events(name) {
			if ev["action_source"] == "website" {
				if ua, _ := ev["user_data"].(map[string]interface{})["client_user_agent"].(string); ua == "" {
					t.Fatalf("%s website event without client_user_agent: %+v", name, ev)
				}
			}
		}
	}
	// A Lead without a user agent (no browser) is reported as system_generated, not rejected.
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, ConsentMeta: true, Name: "Tanpa Browser", Phone: "081399991004"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	leads = graph.events("Lead")
	if last := leads[len(leads)-1]; last["action_source"] != "system_generated" {
		t.Fatalf("lead without user agent must be system_generated, got %v", last["action_source"])
	}

	// M1: cancel the closing and close again: still exactly one Purchase.
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, list[0].ID, 1, "jamaah batal"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, list[0].ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("re-closing: %v", err)
	}
	if n := len(graph.events("Purchase")); n != 1 {
		t.Fatalf("a re-closed prospect must not report Purchase twice, got %d", n)
	}
}

// M1: a closing before Meta is configured does not use up the one-time Purchase report.
func TestMeta_PurchaseNotClaimedWhileDisabled(t *testing.T) {
	e := setupProspectAudit(t)
	graph := newFakeGraph(t)
	metaRepo := repository.NewMetaIntegrationRepository(e.db)
	meta := service.NewMetaServiceForTest(metaRepo, testSecretBox(t), graph.srv.URL)
	e.svc.SetMetaTracker(meta)

	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, ConsentMeta: true, Name: "Awal", Phone: "081399991200"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	q := "081399991200"
	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{Search: &q})
	id := list[0].ID
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, id, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	var sent sql.NullTime
	_ = e.db.QueryRow(`SELECT meta_purchase_sent_at FROM prospects WHERE id = ?`, id).Scan(&sent)
	if sent.Valid {
		t.Fatalf("purchase must not be marked sent while Meta is not configured")
	}
}

// M4: the pixel is not loaded on the suspended page of a travel past its grace period.
func TestMeta_NoPixelForSuspendedTravel(t *testing.T) {
	e := setupProspectAudit(t)
	metaRepo := repository.NewMetaIntegrationRepository(e.db)
	meta := service.NewMetaServiceForTest(metaRepo, testSecretBox(t), "http://127.0.0.1:1")
	if _, err := meta.SaveSettings(e.ctx, e.tenantA.ID, service.MetaSettingsInput{PixelID: "1234567890123456"}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if px, _ := meta.PublicPixelID(e.ctx, e.tenantA.ID); px == "" {
		t.Fatalf("active travel must get its pixel")
	}
	if _, err := e.db.Exec(`UPDATE tenants SET subscription_expires_at = NOW() - INTERVAL 8 DAY WHERE id = ?`, e.tenantA.ID); err != nil {
		t.Fatalf("expire: %v", err)
	}
	if px, _ := meta.PublicPixelID(e.ctx, e.tenantA.ID); px != "" {
		t.Fatalf("suspended travel must not load the pixel, got %q", px)
	}
}

// W1: deleting a prospect removes its notifications and the name from other jamaah notifications.
func TestReaudit7_DeleteScrubsNotifications(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081399991100", 1)
	insert := func(tenantID uint64, kind, body, link string) int64 {
		res, err := e.db.Exec(`INSERT INTO notifications (tenant_id, recipient_type, recipient_id, type, title, body, link_url)
			VALUES (?, 'admin', 1, ?, 'Info', ?, ?)`, tenantID, kind, body, link)
		if err != nil {
			t.Fatalf("insert: %v", err)
		}
		id, _ := res.LastInsertId()
		return id
	}
	linked := insert(e.tenantA.ID, "prospect_new", "Jamaah Audit tertarik paket", "/prospects/"+itoa(p.ID))
	// A commission notification as the service writes it: to the prospect's agent, "jamaah <name> sudah ...".
	res, err := e.db.Exec(`INSERT INTO notifications (tenant_id, recipient_type, recipient_id, type, title, body, link_url)
		VALUES (?, 'agent', ?, 'commission_earned', 'Komisi', 'Komisi Rp 1.000 dari closing jamaah Jamaah Audit sudah bisa dicairkan.', '/agen/riwayat-komisi')`,
		e.tenantA.ID, e.agentA.ID)
	if err != nil {
		t.Fatalf("insert: %v", err)
	}
	commission, _ := res.LastInsertId()
	otherTenant := insert(e.tenantB.ID, "prospect_new", "Jamaah Audit tertarik paket", "/prospects/"+itoa(p.ID))

	if err := e.svc.Delete(e.ctx, e.tenantB.ID, p.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B delete must be not found, got %v", err)
	}
	if err := e.svc.Delete(e.ctx, e.tenantA.ID, p.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	var n int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE id = ?`, linked).Scan(&n)
	if n != 0 {
		t.Fatalf("notification linking to the deleted prospect must be removed")
	}
	var body string
	_ = e.db.QueryRow(`SELECT body FROM notifications WHERE id = ?`, commission).Scan(&body)
	if strings.Contains(body, "Jamaah Audit") {
		t.Fatalf("name must be scrubbed from other notifications, got %q", body)
	}
	_ = e.db.QueryRow(`SELECT body FROM notifications WHERE id = ?`, otherTenant).Scan(&body)
	if !strings.Contains(body, "Jamaah Audit") {
		t.Fatalf("CRITICAL: tenant B notification must not be touched")
	}
}

func itoa(v uint64) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// N1: a jamaah whose consent text did not mention Meta is never sent to the Conversions API.
func TestMeta_NothingSentWithoutMetaDisclosure(t *testing.T) {
	e := setupProspectAudit(t)
	graph := newFakeGraph(t)
	meta := service.NewMetaServiceForTest(repository.NewMetaIntegrationRepository(e.db), testSecretBox(t), graph.srv.URL)
	e.svc.SetMetaTracker(meta)
	token := "EAAGtesttoken1234567890abcd"
	if _, err := meta.SaveSettings(e.ctx, e.tenantA.ID, service.MetaSettingsInput{PixelID: "1234567890123456", AccessToken: &token}); err != nil {
		t.Fatalf("save: %v", err)
	}
	res, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Teks Lama", Phone: "081399991300", UserAgent: "Mozilla/5.0"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if res.MetaEventID == "" {
		t.Fatalf("the browser pixel (no personal data) still gets its event id")
	}
	if n := len(graph.events("Lead")); n != 0 {
		t.Fatalf("no server Lead without Meta disclosure, got %d", n)
	}
	q := "081399991300"
	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{Search: &q})
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, list[0].ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if n := len(graph.events("Purchase")); n != 0 {
		t.Fatalf("no Purchase for a jamaah who never saw the Meta text, got %d", n)
	}
	// Submitting again with the Meta text completes the disclosure (without overwriting other data).
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, ConsentMeta: true, Name: "Teks Baru", Phone: "081399991301"}); err != nil {
		t.Fatalf("create disclosed: %v", err)
	}
	if n := len(graph.events("Lead")); n != 1 {
		t.Fatalf("a disclosed lead is sent, got %d", n)
	}
}

// N2: failed deliveries are recorded for the dashboard and do not use up the one-time Purchase.
func TestMeta_DeliveryFailureVisibleAndPurchaseRetried(t *testing.T) {
	e := setupProspectAudit(t)
	graph := newFakeGraph(t)
	meta := service.NewMetaServiceForTest(repository.NewMetaIntegrationRepository(e.db), testSecretBox(t), graph.srv.URL)
	e.svc.SetMetaTracker(meta)
	token := "EAAGtesttoken1234567890abcd"
	if _, err := meta.SaveSettings(e.ctx, e.tenantA.ID, service.MetaSettingsInput{PixelID: "1234567890123456", AccessToken: &token}); err != nil {
		t.Fatalf("save: %v", err)
	}
	graph.mu.Lock()
	graph.fail = true
	graph.mu.Unlock()

	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, ConsentMeta: true, Name: "Gagal Kirim", Phone: "081399991400", UserAgent: "Mozilla/5.0"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	view, _ := meta.GetSettings(e.ctx, e.tenantA.ID)
	if view.LastErrorAt == nil || !strings.Contains(view.LastError, "Invalid OAuth access token") || strings.Contains(view.LastError, token) {
		t.Fatalf("failure must be visible without the token, got %+v", view)
	}
	if other, _ := meta.GetSettings(e.ctx, e.tenantB.ID); other.LastError != "" || other.LastErrorAt != nil {
		t.Fatalf("CRITICAL: tenant B must not see tenant A delivery errors, got %+v", other)
	}

	q := "081399991400"
	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{Search: &q})
	id := list[0].ID
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, id, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	var sent sql.NullTime
	_ = e.db.QueryRow(`SELECT meta_purchase_sent_at FROM prospects WHERE id = ?`, id).Scan(&sent)
	if sent.Valid {
		t.Fatalf("a failed Purchase must release its claim")
	}

	// Token fixed: the next closing of this prospect is reported, and the status shows success.
	graph.mu.Lock()
	graph.fail = false
	graph.mu.Unlock()
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, id, 1, "salah input"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, id, 1, "closing", nil, nil); err != nil {
		t.Fatalf("re-closing: %v", err)
	}
	_ = e.db.QueryRow(`SELECT meta_purchase_sent_at FROM prospects WHERE id = ?`, id).Scan(&sent)
	if !sent.Valid {
		t.Fatalf("the retried Purchase must be marked sent")
	}
	view, _ = meta.GetSettings(e.ctx, e.tenantA.ID)
	if view.LastSuccessAt == nil {
		t.Fatalf("success must be recorded")
	}
}
