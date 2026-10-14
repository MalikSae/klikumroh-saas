package repository_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// KlikUmroh's own Meta Pixel + CAPI settings (platform level), run against real MySQL and a fake Graph API.
// platform_settings is global, so the test restores whatever the local database held before.

var platformMetaKeys = []string{
	"meta_pixel_id", "meta_capi_token_enc", "meta_test_event_code",
	"meta_last_success_at", "meta_last_error", "meta_last_error_at",
}

func snapshotPlatformMeta(t *testing.T, db *sql.DB, repo repository.PlatformSettingsRepository) {
	t.Helper()
	all, err := repo.GetAll(context.Background())
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	clean := func() {
		for _, k := range platformMetaKeys {
			_, _ = db.Exec("DELETE FROM platform_settings WHERE `key` = ?", k)
		}
	}
	clean()
	t.Cleanup(func() {
		clean()
		restore := map[string]string{}
		for _, k := range platformMetaKeys {
			if v, ok := all[k]; ok {
				restore[k] = v
			}
		}
		if len(restore) > 0 {
			_ = repo.SetMany(context.Background(), restore)
		}
	})
}

func TestPlatformMeta_SettingsTokenEncryptedAndNeverReturned(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewPlatformSettingsRepository(db)
	snapshotPlatformMeta(t, db, repo)
	ctx := context.Background()
	svc := service.NewPlatformMetaServiceForTest(repo, testSecretBox(t), "http://127.0.0.1:1")

	before, _ := repo.GetAll(ctx)

	token := "EAAGplatformtoken1234567890wxyz"
	if _, err := svc.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "123"}); !errors.Is(err, service.ErrInvalidMetaPixelID) {
		t.Fatalf("short pixel id must be refused, got %v", err)
	}
	short := "short"
	if _, err := svc.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", AccessToken: &short}); !errors.Is(err, service.ErrInvalidMetaToken) {
		t.Fatalf("short token must be refused, got %v", err)
	}
	if _, err := svc.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", TestEventCode: "bad code!"}); !errors.Is(err, service.ErrInvalidMetaTestCode) {
		t.Fatalf("bad test code must be refused, got %v", err)
	}

	view, err := svc.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", AccessToken: &token, TestEventCode: "TEST123"})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if !view.TokenConfigured || view.TokenHint != "wxyz" || view.PixelID != "1234567890123456" || view.TestEventCode != "TEST123" {
		t.Fatalf("unexpected view %+v", view)
	}
	raw, _ := json.Marshal(view)
	if strings.Contains(string(raw), "EAAG") || strings.Contains(string(raw), token) {
		t.Fatalf("CRITICAL: token must never be in the response, got %s", raw)
	}
	stored, _ := repo.GetAll(ctx)
	if enc := stored["meta_capi_token_enc"]; enc == "" || strings.Contains(enc, "EAAG") {
		t.Fatalf("token must be stored encrypted, got %q", enc)
	}

	// Other platform settings are untouched.
	for _, k := range []string{"whatsapp_number", "bank_name", "bank_account_number", "terms_url", "privacy_url"} {
		if before[k] != stored[k] {
			t.Fatalf("setting %q must not change: %q -> %q", k, before[k], stored[k])
		}
	}

	if px, _ := svc.PublicPixelID(ctx); px != "1234567890123456" {
		t.Fatalf("public pixel, got %q", px)
	}

	// Saving without a token keeps it; clear_token removes it.
	view, _ = svc.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", TestEventCode: "TEST123"})
	if !view.TokenConfigured {
		t.Fatalf("token must be kept when not sent again")
	}
	view, _ = svc.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", ClearToken: true})
	if view.TokenConfigured {
		t.Fatalf("clear_token must remove the token")
	}

	// Clearing the pixel ID removes it from the public endpoint.
	if _, err := svc.SaveSettings(ctx, service.PlatformMetaInput{}); err != nil {
		t.Fatalf("clear pixel: %v", err)
	}
	if px, _ := svc.PublicPixelID(ctx); px != "" {
		t.Fatalf("public pixel must be empty when cleared, got %q", px)
	}

	// Without an encryption key a token is refused, never stored in plain text.
	noKey := service.NewPlatformMetaServiceForTest(repo, nil, "http://127.0.0.1:1")
	if _, err := noKey.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", AccessToken: &token}); !errors.Is(err, util.ErrEncryptionKeyMissing) {
		t.Fatalf("expected ErrEncryptionKeyMissing, got %v", err)
	}
}

