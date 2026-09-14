package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type AgentTargetHandler struct {
	targetService service.AgentTargetService
}

func NewAgentTargetHandler(targetService service.AgentTargetService) *AgentTargetHandler {
	return &AgentTargetHandler{targetService: targetService}
}

func (h *AgentTargetHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/tenant/targets", h.ListTargets)
	r.Post("/api/dashboard/tenant/targets", h.CreateTarget)
	r.Put("/api/dashboard/tenant/targets/{id}", h.UpdateTarget)
	r.Delete("/api/dashboard/tenant/targets/{id}", h.DeleteTarget)
	r.Get("/api/dashboard/tenant/targets/{id}/progress", h.GetTargetProgress)
	r.Post("/api/dashboard/tenant/targets/{id}/close", h.CloseTarget)
	r.Get("/api/dashboard/tenant/targets/{id}/achievements", h.ListAchievements)
	r.Patch("/api/dashboard/tenant/achievements/{id}/reward", h.MarkReward)
	r.Get("/api/dashboard/tenant/targets/{id}/achievements/export", h.ExportAchievementsCSV)
}

// GET /api/dashboard/tenant/targets?status=
func (h *AgentTargetHandler) ListTargets(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var statusFilter *string
	if s := strings.TrimSpace(r.URL.Query().Get("status")); s != "" {
		statusFilter = &s
	}

	targets, err := h.targetService.ListTargets(r.Context(), tenantID, statusFilter)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengambil daftar target"})
		return
	}
	if targets == nil {
		targets = []repository.AgentTarget{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"targets": targets,
	})
}

// POST /api/dashboard/tenant/targets
func (h *AgentTargetHandler) CreateTarget(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var adminUserIDPtr *uint64
	if adminUserID, okAdmin := middleware.GetAdminUserID(r.Context()); okAdmin {
		adminUserIDPtr = &adminUserID
	}

	var input service.CreateTargetInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	target, err := h.targetService.CreateTarget(r.Context(), tenantID, adminUserIDPtr, &input)
	if err != nil {
		if errors.Is(err, service.ErrInvalidMetricType) ||
			errors.Is(err, service.ErrInvalidMetricValue) ||
			errors.Is(err, service.ErrInvalidPeriod) ||
			errors.Is(err, service.ErrInvalidDateFormat) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal membuat target"})
		return
	}

	respondJSON(w, http.StatusCreated, target)
}

// PUT /api/dashboard/tenant/targets/{id}
func (h *AgentTargetHandler) UpdateTarget(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	targetID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID target tidak valid"})
		return
	}

	var input service.UpdateTargetInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	target, err := h.targetService.UpdateTarget(r.Context(), tenantID, targetID, &input)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "target tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrInvalidMetricValue) ||
			errors.Is(err, service.ErrInvalidPeriod) ||
			errors.Is(err, service.ErrInvalidDateFormat) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memperbarui target"})
		return
	}

	respondJSON(w, http.StatusOK, target)
}

// DELETE /api/dashboard/tenant/targets/{id}
func (h *AgentTargetHandler) DeleteTarget(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	targetID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID target tidak valid"})
		return
	}

	if err := h.targetService.DeleteTarget(r.Context(), tenantID, targetID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "target tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrCannotDeleteWithAchievements) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal menghapus target"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "target berhasil dihapus"})
}

// GET /api/dashboard/tenant/targets/{id}/progress
func (h *AgentTargetHandler) GetTargetProgress(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	targetID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID target tidak valid"})
		return
	}

	resp, err := h.targetService.GetTargetProgress(r.Context(), tenantID, targetID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "target tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengambil data progres target"})
		return
	}

	respondJSON(w, http.StatusOK, resp)
}

// POST /api/dashboard/tenant/targets/{id}/close
func (h *AgentTargetHandler) CloseTarget(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	adminUserID, okAdmin := middleware.GetAdminUserID(r.Context())
	if !okAdmin {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "admin unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	targetID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID target tidak valid"})
		return
	}

	achievedCount, err := h.targetService.CloseTargetPeriod(r.Context(), tenantID, targetID, adminUserID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "target tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrTargetAlreadyClosed) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal menutup periode target"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":        "periode target berhasil ditutup",
		"achieved_count": achievedCount,
	})
}

// GET /api/dashboard/tenant/targets/{id}/achievements
func (h *AgentTargetHandler) ListAchievements(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	targetID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID target tidak valid"})
		return
	}

	progressResp, err := h.targetService.GetTargetProgress(r.Context(), tenantID, targetID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "target tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengambil data target"})
		return
	}

	achievements, err := h.targetService.ListAchievements(r.Context(), tenantID, targetID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengambil daftar pencapaian"})
		return
	}
	if achievements == nil {
		achievements = []service.AchievementDTO{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"target":       progressResp.Target,
		"achievements": achievements,
	})
}

// PATCH /api/dashboard/tenant/achievements/{id}/reward
func (h *AgentTargetHandler) MarkReward(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	adminUserID, okAdmin := middleware.GetAdminUserID(r.Context())
	if !okAdmin {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "admin unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	achievementID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID achievement tidak valid"})
		return
	}

	var body struct {
		Notes *string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	if err := h.targetService.MarkRewardGiven(r.Context(), tenantID, achievementID, adminUserID, body.Notes); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "data pencapaian tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrTargetNotClosed) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memperbarui status reward"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "status reward berhasil diperbarui",
	})
}

// GET /api/dashboard/tenant/targets/{id}/achievements/export
func (h *AgentTargetHandler) ExportAchievementsCSV(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	targetID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID target tidak valid"})
		return
	}

	csvBytes, err := h.targetService.ExportAchievementsCSV(r.Context(), tenantID, targetID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "target tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengekspor data pencapaian"})
		return
	}

	filename := fmt.Sprintf("pencapaian-target-%d-%s.csv", targetID, time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(csvBytes)
}

