package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

func setupStaffUsersTestRouter() (http.Handler, *mockStaffRepo, string) {
	mockStaff := newMockStaffRepo()
	mockSession := newMockSessionRepoSub()

	staffUser := &repository.StaffUser{
		ID:           1,
		Name:         "Master Admin",
		Email:        "staff@klikumroh.id",
		PasswordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890",
		Status:       "active",
		CreatedAt:    time.Now(),
	}
	_ = mockStaff.Create(nil, staffUser)

	token := "test_staff_token_secret_123"
	_ = mockStaff.CreateSession(nil, &repository.StaffSession{
		ID:          1,
		StaffUserID: 1,
		Token:       token,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	})

	staffSvc := service.NewStaffService(
		mockStaff,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		mockSession,
	)
	staffH := handler.NewStaffHandler(staffSvc)

	r := chi.NewRouter()
	r.Group(func(staffProtected chi.Router) {
		staffProtected.Use(middleware.StaffAuthMiddleware(mockStaff, mockSession))
		staffProtected.Get("/api/staff/users", staffH.ListStaffUsers)
		staffProtected.Post("/api/staff/users", staffH.CreateStaffUser)
		staffProtected.Put("/api/staff/users/{id}", staffH.UpdateStaffUser)
	})

	return r, mockStaff, token
}

func TestListStaffUsers_Unauthorized(t *testing.T) {
	router, _, _ := setupStaffUsersTestRouter()

	req := httptest.NewRequest("GET", "/api/staff/users", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", rec.Code)
	}
}

func TestListStaffUsers_Success(t *testing.T) {
	router, _, token := setupStaffUsersTestRouter()

	req := httptest.NewRequest("GET", "/api/staff/users", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d, body: %s", rec.Code, rec.Body.String())
	}

	var users []service.StaffUserInfo
	if err := json.NewDecoder(rec.Body).Decode(&users); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(users) != 1 {
		t.Fatalf("expected 1 staff user, got %d", len(users))
	}
	if users[0].Email != "staff@klikumroh.id" {
		t.Fatalf("expected staff@klikumroh.id, got %s", users[0].Email)
	}
}

func TestCreateStaffUser_Success(t *testing.T) {
	router, mockStaff, token := setupStaffUsersTestRouter()

	body := map[string]string{
		"name":     "Support Staff",
		"email":    "support@klikumroh.id",
		"password": "Password123!",
		"status":   "active",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/api/staff/users", bytes.NewReader(bodyBytes))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d, body: %s", rec.Code, rec.Body.String())
	}

	var created service.StaffUserInfo
	if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if created.Email != "support@klikumroh.id" {
		t.Fatalf("expected email support@klikumroh.id, got %s", created.Email)
	}

	// Verify in repository
	saved, err := mockStaff.FindByEmail(nil, "support@klikumroh.id")
	if err != nil {
		t.Fatalf("expected user saved in repository, got error: %v", err)
	}
	if saved.PasswordHash == "Password123!" || len(saved.PasswordHash) == 0 {
		t.Fatalf("password must be bcrypt hashed, got: %s", saved.PasswordHash)
	}
}

func TestCreateStaffUser_DuplicateEmail(t *testing.T) {
	router, _, token := setupStaffUsersTestRouter()

	body := map[string]string{
		"name":     "Duplicate Admin",
		"email":    "staff@klikumroh.id", // already exists
		"password": "Password123!",
		"status":   "active",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/api/staff/users", bytes.NewReader(bodyBytes))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict, got %d, body: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateStaffUser_ShortPassword(t *testing.T) {
	router, _, token := setupStaffUsersTestRouter()

	body := map[string]string{
		"name":     "Short Pass",
		"email":    "short@klikumroh.id",
		"password": "short", // < 8 characters
		"status":   "active",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/api/staff/users", bytes.NewReader(bodyBytes))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d, body: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateStaffUser_Success(t *testing.T) {
	router, mockStaff, token := setupStaffUsersTestRouter()

	// Seed another staff user (ID: 2)
	u2 := &repository.StaffUser{
		ID:           2,
		Name:         "Old Name",
		Email:        "user2@klikumroh.id",
		PasswordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890",
		Status:       "active",
	}
	_ = mockStaff.Create(nil, u2)

	body := map[string]interface{}{
		"name":     "Updated Name",
		"email":    "user2@klikumroh.id",
		"password": "NewSecretPassword2026!",
		"status":   "inactive",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("PUT", "/api/staff/users/2", bytes.NewReader(bodyBytes))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d, body: %s", rec.Code, rec.Body.String())
	}

	var updated service.StaffUserInfo
	if err := json.NewDecoder(rec.Body).Decode(&updated); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if updated.Name != "Updated Name" || updated.Status != "inactive" {
		t.Fatalf("unexpected updated fields: %+v", updated)
	}
}

func TestUpdateStaffUser_PreventDeactivateSelf(t *testing.T) {
	router, _, token := setupStaffUsersTestRouter()

	// Attempt to deactivate current logged-in user (ID: 1)
	body := map[string]interface{}{
		"name":   "Master Admin",
		"email":  "staff@klikumroh.id",
		"status": "inactive", // forbidden for self
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("PUT", "/api/staff/users/1", bytes.NewReader(bodyBytes))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for deactivating self, got %d, body: %s", rec.Code, rec.Body.String())
	}
}
