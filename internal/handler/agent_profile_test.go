package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// 1. Verification of GET /api/agent/me: Ensure existing fields are intact and new fields are present.
func TestAgentProfile_GetMe_HasAllFields(t *testing.T) {
	agentRouter, _, _, _, _, _, _, _, t1, _, ag1, _, sess1 := setupAgentPayoutTestEnv()
	_ = t1

	req := httptest.NewRequest(http.MethodGet, "/api/agent/me", nil)
	req.Header.Set("Authorization", "Bearer "+sess1.Token)
	w := httptest.NewRecorder()
	agentRouter.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Verify all existing fields are present
	existingFields := []string{
		"id", "tenant_id", "name", "phone", "email", "domisili",
		"status", "payment_status", "payment_proof_url", "referral_code", "created_at",
	}
	for _, f := range existingFields {
		if _, exists := res[f]; !exists {
			t.Errorf("expected existing field '%s' in GET /api/agent/me response", f)
		}
	}

	// Verify new fields are present
	newFields := []string{"photo_url", "bank_name", "bank_account_number", "bank_account_holder"}
	for _, f := range newFields {
		if _, exists := res[f]; !exists {
			t.Errorf("expected new field '%s' in GET /api/agent/me response", f)
		}
	}

	if res["name"] != ag1.Name {
		t.Errorf("expected name %s, got %v", ag1.Name, res["name"])
	}
	if res["bank_name"] != *ag1.BankName {
		t.Errorf("expected bank_name %s, got %v", *ag1.BankName, res["bank_name"])
	}
}

// 2. Duplicate Email & Phone Validation:
// - Same tenant duplicate -> 400 Bad Request
// - Different tenant duplicate -> 200 OK (allowed)
func TestAgentProfile_UpdateProfile_DuplicateValidationAndCrossTenant(t *testing.T) {
	agentRouter, _, agentRepo, agentSessionRepo, _, _, _, _, t1, t2, _, ag2, sess1 := setupAgentPayoutTestEnv()

	// Add Agent 3 in Tenant 1 with existing email & phone
	ag3 := &repository.Agent{
		TenantID:     t1.ID,
		Name:         "Agent Tiga",
		Email:        strPtr("tiga@amanah.com"),
		Phone:        strPtr("081299990001"),
		ReferralCode: "TIGA01",
		Status:       "active",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, ag3)

	// Agent 4 in Tenant 2 with email "berkah_user@travel.com"
	ag4 := &repository.Agent{
		TenantID:     t2.ID,
		Name:         "Agent Empat",
		Email:        strPtr("berkah_user@travel.com"),
		Phone:        strPtr("081288880002"),
		ReferralCode: "EMPAT02",
		Status:       "active",
	}
	_ = agentRepo.Create(context.Background(), t2.ID, ag4)

	// Sub-test 2a: Try to update Agent 1's email to Agent 3's email (SAME tenant) -> MUST BE 400
	{
		body, _ := json.Marshal(map[string]string{
			"email": "tiga@amanah.com",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/agent/profile", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		agentRouter.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 when changing to duplicate email in same tenant, got %d: %s", w.Code, w.Body.String())
		}
	}

	// Sub-test 2b: Try to update Agent 1's phone to Agent 3's phone (SAME tenant) -> MUST BE 400
	{
		body, _ := json.Marshal(map[string]string{
			"phone": "081299990001",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/agent/profile", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		agentRouter.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 when changing to duplicate phone in same tenant, got %d: %s", w.Code, w.Body.String())
		}
	}

	// Sub-test 2c: Try to update Agent 1's email to Agent 4's email (DIFFERENT tenant) -> MUST SUCCEED (200 OK)
	{
		body, _ := json.Marshal(map[string]string{
			"email": "berkah_user@travel.com",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/agent/profile", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		agentRouter.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 when changing to email existing in another tenant, got %d: %s", w.Code, w.Body.String())
		}

		var res map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		if res["email"] != "berkah_user@travel.com" {
			t.Errorf("expected email to be updated to berkah_user@travel.com, got %v", res["email"])
		}
	}

	// Sub-test 2d: Update bank info in profile -> 200 OK
	{
		body, _ := json.Marshal(map[string]string{
			"bank_name":           "Mandiri",
			"bank_account_number": "987654321",
			"bank_account_holder": "Fulan bin Fulan",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/agent/profile", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		agentRouter.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 for bank update, got %d: %s", w.Code, w.Body.String())
		}
		var res map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		if res["bank_name"] != "Mandiri" {
			t.Errorf("expected bank_name Mandiri, got %v", res["bank_name"])
		}
	}

	_ = ag2
	_ = agentSessionRepo
}

