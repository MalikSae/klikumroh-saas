package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthHandler handles HTTP endpoints for authentication.
type AuthHandler struct {
	authService service.AuthService
	// Brute-force protection: failed logins per email, plus a per-IP cap on login calls.
	loginFailures *middleware.LoginFailureLimiter
	loginLimiter  func(http.Handler) http.Handler
}

// NewAuthHandler creates a new AuthHandler instance.
func NewAuthHandler(authService service.AuthService) *AuthHandler {
	return &AuthHandler{
		authService:   authService,
		loginFailures: middleware.NewLoginFailureLimiter(5, 15*time.Minute),
		loginLimiter:  middleware.NewIPRateLimiter(20, time.Minute),
	}
}

// RegisterRoutes mounts the auth routes onto the chi router.
func (h *AuthHandler) RegisterRoutes(r chi.Router) {
	r.With(h.loginLimiter).Post("/api/auth/login", h.Login)
	r.With(h.loginLimiter).Post("/api/auth/demo-login", h.DemoLogin)
	r.Post("/api/auth/logout", h.Logout)
	r.With(h.loginLimiter).Post("/api/auth/handoff/exchange", h.ExchangeHandoff)
}

// DemoLogin handles POST /api/auth/demo-login: the "Coba demo" button signs in as the admin of the demo
// travel (slug DEMO_SLUG, default "demo"). 404 when there is no travel marked is_demo with that slug.
func (h *AuthHandler) DemoLogin(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(os.Getenv("DEMO_SLUG"))
	if slug == "" {
		slug = "demo"
	}
	res, err := h.authService.DemoLogin(r.Context(), slug)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "demo belum tersedia"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	h.respondLogin(w, r, res)
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

	key := middleware.LoginKey("admin", req.Email)
	if h.loginFailures != nil && h.loginFailures.Blocked(key) {
		respondJSON(w, http.StatusTooManyRequests, map[string]string{"error": middleware.LoginLockedMessage})
		return
	}

	res, err := h.authService.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			if h.loginFailures != nil {
				h.loginFailures.Fail(key)
			}
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	if h.loginFailures != nil {
		h.loginFailures.Reset(key)
	}
	h.respondLogin(w, r, res)
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
