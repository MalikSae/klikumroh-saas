package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/playbook"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// PlaybookSubscriptionReader is the part of the subscription service the playbook needs.
type PlaybookSubscriptionReader interface {
	GetSubscriptionInfo(ctx context.Context, tenantID uint64) (*service.TenantSubscriptionInfo, error)
}

// PlaybookHandler serves the recruitment guide to travels on a 12-month plan. The path must not contain
// "/subscription": SubscriptionEnforcementMiddleware lets such paths through for every travel.
type PlaybookHandler struct {
	subs   PlaybookSubscriptionReader
	lib    *playbook.Library
	checks service.PlaybookCheckService
}

func NewPlaybookHandler(subs PlaybookSubscriptionReader, lib *playbook.Library, checks service.PlaybookCheckService) *PlaybookHandler {
	return &PlaybookHandler{subs: subs, lib: lib, checks: checks}
}

// RegisterDashboardRoutes mounts the endpoints on the protected travel dashboard router.
func (h *PlaybookHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/playbook", h.List)
	r.Get("/api/dashboard/playbook/{slug}", h.Get)
	r.Get("/api/dashboard/playbook/{slug}/checks", h.ListChecks)
	r.Put("/api/dashboard/playbook/{slug}/checks", h.SetCheck)
}

// authorize returns false after writing the error response. The travel is the session's tenant only.
func (h *PlaybookHandler) authorize(w http.ResponseWriter, r *http.Request) (uint64, bool) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok || tenantID == 0 {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return 0, false
	}
	info, err := h.subs.GetSubscriptionInfo(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "travel tidak ditemukan"})
			return 0, false
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return 0, false
	}
	if !service.CanAccessPlaybook(info) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error": "Panduan rekrutmen tersedia untuk paket langganan 12 bulan yang aktif.",
			"code":  "playbook_locked",
		})
		return 0, false
	}
	return tenantID, true
}

// List handles GET /api/dashboard/playbook.
func (h *PlaybookHandler) List(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	respondJSON(w, http.StatusOK, map[string]any{"pages": h.lib.List()})
}

// Get handles GET /api/dashboard/playbook/{slug}.
func (h *PlaybookHandler) Get(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorize(w, r); !ok {
		return
	}
	page, ok := h.lib.Get(chi.URLParam(r, "slug"))
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "halaman tidak ditemukan"})
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	respondJSON(w, http.StatusOK, page)
}

// ListChecks handles GET /api/dashboard/playbook/{slug}/checks: the checked item ids of the travel's team.
func (h *PlaybookHandler) ListChecks(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.authorize(w, r)
	if !ok {
		return
	}
	page, found := h.lib.Get(chi.URLParam(r, "slug"))
	if !found {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "halaman tidak ditemukan"})
		return
	}
	ids, err := h.checks.List(r.Context(), tenantID, page.Slug)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	respondJSON(w, http.StatusOK, map[string]any{"checked": ids})
}

type setPlaybookCheckRequest struct {
	ItemID  string `json:"item_id"`
	Checked bool   `json:"checked"`
}

// SetCheck handles PUT /api/dashboard/playbook/{slug}/checks: checks or unchecks one item for the whole team.
func (h *PlaybookHandler) SetCheck(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.authorize(w, r)
	if !ok {
		return
	}
	page, found := h.lib.Get(chi.URLParam(r, "slug"))
	if !found {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "halaman tidak ditemukan"})
		return
	}
	var req setPlaybookCheckRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}
	var adminID *uint64
	if id, has := middleware.GetAdminUserID(r.Context()); has && id != 0 {
		adminID = &id
	}
	if err := h.checks.Set(r.Context(), tenantID, page.Slug, req.ItemID, req.Checked, adminID); err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidPlaybookItem):
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		case errors.Is(err, repository.ErrPlaybookChecksFull):
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		default:
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		}
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"item_id": req.ItemID, "checked": req.Checked})
}
