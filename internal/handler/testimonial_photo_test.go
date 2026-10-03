package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Testimonial photos: uploaded into the tenant's own folder, a testimonial may only point at its own
// tenant's upload, and a replaced or deleted photo is removed from disk without touching other tenants.
func TestTestimonialPhoto_UploadOwnershipAndCleanup(t *testing.T) {
	const tenantA, tenantB = uint64(991101), uint64(991102)
	t.Cleanup(func() {
		_ = os.RemoveAll(filepath.Join(".", "uploads", strconv.FormatUint(tenantA, 10)))
		_ = os.RemoveAll(filepath.Join(".", "uploads", strconv.FormatUint(tenantB, 10)))
	})

	svc := service.NewContentService(newMockBannerRepo(), newMockTestiRepo(), newMockFAQRepo())
	h := handler.NewContentHandler(svc)
	r := chi.NewRouter()
	// The tenant comes from the request (as AuthMiddleware would from the session).
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			id, _ := strconv.ParseUint(req.Header.Get("X-Test-Tenant"), 10, 64)
			next.ServeHTTP(w, req.WithContext(middleware.WithTenantID(req.Context(), id)))
		})
	})
	h.RegisterDashboardRoutes(r)

	upload := func(tenant uint64) string {
		t.Helper()
		img := image.NewRGBA(image.Rect(0, 0, 640, 480))
		for y := 0; y < 480; y++ {
			for x := 0; x < 640; x++ {
				img.Set(x, y, color.RGBA{R: 200, G: 120, B: 40, A: 255})
			}
		}
		var pic bytes.Buffer
		_ = png.Encode(&pic, img)
		var body bytes.Buffer
		mw := multipart.NewWriter(&body)
		part, _ := mw.CreateFormFile("image", "jamaah.png")
		_, _ = part.Write(pic.Bytes())
		_ = mw.Close()
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/testimonials/upload-photo", &body)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		req.Header.Set("X-Test-Tenant", strconv.FormatUint(tenant, 10))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("upload: expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res map[string]string
		_ = json.Unmarshal(rec.Body.Bytes(), &res)
		return res["avatar_url"]
	}
	send := func(tenant uint64, method, path string, payload any) *httptest.ResponseRecorder {
		b, _ := json.Marshal(payload)
		req := httptest.NewRequest(method, path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-Tenant", strconv.FormatUint(tenant, 10))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}
	onDisk := func(url string) bool {
		_, err := os.Stat(filepath.Join(".", filepath.FromSlash(strings.TrimPrefix(url, "/"))))
		return err == nil
	}
	body := func(avatar string) handler.TestimonialPayload {
		p := handler.TestimonialPayload{Name: "Ibu Sari", Rating: 5, Quote: "Pembimbing sabar.", IsActive: true}
		if avatar != "" {
			p.AvatarURL = &avatar
		}
		return p
	}

	// 1. Upload lands in the tenant's own testimonials folder, as a square image.
	photoA1 := upload(tenantA)
	if !strings.HasPrefix(photoA1, fmt.Sprintf("/uploads/%d/testimonials/", tenantA)) || !onDisk(photoA1) {
		t.Fatalf("expected photo in tenant A's folder on disk, got %q", photoA1)
	}
	f, _ := os.Open(filepath.Join(".", filepath.FromSlash(strings.TrimPrefix(photoA1, "/"))))
	cfg, _, err := image.DecodeConfig(f)
	f.Close()
	if err != nil || cfg.Width != 400 || cfg.Height != 400 {
		t.Fatalf("expected a 400x400 image, got %dx%d (%v)", cfg.Width, cfg.Height, err)
	}
	photoB := upload(tenantB)

	// 2. A testimonial may only use its own tenant's upload.
	if rec := send(tenantA, http.MethodPost, "/api/dashboard/testimonials", body(photoB)); rec.Code != http.StatusBadRequest {
		t.Fatalf("tenant A using tenant B's photo: expected 400, got %d", rec.Code)
	}
	if rec := send(tenantA, http.MethodPost, "/api/dashboard/testimonials", body("https://evil.example.com/x.webp")); rec.Code != http.StatusBadRequest {
		t.Fatalf("external photo URL: expected 400, got %d", rec.Code)
	}
	rec := send(tenantA, http.MethodPost, "/api/dashboard/testimonials", body(photoA1))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create with own photo: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var created repository.Testimonial
	_ = json.Unmarshal(rec.Body.Bytes(), &created)

	// 3. Replacing the photo removes the old file; tenant B's file is untouched.
	photoA2 := upload(tenantA)
	path := fmt.Sprintf("/api/dashboard/testimonials/%d", created.ID)
	if rec := send(tenantA, http.MethodPut, path, body(photoA2)); rec.Code != http.StatusOK {
		t.Fatalf("update: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if onDisk(photoA1) || !onDisk(photoA2) || !onDisk(photoB) {
		t.Fatalf("after replace: old=%v new=%v otherTenant=%v (want false, true, true)", onDisk(photoA1), onDisk(photoA2), onDisk(photoB))
	}

	// 4. Tenant B cannot delete tenant A's testimonial (and its photo stays).
	if rec := send(tenantB, http.MethodDelete, path, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant delete: expected 404, got %d", rec.Code)
	}
	if !onDisk(photoA2) {
		t.Fatal("tenant A's photo must survive tenant B's delete attempt")
	}

	// 5. Deleting the testimonial removes its photo.
	if rec := send(tenantA, http.MethodDelete, path, nil); rec.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d", rec.Code)
	}
	if onDisk(photoA2) || !onDisk(photoB) {
		t.Fatalf("after delete: own=%v otherTenant=%v (want false, true)", onDisk(photoA2), onDisk(photoB))
	}
}
