package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/service"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthHandler handles HTTP endpoints for authentication.
type AuthHandler struct {
	authService service.AuthService
}

// NewAuthHandler creates a new AuthHandler instance.
func NewAuthHandler(authService service.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

// RegisterRoutes mounts the auth routes onto the chi router.
func (h *AuthHandler) RegisterRoutes(r chi.Router) {
	r.Post("/api/auth/login", h.Login)
	r.Post("/api/auth/logout", h.Logout)
}

// Login handles POST /api/auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" || req.Password == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "email and password are required"})
		return
	}

	res, err := h.authService.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, res)
}

// Logout handles POST /api/auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "authorization header is required"})
		return
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid authorization format"})
		return
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "token is required"})
		return
	}

	if err := h.authService.Logout(r.Context(), token); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to logout"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "logged out successfully"})
}

func respondJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(data)
}
