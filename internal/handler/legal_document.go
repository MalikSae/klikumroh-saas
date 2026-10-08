package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// maxLegalBodyBytes caps a legal document save: the text is limited to 200.000 characters (up to 4 bytes each
// in UTF-8, more with JSON escapes), so 4 MiB is generous and still bounded.
const maxLegalBodyBytes = 4 << 20

// LegalDocumentHandler serves the staff editor of the legal documents and their public pages.
type LegalDocumentHandler struct {
	svc service.LegalDocumentService
}

// NewLegalDocumentHandler creates a LegalDocumentHandler.
func NewLegalDocumentHandler(svc service.LegalDocumentService) *LegalDocumentHandler {
	return &LegalDocumentHandler{svc: svc}
}

type legalPublicResponse struct {
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	Content     string `json:"content"`
	PublishedAt string `json:"published_at"`
}

// GetPublic handles GET /api/public/legal/{slug}: the published text, or 404 when there is none.
func (h *LegalDocumentHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	d, err := h.svc.Public(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		if errors.Is(err, service.ErrLegalSlugUnknown) || errors.Is(err, service.ErrLegalNotPublished) || errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Dokumen tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat dokumen"})
		return
	}
	title, content, at := d.Title, "", ""
	if d.PublishedTitle != nil {
		title = *d.PublishedTitle
	}
	if d.PublishedContent != nil {
		content = *d.PublishedContent
	}
	if d.PublishedAt != nil {
		at = d.PublishedAt.Format("2006-01-02T15:04:05Z07:00")
	}
	respondJSON(w, http.StatusOK, legalPublicResponse{Slug: d.Slug, Title: title, Content: content, PublishedAt: at})
}

func (h *LegalDocumentHandler) staffID(w http.ResponseWriter, r *http.Request) (uint64, bool) {
	id, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
	}
	return id, ok
}

func (h *LegalDocumentHandler) respondError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, service.ErrLegalSlugUnknown), errors.Is(err, repository.ErrNotFound):
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "Dokumen tidak ditemukan"})
	case errors.Is(err, service.ErrLegalTitleInvalid), errors.Is(err, service.ErrLegalTooLong), errors.Is(err, repository.ErrLegalDocumentEmpty):
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	default:
		log.Printf("[Legal] %s: %v", fallback, err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": fallback})
	}
}

// List handles GET /api/staff/legal-documents.
func (h *LegalDocumentHandler) List(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.staffID(w, r); !ok {
		return
	}
	docs, err := h.svc.List(r.Context())
	if err != nil {
		h.respondError(w, err, "Gagal memuat dokumen legal")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"documents": docs})
}

type saveLegalRequest struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

// SaveDraft handles PUT /api/staff/legal-documents/{slug}: saves the draft only.
func (h *LegalDocumentHandler) SaveDraft(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.staffID(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxLegalBodyBytes)
	var req saveLegalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid atau terlalu besar"})
		return
	}
	slug := chi.URLParam(r, "slug")
	d, err := h.svc.SaveDraft(r.Context(), slug, req.Title, req.Content, staffID)
	if err != nil {
		h.respondError(w, err, "Gagal menyimpan draf")
		return
	}
	log.Printf("[Audit] staff %d saved the draft of legal document %s (%d characters)", staffID, slug, len(req.Content))
	respondJSON(w, http.StatusOK, map[string]any{"document": d})
}

// Publish handles POST /api/staff/legal-documents/{slug}/publish.
func (h *LegalDocumentHandler) Publish(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.staffID(w, r)
	if !ok {
		return
	}
	slug := chi.URLParam(r, "slug")
	d, err := h.svc.Publish(r.Context(), slug, staffID)
	if err != nil {
		h.respondError(w, err, "Gagal menerbitkan dokumen")
		return
	}
	log.Printf("[Audit] staff %d published legal document %s", staffID, slug)
	respondJSON(w, http.StatusOK, map[string]any{"document": d})
}

// Unpublish handles POST /api/staff/legal-documents/{slug}/unpublish.
func (h *LegalDocumentHandler) Unpublish(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.staffID(w, r)
	if !ok {
		return
	}
	slug := chi.URLParam(r, "slug")
	d, err := h.svc.Unpublish(r.Context(), slug)
	if err != nil {
		h.respondError(w, err, "Gagal menarik dokumen dari tayang")
		return
	}
	log.Printf("[Audit] staff %d unpublished legal document %s", staffID, slug)
	respondJSON(w, http.StatusOK, map[string]any{"document": d})
}