func TestPlatformMeta_TestEventAndDeliveryStatus(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewPlatformSettingsRepository(db)
	snapshotPlatformMeta(t, db, repo)
	ctx := context.Background()
	graph := newFakeGraph(t)
	svc := service.NewPlatformMetaServiceForTest(repo, testSecretBox(t), graph.srv.URL)

	if _, err := svc.SendTestEvent(ctx, "203.0.113.9", "Mozilla/5.0"); !errors.Is(err, service.ErrMetaNotConfigured) {
		t.Fatalf("not configured, got %v", err)
	}

	token := "EAAGplatformtoken1234567890wxyz"
	if _, err := svc.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", AccessToken: &token}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if _, err := svc.SendTestEvent(ctx, "203.0.113.9", "Mozilla/5.0"); !errors.Is(err, service.ErrMetaTestCodeRequired) {
		t.Fatalf("test code required, got %v", err)
	}
	if _, err := svc.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", TestEventCode: "TEST123"}); err != nil {
		t.Fatalf("save code: %v", err)
	}

	res, err := svc.SendTestEvent(ctx, "203.0.113.9", "Mozilla/5.0")
	if err != nil || res.EventsReceived != 1 {
		t.Fatalf("test event: %+v %v", res, err)
	}
	events := graph.events("PageView")
	if len(events) != 1 {
		t.Fatalf("want 1 PageView, got %d", len(events))
	}
	ud := events[0]["user_data"].(map[string]interface{})
	if ud["client_ip_address"] != "203.0.113.9" || ud["client_user_agent"] != "Mozilla/5.0" {
		t.Fatalf("browser context missing: %+v", ud)
	}
	if events[0]["action_source"] != "website" {
		t.Fatalf("action_source, got %v", events[0]["action_source"])
	}
	graph.mu.Lock()
	call := graph.calls[0]
	graph.mu.Unlock()
	if call.Body["test_event_code"] != "TEST123" || call.Body["access_token"] != token {
		t.Fatalf("body must carry test code and token: %+v", call.Body)
	}
	if strings.Contains(call.Path, token) {
		t.Fatalf("token must never be in the URL: %s", call.Path)
	}
	if !strings.Contains(call.Path, "/1234567890123456/events") {
		t.Fatalf("unexpected path %s", call.Path)
	}

	view, _ := svc.GetSettings(ctx)
	if view.LastSuccessAt == nil || view.LastError != "" {
		t.Fatalf("success must be recorded: %+v", view)
	}

	// A failing token is visible to staff, and the error never contains the token.
	graph.mu.Lock()
	graph.fail = true
	graph.mu.Unlock()
	if _, err := svc.SendTestEvent(ctx, "203.0.113.9", "Mozilla/5.0"); err == nil {
		t.Fatalf("expected failure from Meta")
	}
	view, _ = svc.GetSettings(ctx)
	if view.LastError == "" || view.LastErrorAt == nil || strings.Contains(view.LastError, token) {
		t.Fatalf("failure must be recorded without the token: %+v", view)
	}
}

func TestPlatformMeta_LeadEventHashedAndDeduplicated(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewPlatformSettingsRepository(db)
	snapshotPlatformMeta(t, db, repo)
	ctx := context.Background()
	graph := newFakeGraph(t)
	svc := service.NewPlatformMetaServiceForTest(repo, testSecretBox(t), graph.srv.URL)

	ev := service.PlatformLeadEvent{
		EventID:     "lead-evt-1",
		EventTime:   time.Now(),
		SourceURL:   "https://klikumroh.id/checkout",
		ContentName: "Standard Bulanan",
		User: service.MetaUserData{
			Email: "Budi@Travel.id", Phone: "6281234567890", Name: "Budi Santoso",
			ExternalID: "klikumroh-platform-7", ClientIP: "203.0.113.9", UserAgent: "Mozilla/5.0",
			Fbp: "fb.1.1700000000000.111", Fbc: "fb.1.1700000000000.abc",
		},
	}

	// Not configured: nothing is sent.
	svc.TrackLead(ev)
	if n := len(graph.events("Lead")); n != 0 {
		t.Fatalf("nothing may be sent while not configured, got %d", n)
	}

	token := "EAAGplatformtoken1234567890wxyz"
	if _, err := svc.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", AccessToken: &token}); err != nil {
		t.Fatalf("save: %v", err)
	}
	svc.TrackLead(ev)
	leads := graph.events("Lead")
	if len(leads) != 1 {
		t.Fatalf("want 1 Lead, got %d", len(leads))
	}
	got := leads[0]
	if got["event_id"] != "lead-evt-1" || got["event_source_url"] != "https://klikumroh.id/checkout" {
		t.Fatalf("event id / source url: %+v", got)
	}
	ud := got["user_data"].(map[string]interface{})
	wantEm := sha("budi@travel.id")
	if em := ud["em"].([]interface{}); len(em) != 1 || em[0] != wantEm {
		t.Fatalf("email must be normalized and SHA-256 hashed, got %v", ud["em"])
	}
	if ph := ud["ph"].([]interface{}); ph[0] != sha("6281234567890") {
		t.Fatalf("phone must be hashed, got %v", ud["ph"])
	}
	raw, _ := json.Marshal(got)
	if strings.Contains(string(raw), "budi@travel.id") || strings.Contains(string(raw), "6281234567890") || strings.Contains(string(raw), "Budi Santoso") {
		t.Fatalf("CRITICAL: plain personal data in the event: %s", raw)
	}
	if ud["fbp"] != "fb.1.1700000000000.111" || ud["client_ip_address"] != "203.0.113.9" {
		t.Fatalf("browser identifiers must be sent as-is: %+v", ud)
	}
}
