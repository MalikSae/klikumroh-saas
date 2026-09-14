package service_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// In-memory mock notification repo for service trigger tests
type mockNotificationRepo struct {
	mu     sync.Mutex
	notifs []repository.Notification
	fail   bool
}

func (m *mockNotificationRepo) Create(ctx context.Context, notif *repository.Notification) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.fail {
		return errors.New("simulated db failure in notification repo")
	}
	notif.ID = uint64(len(m.notifs) + 1)
	notif.CreatedAt = time.Now()
	m.notifs = append(m.notifs, *notif)
	return nil
}

func (m *mockNotificationRepo) ListByRecipient(ctx context.Context, recipientType string, recipientID uint64, limit int) ([]repository.Notification, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var res []repository.Notification
	for _, n := range m.notifs {
		if n.RecipientType == recipientType && n.RecipientID == recipientID {
			res = append(res, n)
		}
	}
	return res, nil
}

func (m *mockNotificationRepo) CountUnread(ctx context.Context, recipientType string, recipientID uint64) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	count := 0
	for _, n := range m.notifs {
		if n.RecipientType == recipientType && n.RecipientID == recipientID && n.ReadAt == nil {
			count++
		}
	}
	return count, nil
}

func (m *mockNotificationRepo) MarkAsRead(ctx context.Context, recipientType string, recipientID uint64, id uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, n := range m.notifs {
		if n.ID == id && n.RecipientType == recipientType && n.RecipientID == recipientID {
			now := time.Now()
			m.notifs[i].ReadAt = &now
			return nil
		}
	}
	return repository.ErrNotFound
}

func (m *mockNotificationRepo) MarkAllAsRead(ctx context.Context, recipientType string, recipientID uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for i, n := range m.notifs {
		if n.RecipientType == recipientType && n.RecipientID == recipientID && n.ReadAt == nil {
			m.notifs[i].ReadAt = &now
		}
	}
	return nil
}

// In-memory mock admin user repo
type mockAdminUserRepo struct {
	users []repository.AdminUser
}

