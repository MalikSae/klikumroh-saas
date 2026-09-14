package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

func (h *PackageHandler) UploadPhoto(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	packageID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid package id"})
		return
	}

	// Verify package belongs to tenant BEFORE processing heavy file upload
	if _, err := h.packageService.GetByID(r.Context(), tenantID, packageID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "paket tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	// Limit request to 8MB
	r.Body = http.MaxBytesReader(w, r.Body, 8<<20)

	if err := r.ParseMultipartForm(8 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "file too large (max 8MB) or invalid format"})
		return
	}

	file, _, err := r.FormFile("photo")
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'photo' field"})
		return
	}
	defer file.Close()

	// Read bytes to detect content type and process
	fileBytes, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
		return
	}

	// Prepare path
	fileName := uuid.New().String() + ".webp"
	relPath := fmt.Sprintf("/uploads/%d/packages/%d/%s", tenantID, packageID, fileName)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "packages", fmt.Sprintf("%d", packageID), fileName)

	if err := util.ConvertAndSaveWebP(fileBytes, absPath, 1600, 80); err != nil {
		if errors.Is(err, util.ErrInvalidImageFormat) || errors.Is(err, util.ErrCorruptImage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to encode webp"})
		return
	}

	// Save to DB
	photo := &repository.PackagePhoto{
		PackageID: packageID,
		FilePath:  relPath,
	}

	if err := h.photoService.Create(r.Context(), tenantID, photo); err != nil {
		// Clean up file if db fails
		os.Remove(absPath)
		if errors.Is(err, repository.ErrNotFound) { // from package check
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "paket tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusCreated, photo)
}

func (h *PackageHandler) DeletePhoto(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	photoIdStr := chi.URLParam(r, "photoId")
	photoID, err := strconv.ParseUint(photoIdStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid photo id"})
		return
	}

	photo, err := h.photoService.Delete(r.Context(), tenantID, photoID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "photo not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	// Delete physical file
	absPath := filepath.Join(".", photo.FilePath)
	os.Remove(absPath) // Ignore error, just log it internally if we had a logger

	respondJSON(w, http.StatusOK, map[string]string{"message": "foto berhasil dihapus"})
}

func (h *PackageHandler) MovePhoto(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	photoIdStr := chi.URLParam(r, "photoId")
	photoID, err := strconv.ParseUint(photoIdStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid photo id"})
		return
	}

	var payload struct {
		Direction string `json:"direction"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	if err := h.photoService.Move(r.Context(), tenantID, photoID, payload.Direction); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "photo not found"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "urutannya berhasil diubah"})
}
