package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type DomainHandler struct {
	domainService service.DomainService
	domainRepo    repository.DomainRepository
}

func NewDomainHandler(domainService service.DomainService, domainRepo repository.DomainRepository) *DomainHandler {
	return &DomainHandler{
		domainService: domainService,
		domainRepo:    domainRepo,
	}
}

// RegisterDashboardRoutes mounts protected dashboard domain routes (requires AuthMiddleware).
func (h *DomainHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/domains", h.ListDomains)
	r.Post("/api/dashboard/domains", h.RegisterCustomDomain)
	r.Post("/api/dashboard/domains/{id}/verify", h.VerifyDomain)
	r.Delete("/api/dashboard/domains/{id}", h.DeleteDomain)
}

// RegisterPublicRoutes mounts public endpoints (without auth).
func (h *DomainHandler) RegisterPublicRoutes(r chi.Router) {
	r.Get("/internal/domain-ask", h.AskDomain)
	r.Get("/api/public/custom-domain-target", h.GetCustomDomainTarget)
}

// RegisterCustomDomainPayload defines the request body for registering a custom domain.
type RegisterCustomDomainPayload struct {
	Hostname string `json:"hostname"`
}

// RegisterCustomDomain handles POST /api/dashboard/domains.
func (h *DomainHandler) RegisterCustomDomain(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload RegisterCustomDomainPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	resp, err := h.domainService.RegisterCustomDomain(r.Context(), tenantID, payload.Hostname)
	if err != nil {
		if errors.Is(err, service.ErrInvalidHostname) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrDomainAlreadyUsed) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, resp)
}

// ListDomains handles GET /api/dashboard/domains.
func (h *DomainHandler) ListDomains(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	domains, err := h.domainService.ListDomains(r.Context(), tenantID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"domains": domains,
	})
}

// VerifyDomain handles POST /api/dashboard/domains/{id}/verify.
func (h *DomainHandler) VerifyDomain(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	domainID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid domain id"})
		return
	}

	domain, err := h.domainService.VerifyDomain(r.Context(), tenantID, domainID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "domain tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrDomainNotCustom) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, domain)
}

// DeleteDomain handles DELETE /api/dashboard/domains/{id}.
func (h *DomainHandler) DeleteDomain(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	domainID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid domain id"})
		return
	}

	err = h.domainService.DeleteDomain(r.Context(), tenantID, domainID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "domain tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrCannotDeleteSubdomain) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "domain berhasil dihapus"})
}

// AskDomain handles GET /internal/domain-ask?domain={hostname}
// PUBLIC, NO AUTH. Called by Caddy on-demand TLS before issuing a certificate.
// Returns 200 ONLY if there is a domain with exact hostname match, type='custom', and status='active'.
// Otherwise returns 404.
func (h *DomainHandler) AskDomain(w http.ResponseWriter, r *http.Request) {
	queryHostname := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("domain")))
	if queryHostname == "" {
		http.NotFound(w, r)
		return
	}

	domain, err := h.domainRepo.FindByHostname(r.Context(), queryHostname)
	if err != nil || domain == nil {
		http.NotFound(w, r)
		return
	}

	// CRITICAL SECURITY RULE: Only issue certificates for active custom domains
	if domain.Type != "custom" || domain.Status != "active" {
		http.NotFound(w, r)
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

// GetCustomDomainTarget handles GET /api/public/custom-domain-target
// Used by Next.js middleware to determine if an incoming subdomain request should be 301 redirected
// to an active custom domain.
func (h *DomainHandler) GetCustomDomainTarget(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	if host == "" {
		host = r.Header.Get("X-Forwarded-Host")
		if host == "" {
			host = r.Host
		}
	}

	customDomain, err := h.domainService.GetActiveCustomDomainByHost(r.Context(), host)
	if err != nil || customDomain == nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"custom_domain": nil,
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"custom_domain": customDomain.Hostname,
	})
}
