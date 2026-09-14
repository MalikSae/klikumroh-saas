package repository_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

func TestNotificationRepository_CrossRecipientIsolation(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	notifRepo := repository.NewNotificationRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "notif_iso_a")
	defer func() { _ = tenantRepo.Delete(ctx, tenantA.ID) }()

	tenantB := createDummyTenant(t, ctx, tenantRepo, "notif_iso_b")
	defer func() { _ = tenantRepo.Delete(ctx, tenantB.ID) }()

	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM notifications WHERE tenant_id IN (?, ?)", tenantA.ID, tenantB.ID)
	})

	linkA := "/prospects/10"
	notifA := &repository.Notification{
		TenantID:      &tenantA.ID,
		RecipientType: "admin",
		RecipientID:   1001,
		Type:          "prospect_new",
		Title:         "Prospek Baru Tenant A",
		Body:          "Fulan tertarik paket Umroh",
		LinkURL:       &linkA,
	}
	if err := notifRepo.Create(ctx, notifA); err != nil {
		t.Fatalf("Failed to create notifA: %v", err)
	}

	linkB := "/prospects/20"
	notifB := &repository.Notification{
		TenantID:      &tenantB.ID,
		RecipientType: "admin",
		RecipientID:   2002,
		Type:          "prospect_new",
		Title:         "Prospek Baru Tenant B",
		Body:          "Ahmad tertarik paket Barokah",
		LinkURL:       &linkB,
	}
	if err := notifRepo.Create(ctx, notifB); err != nil {
		t.Fatalf("Failed to create notifB: %v", err)
	}

	// 1. Isolation check: Recipient 1001 cannot see notifB
	listA, err := notifRepo.ListByRecipient(ctx, "admin", 1001, 50)
	if err != nil {
		t.Fatalf("ListByRecipient(1001) failed: %v", err)
	}
	for _, n := range listA {
		if n.ID == notifB.ID {
			t.Errorf("CRITICAL SECURITY: Recipient 1001 saw notification %d belonging to Recipient 2002", notifB.ID)
		}
	}

	// 2. CountUnread check
	unreadA, err := notifRepo.CountUnread(ctx, "admin", 1001)
	if err != nil {
		t.Fatalf("CountUnread(1001) failed: %v", err)
	}
	if unreadA < 1 {
		t.Errorf("Expected at least 1 unread notification for recipient 1001, got %d", unreadA)
	}

	// 3. Unauthorized MarkAsRead attempt: Recipient 2002 attempts to mark notifA as read
	err = notifRepo.MarkAsRead(ctx, "admin", 2002, notifA.ID)
	if err == nil {
		t.Errorf("CRITICAL SECURITY: Recipient 2002 was able to mark notifA (%d) as read!", notifA.ID)
	}
	if !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("Expected ErrNotFound on cross-recipient mark read, got %v", err)
	}

	// 4. Authorized MarkAsRead by Recipient 1001
	if err := notifRepo.MarkAsRead(ctx, "admin", 1001, notifA.ID); err != nil {
		t.Fatalf("Recipient 1001 failed to mark own notif as read: %v", err)
	}

	unreadAfter, err := notifRepo.CountUnread(ctx, "admin", 1001)
	if err != nil {
		t.Fatalf("CountUnread after mark read failed: %v", err)
	}
	if unreadAfter != unreadA-1 {
		t.Errorf("Expected unread count to decrease by 1, was %d now %d", unreadA, unreadAfter)
	}

	// 5. MarkAllAsRead does not affect other recipients
	if err := notifRepo.MarkAllAsRead(ctx, "admin", 1001); err != nil {
		t.Fatalf("MarkAllAsRead failed: %v", err)
	}
	unreadB, err := notifRepo.CountUnread(ctx, "admin", 2002)
	if err != nil {
		t.Fatalf("CountUnread(2002) failed: %v", err)
	}
	if unreadB < 1 {
		t.Errorf("Expected recipient 2002 notif to still be unread after 1001 MarkAllAsRead, got %d", unreadB)
	}
}

func TestNotificationRepository_AgentIsolation(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	notifRepo := repository.NewNotificationRepository(db)

	tenant := createDummyTenant(t, ctx, tenantRepo, "notif_agt_iso")
	defer func() { _ = tenantRepo.Delete(ctx, tenant.ID) }()

	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM notifications WHERE tenant_id = ?", tenant.ID)
	})

	// Agent 501 and Agent 502
	notifAgent1 := &repository.Notification{
		TenantID:      &tenant.ID,
		RecipientType: "agent",
		RecipientID:   501,
		Type:          "commission_earned",
		Title:         "Komisi baru",
		Body:          "Komisi Rp 1.000.000 masuk",
		CreatedAt:     time.Now(),
	}
	if err := notifRepo.Create(ctx, notifAgent1); err != nil {
		t.Fatalf("Failed to create notifAgent1: %v", err)
	}

	// Agent 502 cannot mark Agent 501's notification as read
	err := notifRepo.MarkAsRead(ctx, "agent", 502, notifAgent1.ID)
	if err == nil {
		t.Errorf("CRITICAL SECURITY: Agent 502 marked Agent 501's notification as read!")
	}
	if !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("Expected ErrNotFound for cross-agent mark read, got %v", err)
	}
}
