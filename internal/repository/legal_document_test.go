package repository_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Legal documents against the real database: a draft stays private, publishing shows it on the public endpoint
// and fills the platform settings URL checkout waits for, unpublishing hides it and clears only its own URL.
func TestLegalDocuments_DraftPublishUnpublish(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	repo := repository.NewLegalDocumentRepository(db)
	settings := repository.NewPlatformSettingsRepository(db)
	svc := service.NewLegalDocumentService(repo, settings, "https://situs.test/")

	before, _ := settings.GetAll(ctx)
	origDocs, err := repo.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, d := range origDocs {
			_, _ = db.Exec(`UPDATE legal_documents SET title=?, draft_content=?, published_title=?, published_content=?, published_at=? WHERE slug=?`,
				d.Title, d.Draft, d.PublishedTitle, d.PublishedContent, d.PublishedAt, d.Slug)
		}
		_ = settings.SetMany(ctx, map[string]string{"terms_url": before["terms_url"], "privacy_url": before["privacy_url"]})
	})
	_, _ = svc.Unpublish(ctx, service.LegalSlugTerms)
	_, _ = svc.Unpublish(ctx, service.LegalSlugPrivacy)
	_ = settings.SetMany(ctx, map[string]string{"terms_url": "", "privacy_url": ""})

	const staff = uint64(7)

	// 1. A draft is not public and does not touch the settings.
	if _, err := svc.SaveDraft(ctx, service.LegalSlugTerms, "Syarat & Ketentuan", "Pasal 1\r\n\r\nIsi pasal.", staff); err != nil {
		t.Fatalf("save draft: %v", err)
	}
	if _, err := svc.Public(ctx, service.LegalSlugTerms); !errors.Is(err, service.ErrLegalNotPublished) {
		t.Fatalf("a draft must not be public, got %v", err)
	}
	if all, _ := settings.GetAll(ctx); strings.TrimSpace(all["terms_url"]) != "" {
		t.Fatal("saving a draft must not fill the settings URL")
	}

	// 2. Publishing: public text, line endings normalised, settings URL built from the origin.
	pub, err := svc.Publish(ctx, service.LegalSlugTerms, staff)
	if err != nil || !pub.Published || pub.HasUnpublishedChanges {
		t.Fatalf("publish: %v %+v", err, pub)
	}
	got, err := svc.Public(ctx, service.LegalSlugTerms)
	if err != nil || got.PublishedContent == nil || *got.PublishedContent != "Pasal 1\n\nIsi pasal." || got.Draft != "" {
		t.Fatalf("public text wrong (and the draft must be hidden): %v %+v", err, got)
	}
	if all, _ := settings.GetAll(ctx); all["terms_url"] != "https://situs.test/syarat-ketentuan" {
		t.Fatalf("settings terms_url = %q", all["terms_url"])
	}

	// 3. Editing the draft after publishing does not change the public page, and is flagged.
	edited, err := svc.SaveDraft(ctx, service.LegalSlugTerms, "Syarat & Ketentuan", "Pasal 1 diubah", staff)
	if err != nil || !edited.HasUnpublishedChanges {
		t.Fatalf("an edited draft must be flagged: %v %+v", err, edited)
	}
	if got, _ := svc.Public(ctx, service.LegalSlugTerms); *got.PublishedContent != "Pasal 1\n\nIsi pasal." {
		t.Fatalf("the public page changed before publishing: %q", *got.PublishedContent)
	}

	// 4. An empty draft cannot be published; an unknown slug, a blank title and a too long text are refused.
	if _, err := svc.SaveDraft(ctx, service.LegalSlugPrivacy, "Kebijakan Privasi", "   \n ", staff); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Publish(ctx, service.LegalSlugPrivacy, staff); !errors.Is(err, repository.ErrLegalDocumentEmpty) {
		t.Fatalf("an empty draft must not publish, got %v", err)
	}
	if _, err := svc.SaveDraft(ctx, "lain-lain", "X", "y", staff); !errors.Is(err, service.ErrLegalSlugUnknown) {
		t.Fatalf("unknown slug: %v", err)
	}
	if _, err := svc.SaveDraft(ctx, service.LegalSlugTerms, "  ", "y", staff); !errors.Is(err, service.ErrLegalTitleInvalid) {
		t.Fatalf("blank title: %v", err)
	}
	if _, err := svc.SaveDraft(ctx, service.LegalSlugTerms, "T", strings.Repeat("a", service.MaxLegalContentChars+1), staff); !errors.Is(err, service.ErrLegalTooLong) {
		t.Fatalf("too long: %v", err)
	}

	// 5. Unpublishing hides the page and clears our URL, but never an external URL typed in the settings.
	if _, err := svc.Unpublish(ctx, service.LegalSlugTerms); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Public(ctx, service.LegalSlugTerms); !errors.Is(err, service.ErrLegalNotPublished) {
		t.Fatalf("unpublished document must not be public, got %v", err)
	}
	if all, _ := settings.GetAll(ctx); strings.TrimSpace(all["terms_url"]) != "" {
		t.Fatalf("our URL must be cleared, got %q", all["terms_url"])
	}
	_ = settings.SetMany(ctx, map[string]string{"terms_url": "https://hukum.example/syarat"})
	if _, err := svc.SaveDraft(ctx, service.LegalSlugTerms, "Syarat & Ketentuan", "Isi lagi", staff); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Unpublish(ctx, service.LegalSlugTerms); err != nil {
		t.Fatal(err)
	}
	if all, _ := settings.GetAll(ctx); all["terms_url"] != "https://hukum.example/syarat" {
		t.Fatalf("an external URL must stay, got %q", all["terms_url"])
	}
}