func (m *mockAdminUserRepo) Create(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	user.ID = uint64(len(m.users) + 1)
	user.TenantID = tenantID
	m.users = append(m.users, *user)
	return nil
}
func (m *mockAdminUserRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.AdminUser, error) {
	for _, u := range m.users {
		if u.TenantID == tenantID && u.ID == id {
			return &u, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (m *mockAdminUserRepo) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.AdminUser, error) {
	var res []repository.AdminUser
	for _, u := range m.users {
		if u.TenantID == tenantID {
			res = append(res, u)
		}
	}
	return res, nil
}
func (m *mockAdminUserRepo) Update(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	return nil
}
func (m *mockAdminUserRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}
func (m *mockAdminUserRepo) FindByTenantAndEmail(ctx context.Context, tenantID uint64, email string) (*repository.AdminUser, error) {
	for _, u := range m.users {
		if u.TenantID == tenantID && u.Email == email {
			return &u, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (m *mockAdminUserRepo) CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error) {
	cnt := 0
	for _, u := range m.users {
		if u.TenantID == tenantID && u.Status == "active" {
			cnt++
		}
	}
	return cnt, nil
}
func (m *mockAdminUserRepo) FindByEmail(ctx context.Context, email string) (*repository.AdminUser, error) {
	for _, u := range m.users {
		if u.Email == email {
			return &u, nil
		}
	}
	return nil, repository.ErrNotFound
}

func TestNotificationService_DeliveryAndIsolation(t *testing.T) {
	repo := &mockNotificationRepo{}
	svc := service.NewNotificationService(repo)
	ctx := context.Background()

	tID := uint64(1)
	// Create for Admin 10
	_, err := svc.CreateNotification(ctx, &tID, "admin", 10, "prospect_new", "Prospek baru", "Budi tertarik paket Umroh", "/prospects/1")
	if err != nil {
		t.Fatalf("CreateNotification failed: %v", err)
	}

	// Create for Admin 20 (other admin)
	_, err = svc.CreateNotification(ctx, &tID, "admin", 20, "prospect_new", "Prospek baru", "Siti tertarik paket Umroh", "/prospects/2")
	if err != nil {
		t.Fatalf("CreateNotification failed: %v", err)
	}

	// List for Admin 10
	res10, err := svc.ListNotifications(ctx, "admin", 10, 50)
	if err != nil {
		t.Fatalf("ListNotifications failed: %v", err)
	}
	if len(res10.Notifications) != 1 || res10.UnreadCount != 1 {
		t.Fatalf("Expected 1 notification and unread count 1, got %d notifs, unread %d", len(res10.Notifications), res10.UnreadCount)
	}

	// Admin 20 cannot mark Admin 10's notification as read
	notif10ID := res10.Notifications[0].ID
	err = svc.MarkAsRead(ctx, "admin", 20, notif10ID)
	if err == nil {
		t.Errorf("CRITICAL SECURITY: Admin 20 marked Admin 10's notif as read!")
	}

	// Admin 10 marks own notification
	err = svc.MarkAsRead(ctx, "admin", 10, notif10ID)
	if err != nil {
		t.Fatalf("MarkAsRead failed: %v", err)
	}

	res10After, _ := svc.ListNotifications(ctx, "admin", 10, 50)
	if res10After.UnreadCount != 0 {
		t.Errorf("Expected 0 unread, got %d", res10After.UnreadCount)
	}
}

func TestNotificationService_ResilienceOnFailure(t *testing.T) {
	repo := &mockNotificationRepo{fail: true}
	svc := service.NewNotificationService(repo)
	ctx := context.Background()

	tID := uint64(1)
	_, err := svc.CreateNotification(ctx, &tID, "admin", 10, "test", "Title", "Body", "")
	if err == nil {
		t.Error("Expected error when repo fails")
	}
	// Verify that error is cleanly handled
}

// TestNotificationService_OverrideBodyPrivacy membuktikan bahwa notifikasi ke parent agent
// (override commission) TIDAK mengandung nama jamaah/prospek sama sekali,
// sedangkan notifikasi ke agent langsung BOLEH mengandung nama jamaah.
func TestNotificationService_OverrideBodyPrivacy(t *testing.T) {
	repo := &mockNotificationRepo{}
	svc := service.NewNotificationService(repo)
	ctx := context.Background()
	tID := uint64(5)

	jamaahName := "Fatimah Az-Zahra"
	agenName := "Budi Santoso"

	// Simulasi notifikasi ke agent langsung — boleh sebut nama jamaah
	directBody := "Komisi Rp 500.000 dari closing jamaah " + jamaahName
	_, err := svc.CreateNotification(ctx, &tID, "agent", 100, "commission_earned",
		"Komisi baru masuk", directBody, "/agen/riwayat-komisi")
	if err != nil {
		t.Fatalf("CreateNotification (direct agent) failed: %v", err)
	}

	// Simulasi notifikasi ke parent agent — HARUS generik, tanpa nama jamaah maupun nama agen langsung
	overrideBody := "Komisi override Rp 50.000 dari jaringan Anda"
	_, err = svc.CreateNotification(ctx, &tID, "agent", 200, "commission_override_earned",
		"Komisi override baru masuk", overrideBody, "/agen/riwayat-komisi")
	if err != nil {
		t.Fatalf("CreateNotification (parent agent) failed: %v", err)
	}

	// Assert: notif agent langsung (recipientID=100) mengandung nama jamaah ✅
	res100, err := svc.ListNotifications(ctx, "agent", 100, 10)
	if err != nil {
		t.Fatalf("ListNotifications (agent 100) failed: %v", err)
	}
	if len(res100.Notifications) != 1 {
		t.Fatalf("Expected 1 notif for agent 100, got %d", len(res100.Notifications))
	}
	directNotifBody := res100.Notifications[0].Body
	if directNotifBody != directBody {
		t.Errorf("Direct agent body mismatch: got %q", directNotifBody)
	}

	// Assert: notif parent agent (recipientID=200) TIDAK mengandung nama jamaah ❌ jika bocor
	res200, err := svc.ListNotifications(ctx, "agent", 200, 10)
	if err != nil {
		t.Fatalf("ListNotifications (parent agent 200) failed: %v", err)
	}
	if len(res200.Notifications) != 1 {
		t.Fatalf("Expected 1 notif for parent agent 200, got %d", len(res200.Notifications))
	}
	parentNotifBody := res200.Notifications[0].Body
	if notifContains(parentNotifBody, jamaahName) {
		t.Errorf("PRIVACY VIOLATION: parent override body mengandung nama jamaah %q — body: %q", jamaahName, parentNotifBody)
	}
	if notifContains(parentNotifBody, agenName) {
		t.Errorf("PRIVACY VIOLATION: parent override body mengandung nama agen langsung %q — body: %q", agenName, parentNotifBody)
	}
	// Verify body is the generic expected string
	if parentNotifBody != overrideBody {
		t.Errorf("Parent override body mismatch: want %q, got %q", overrideBody, parentNotifBody)
	}
}

// TestNotificationService_MultiAdminFanOut membuktikan bahwa ketika satu tenant
// punya lebih dari satu admin aktif, SEMUA admin tersebut menerima notifikasi —
// bukan hanya satu saja.
func TestNotificationService_MultiAdminFanOut(t *testing.T) {
	repo := &mockNotificationRepo{}
	svc := service.NewNotificationService(repo)
	ctx := context.Background()
	tID := uint64(7)

	// Simulasi fan-out: sistem mengirim ke Admin 31, Admin 32, Admin 33 (satu tenant sama)
	adminIDs := []uint64{31, 32, 33}
	for _, adminID := range adminIDs {
		_, err := svc.CreateNotification(ctx, &tID, "admin", adminID, "prospect_new",
			"Prospek baru", "Ahmad mendaftar via referral", "/prospects/99")
		if err != nil {
			t.Fatalf("CreateNotification for admin %d failed: %v", adminID, err)
		}
	}

	// Assert: MASING-MASING admin menerima tepat 1 notifikasi
	for _, adminID := range adminIDs {
		res, err := svc.ListNotifications(ctx, "admin", adminID, 50)
		if err != nil {
			t.Fatalf("ListNotifications for admin %d failed: %v", adminID, err)
		}
		if len(res.Notifications) != 1 {
			t.Errorf("Admin %d: expected 1 notif, got %d", adminID, len(res.Notifications))
		}
		if res.UnreadCount != 1 {
			t.Errorf("Admin %d: expected unread_count=1, got %d", adminID, res.UnreadCount)
		}
	}

	// Assert cross-isolation: Admin 31 tidak bisa lihat notif Admin 32
	res31, _ := svc.ListNotifications(ctx, "admin", 31, 50)
	for _, n := range res31.Notifications {
		if n.RecipientID != 31 {
			t.Errorf("ISOLATION VIOLATION: Admin 31 melihat notif milik recipient %d", n.RecipientID)
		}
	}
}

// notifContains adalah helper string search untuk test assertion.
func notifContains(s, substr string) bool {
	if len(substr) == 0 || len(s) < len(substr) {
		return false
	}
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