// 3. Password Update Validation:
// - Wrong current_password -> 401 Unauthorized, old password still works
// - New password < 8 chars -> 400 Bad Request
// - Correct update -> 200 OK, new password works
func TestAgentProfile_UpdatePassword_Validation(t *testing.T) {
	agentRouter, _, agentRepo, _, _, _, _, _, t1, _, ag1, _, sess1 := setupAgentPayoutTestEnv()

	// Set initial password for ag1
	oldPass := "oldPassword123"
	oldHash, _ := util.HashPassword(oldPass)
	ag1.PasswordHash = &oldHash
	_ = agentRepo.Update(context.Background(), t1.ID, ag1)

	// Sub-test 3a: Wrong current_password -> 401
	{
		body, _ := json.Marshal(map[string]string{
			"current_password": "wrongPassword",
			"new_password":     "newPassword456",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/agent/password", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		agentRouter.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 for wrong current_password, got %d: %s", w.Code, w.Body.String())
		}

		// Verify old password still matches
		updated, _ := agentRepo.GetByID(context.Background(), t1.ID, ag1.ID)
		if !util.CheckPasswordHash(oldPass, *updated.PasswordHash) {
			t.Errorf("old password hash was modified after failed attempt")
		}
	}

	// Sub-test 3b: New password < 8 characters -> 400
	{
		body, _ := json.Marshal(map[string]string{
			"current_password": oldPass,
			"new_password":     "short",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/agent/password", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		agentRouter.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for short new_password, got %d: %s", w.Code, w.Body.String())
		}
	}

	// Sub-test 3c: Success -> 200 OK
	{
		newPass := "validNewPassword789"
		body, _ := json.Marshal(map[string]string{
			"current_password": oldPass,
			"new_password":     newPass,
		})
		req := httptest.NewRequest(http.MethodPut, "/api/agent/password", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		agentRouter.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 for successful password update, got %d: %s", w.Code, w.Body.String())
		}

		// Verify new password is now active
		updated, _ := agentRepo.GetByID(context.Background(), t1.ID, ag1.ID)
		if !util.CheckPasswordHash(newPass, *updated.PasswordHash) {
			t.Errorf("expected new password to match stored hash")
		}
	}
}

// 4. Profile Photo Upload:
// - Saves to /uploads/{tenant_id}/agents/{agent_id}/photo.webp
// - Subsequent upload overwrites the same file (does not accumulate)
func TestAgentProfile_UploadPhoto_OverwritesSingleFile(t *testing.T) {
	agentRouter, _, _, _, _, _, _, _, t1, _, ag1, _, sess1 := setupAgentPayoutTestEnv()

	expectedRelPath := filepath.ToSlash(filepath.Join("/uploads", "1", "agents", "1", "photo.webp"))
	expectedDiskPath := filepath.Join(".", "uploads", "1", "agents", "1", "photo.webp")
	defer os.RemoveAll(filepath.Join(".", "uploads", "1"))

	createDummyJPEG := func(c color.Color) []byte {
		img := image.NewRGBA(image.Rect(0, 0, 100, 100))
		for y := 0; y < 100; y++ {
			for x := 0; x < 100; x++ {
				img.Set(x, y, c)
			}
		}
		var buf bytes.Buffer
		_ = jpeg.Encode(&buf, img, nil)
		return buf.Bytes()
	}

	uploadPhoto := func(imgBytes []byte) (*httptest.ResponseRecorder, map[string]interface{}) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("photo", "avatar.jpg")
		if err != nil {
			t.Fatalf("failed to create form file: %v", err)
		}
		_, _ = io.Copy(part, bytes.NewReader(imgBytes))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/agent/profile/photo", body)
		req.Header.Set("Authorization", "Bearer "+sess1.Token)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		agentRouter.ServeHTTP(w, req)

		var res map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		return w, res
	}

	// First upload (Red)
	w1, res1 := uploadPhoto(createDummyJPEG(color.RGBA{R: 255, A: 255}))
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 on first photo upload, got %d: %s", w1.Code, w1.Body.String())
	}
	if res1["photo_url"] != expectedRelPath {
		t.Errorf("expected photo_url %s, got %v", expectedRelPath, res1["photo_url"])
	}

	fi1, err := os.Stat(expectedDiskPath)
	if err != nil {
		t.Fatalf("expected file to exist at %s: %v", expectedDiskPath, err)
	}
	modTime1 := fi1.ModTime()

	// Short pause to ensure mtime difference
	time.Sleep(50 * time.Millisecond)

	// Second upload (Blue) - must overwrite
	w2, res2 := uploadPhoto(createDummyJPEG(color.RGBA{B: 255, A: 255}))
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 on second photo upload, got %d: %s", w2.Code, w2.Body.String())
	}
	if res2["photo_url"] != expectedRelPath {
		t.Errorf("expected photo_url to remain %s, got %v", expectedRelPath, res2["photo_url"])
	}

	fi2, err := os.Stat(expectedDiskPath)
	if err != nil {
		t.Fatalf("expected file to still exist at %s: %v", expectedDiskPath, err)
	}

	// Verify only 1 file in the agent's folder
	files, err := os.ReadDir(filepath.Dir(expectedDiskPath))
	if err != nil {
		t.Fatalf("failed to read agent folder: %v", err)
	}
	if len(files) != 1 {
		t.Errorf("expected exactly 1 file in agent photo folder, got %d", len(files))
	}

	if fi2.ModTime().Before(modTime1) {
		t.Errorf("expected file to be updated/overwritten")
	}

	_ = t1
	_ = ag1
}
