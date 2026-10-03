package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// AgentHabitHandler serves the agent habit tracker and the "99 sumber jamaah" progress.
type AgentHabitHandler struct {
	svc service.AgentHabitService
}

// NewAgentHabitHandler creates the handler.
func NewAgentHabitHandler(svc service.AgentHabitService) *AgentHabitHandler {
	return &AgentHabitHandler{svc: svc}
}

// RegisterRoutes mounts the routes on the agent-authenticated router.
func (h *AgentHabitHandler) RegisterRoutes(r chi.Router) {
	r.Get("/api/agent/habits", h.GetSummary)
	r.Post("/api/agent/habits/log", h.Log)
	r.Get("/api/agent/sumber-progress", h.ListSumber)
	r.Put("/api/agent/sumber-progress/{id}", h.SetSumber)
}

func agentScope(w http.ResponseWriter, r *http.Request) (uint64, uint64, bool) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return 0, 0, false
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return 0, 0, false
	}
	return tenantID, agentID, true
}

func respondHabitError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrAgentNotActive):
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "Akun belum aktif"})
	case errors.Is(err, repository.ErrNotFound):
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	case errors.Is(err, service.ErrUnknownHabit), errors.Is(err, service.ErrUnknownSumber):
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	default:
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
	}
}

// GET /api/agent/habits
func (h *AgentHabitHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	tenantID, agentID, ok := agentScope(w, r)
	if !ok {
		return
	}
	summary, err := h.svc.GetSummary(r.Context(), tenantID, agentID)
	if err != nil {
		respondHabitError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, summary)
}

// POST /api/agent/habits/log {"habit": "share" | "contact" | "caption"}
func (h *AgentHabitHandler) Log(w http.ResponseWriter, r *http.Request) {
	tenantID, agentID, ok := agentScope(w, r)
	if !ok {
		return
	}
	var req struct {
		Habit string `json:"habit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := h.svc.LogHabit(r.Context(), tenantID, agentID, req.Habit); err != nil {
		respondHabitError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/agent/sumber-progress
func (h *AgentHabitHandler) ListSumber(w http.ResponseWriter, r *http.Request) {
	tenantID, agentID, ok := agentScope(w, r)
	if !ok {
		return
	}
	ids, err := h.svc.ListSumberDone(r.Context(), tenantID, agentID)
	if err != nil {
		respondHabitError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string][]int{"done": ids})
}

// PUT /api/agent/sumber-progress/{id} {"done": true|false}
func (h *AgentHabitHandler) SetSumber(w http.ResponseWriter, r *http.Request) {
	tenantID, agentID, ok := agentScope(w, r)
	if !ok {
		return
	}
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "id tidak valid"})
		return
	}
	var req struct {
		Done bool `json:"done"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := h.svc.SetSumberDone(r.Context(), tenantID, agentID, id, req.Done); err != nil {
		respondHabitError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// RegisterDashboardRoutes mounts the travel admin's view of the agents' daily syiar (admin-authenticated
// router; the tenant comes from the admin's session).
func (h *AgentHabitHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/agent-habits", h.DashboardOverview)
	r.Get("/api/dashboard/agents/{id}/habits", h.DashboardAgentReport)
}

// GET /api/dashboard/agent-habits
func (h *AgentHabitHandler) DashboardOverview(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	rows, err := h.svc.TenantOverview(r.Context(), tenantID)
	if err != nil {
		respondHabitError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"agents": rows})
}

// GET /api/dashboard/agents/{id}/habits
func (h *AgentHabitHandler) DashboardAgentReport(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent id"})
		return
	}
	report, err := h.svc.AgentReport(r.Context(), tenantID, agentID)
	if err != nil {
		respondHabitError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, report)
}

// AgentInsightHandler serves the agent summary on the travel dashboard home.
type AgentInsightHandler struct {
	svc service.AgentInsightService
}

// NewAgentInsightHandler creates the dashboard agent summary handler.
func NewAgentInsightHandler(svc service.AgentInsightService) *AgentInsightHandler {
	return &AgentInsightHandler{svc: svc}
}

// RegisterDashboardRoutes mounts GET /api/dashboard/agent-summary (admin-authenticated router).
func (h *AgentInsightHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/agent-summary", h.Summary)
}

// GET /api/dashboard/agent-summary
func (h *AgentInsightHandler) Summary(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	summary, err := h.svc.Summary(r.Context(), tenantID)
	if err != nil {
		respondHabitError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, summary)
}