// HTTP: the public endpoint answers 404 until a document is published, staff endpoints need a staff login.
func TestLegalDocuments_HTTP(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	repo := repository.NewLegalDocumentRepository(db)
	settings := repository.NewPlatformSettingsRepository(db)
	svc := service.NewLegalDocumentService(repo, settings, "https://situs.test")
	h := handler.NewLegalDocumentHandler(svc)

	before, _ := settings.GetAll(ctx)
	origDocs, _ := repo.List(ctx)
	t.Cleanup(func() {
		for _, d := range origDocs {
			_, _ = db.Exec(`UPDATE legal_documents SET title=?, draft_content=?, published_title=?, published_content=?, published_at=? WHERE slug=?`,
				d.Title, d.Draft, d.PublishedTitle, d.PublishedContent, d.PublishedAt, d.Slug)
		}
		_ = settings.SetMany(ctx, map[string]string{"terms_url": before["terms_url"], "privacy_url": before["privacy_url"]})
	})
	_, _ = svc.Unpublish(ctx, service.LegalSlugPrivacy)

	r := chi.NewRouter()
	r.Get("/api/public/legal/{slug}", h.GetPublic)
	r.Get("/api/staff/legal-documents", h.List)
	r.Put("/api/staff/legal-documents/{slug}", h.SaveDraft)
	r.Post("/api/staff/legal-documents/{slug}/publish", h.Publish)
	do := func(method, path, body string, asStaff bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		if asStaff {
			req = req.WithContext(middleware.WithStaffUserID(req.Context(), 1))
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	if w := do(http.MethodGet, "/api/public/legal/kebijakan-privasi", "", false); w.Code != http.StatusNotFound {
		t.Fatalf("unpublished: expected 404, got %d", w.Code)
	}
	if w := do(http.MethodGet, "/api/public/legal/bukan-dokumen", "", false); w.Code != http.StatusNotFound {
		t.Fatalf("unknown slug: expected 404, got %d", w.Code)
	}
	// Without a staff login the editor endpoints are closed.
	for _, c := range [][2]string{{http.MethodGet, "/api/staff/legal-documents"}, {http.MethodPut, "/api/staff/legal-documents/kebijakan-privasi"}, {http.MethodPost, "/api/staff/legal-documents/kebijakan-privasi/publish"}} {
		if w := do(c[0], c[1], `{"title":"x","content":"y"}`, false); w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s without staff: expected 401, got %d", c[0], c[1], w.Code)
		}
	}
	if w := do(http.MethodPut, "/api/staff/legal-documents/kebijakan-privasi", `{"title":"Kebijakan Privasi","content":"Data Anda aman."}`, true); w.Code != http.StatusOK {
		t.Fatalf("save draft: %d %s", w.Code, w.Body.String())
	}
	if w := do(http.MethodGet, "/api/public/legal/kebijakan-privasi", "", false); w.Code != http.StatusNotFound {
		t.Fatalf("a saved draft must still be 404 publicly, got %d", w.Code)
	}
	if w := do(http.MethodPost, "/api/staff/legal-documents/kebijakan-privasi/publish", "", true); w.Code != http.StatusOK {
		t.Fatalf("publish: %d %s", w.Code, w.Body.String())
	}
	w := do(http.MethodGet, "/api/public/legal/kebijakan-privasi", "", false)
	var pub struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &pub)
	if w.Code != http.StatusOK || pub.Content != "Data Anda aman." || strings.Contains(w.Body.String(), "draft") {
		t.Fatalf("published page wrong: %d %s", w.Code, w.Body.String())
	}
	if w := do(http.MethodPut, "/api/staff/legal-documents/bukan-dokumen", `{"title":"x","content":"y"}`, true); w.Code != http.StatusNotFound {
		t.Fatalf("unknown slug on save: expected 404, got %d", w.Code)
	}
	if w := do(http.MethodPut, "/api/staff/legal-documents/syarat-ketentuan", `{"title":"","content":"y"}`, true); w.Code != http.StatusBadRequest {
		t.Fatalf("blank title: expected 400, got %d", w.Code)
	}
}
