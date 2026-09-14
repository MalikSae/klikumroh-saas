package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

func TestAgentTarget_CRUD_And_CrossTenant(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	targetRepo := repository.NewAgentTargetRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-target")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-target")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	now := time.Now().UTC()
	startStr := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	endStr := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Format("2006-01-02")

	targetA := &repository.AgentTarget{
		Title:             strPtr("Target Ramadhan Umroh Reguler"),
		MetricType:        "closing_pax",
		MetricValue:       10,
		RewardDescription: strPtr("Emas 1 Gram"),
		PeriodStart:       startStr,
		PeriodEnd:         endStr,
		Status:            "active",
	}

	if err := targetRepo.Create(ctx, tenantA.ID, targetA); err != nil {
		t.Fatalf("Failed to create target for Tenant A: %v", err)
	}
	defer targetRepo.Delete(ctx, tenantA.ID, targetA.ID)

	// 1. POSITIVE ASSERTIONS
	t.Run("Positive: Tenant A can access its own target", func(t *testing.T) {
		got, err := targetRepo.GetByID(ctx, tenantA.ID, targetA.ID)
		if err != nil {
			t.Fatalf("Tenant A failed to get target: %v", err)
		}
		if got == nil || got.ID != targetA.ID || got.TenantID != tenantA.ID {
			t.Fatalf("Unexpected target data: %+v", got)
		}
		if got.Title == nil || *got.Title != *targetA.Title || got.MetricValue != 10 {
			t.Fatalf("Target fields mismatch: got title=%v, metricValue=%d", got.Title, got.MetricValue)
		}

		// ListByTenant
		list, err := targetRepo.ListByTenant(ctx, tenantA.ID, nil)
		if err != nil {
			t.Fatalf("Tenant A failed to list targets: %v", err)
		}
		found := false
		for _, item := range list {
			if item.ID == targetA.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("Target %d not found in Tenant A list", targetA.ID)
		}

		// Filter active
		statusFilter := "active"
		activeList, err := targetRepo.ListByTenant(ctx, tenantA.ID, &statusFilter)
		if err != nil {
			t.Fatalf("Tenant A failed to list active targets: %v", err)
		}
		found = false
		for _, item := range activeList {
			if item.ID == targetA.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("Target %d not found in Tenant A active list", targetA.ID)
		}
	})

	// 2. NEGATIVE ASSERTIONS (Cross-Tenant)
	t.Run("GetByID cross-tenant isolation", func(t *testing.T) {
		got, err := targetRepo.GetByID(ctx, tenantB.ID, targetA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B accesses Tenant A's target, got err=%v, data=%+v", err, got)
		}
		if got != nil {
			t.Errorf("Expected nil target, got %+v", got)
		}
	})

	t.Run("Update cross-tenant isolation", func(t *testing.T) {
		tampered := &repository.AgentTarget{
			ID:                targetA.ID,
			Title:             strPtr("Tampered Title"),
			MetricType:        "closing_pax",
			MetricValue:       99,
			RewardDescription: strPtr("Uang Palsu"),
			PeriodStart:       startStr,
			PeriodEnd:         endStr,
			Status:            "active",
		}
		err := targetRepo.Update(ctx, tenantB.ID, tampered)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A's target, got err=%v", err)
		}
	})

	t.Run("Delete cross-tenant isolation", func(t *testing.T) {
		err := targetRepo.Delete(ctx, tenantB.ID, targetA.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B deletes Tenant A's target, got err=%v", err)
		}
	})

	t.Run("ListByTenant cross-tenant isolation", func(t *testing.T) {
		listB, err := targetRepo.ListByTenant(ctx, tenantB.ID, nil)
		if err != nil {
			t.Fatalf("Tenant B failed to list targets: %v", err)
		}
		for _, item := range listB {
			if item.ID == targetA.ID {
				t.Errorf("Tenant B's list leaked Tenant A's target: %+v", item)
			}
		}
	})
}

func TestAgentTarget_Progress_ClosingPax_And_MitraBaru(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	targetRepo := repository.NewAgentTargetRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	packageRepo := repository.NewPackageRepository(db)
	prospectRepo := repository.NewProspectRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-prog")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-prog")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	// Agent in Tenant A
	agentA := &repository.Agent{
		Name:         "Agent A Target",
		Phone:        strPtr("08123456701"),
		ReferralCode: fmt.Sprintf("AGTA_%d", time.Now().UnixNano()),
		Status:       "active",
	}
	if err := agentRepo.Create(ctx, tenantA.ID, agentA); err != nil {
		t.Fatalf("Failed to create agentA: %v", err)
	}

	// Agent in Tenant B
	agentB := &repository.Agent{
		Name:         "Agent B Target",
		Phone:        strPtr("08123456702"),
		ReferralCode: fmt.Sprintf("AGTB_%d", time.Now().UnixNano()),
		Status:       "active",
	}
	if err := agentRepo.Create(ctx, tenantB.ID, agentB); err != nil {
		t.Fatalf("Failed to create agentB: %v", err)
	}

	// Package for Tenant A
	pkgA := &repository.Package{
		Name:   "Paket Umroh Plus",
		Status: "published",
	}
	if err := packageRepo.Create(ctx, tenantA.ID, pkgA); err != nil {
		t.Fatalf("Failed to create pkgA: %v", err)
	}
	defer packageRepo.Delete(ctx, tenantA.ID, pkgA.ID)

	now := time.Now().UTC()
	startStr := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	endStr := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Format("2006-01-02")

	// 1. Target Closing Pax
	targetPax := &repository.AgentTarget{
		Title:             strPtr("Target Closing Umroh"),
		MetricType:        "closing_pax",
		MetricValue:       5,
		RewardDescription: strPtr("Bonus Rp 5.000.000"),
		PeriodStart:       startStr,
		PeriodEnd:         endStr,
		Status:            "active",
	}
	if err := targetRepo.Create(ctx, tenantA.ID, targetPax); err != nil {
		t.Fatalf("Failed to create targetPax: %v", err)
	}
	defer targetRepo.Delete(ctx, tenantA.ID, targetPax.ID)

	// Create Prospect 1 for Agent A in Tenant A with pax_count = 3
	pax3 := 3
	prospect1 := &repository.Prospect{
		TenantID:      tenantA.ID,
		AgentID:       &agentA.ID,
		PackageID:     &pkgA.ID,
		Name:          "Jamaah 1",
		Phone:         "0811111111",
		Status:        "baru",
		JumlahJamaah:  &pax3,
		SourceChannel: "agen",
		EntryMethod:   "web_form",
	}
	if err := prospectRepo.Create(ctx, tenantA.ID, prospect1); err != nil {
		t.Fatalf("Failed to create prospect1: %v", err)
	}
	defer prospectRepo.Delete(ctx, tenantA.ID, prospect1.ID)

	// Change status to closing inside the period
	closingTime := time.Date(now.Year(), now.Month(), 2, 10, 0, 0, 0, time.UTC)
	_, err := db.ExecContext(ctx,
		"INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status, changed_at) VALUES (?, ?, 'admin', 1, ?, ?, ?)",
		tenantA.ID, prospect1.ID, "baru", "closing", closingTime,
	)
	if err != nil {
		t.Fatalf("Failed to insert status history: %v", err)
	}

	// Create Prospect 2 for Agent A with pax_count = 2, also closing
	pax2 := 2
	prospect2 := &repository.Prospect{
		TenantID:      tenantA.ID,
		AgentID:       &agentA.ID,
		PackageID:     &pkgA.ID,
		Name:          "Jamaah 2",
		Phone:         "0811111112",
		Status:        "baru",
		JumlahJamaah:  &pax2,
		SourceChannel: "agen",
		EntryMethod:   "web_form",
	}
	if err := prospectRepo.Create(ctx, tenantA.ID, prospect2); err != nil {
		t.Fatalf("Failed to create prospect2: %v", err)
	}
	defer prospectRepo.Delete(ctx, tenantA.ID, prospect2.ID)

	_, err = db.ExecContext(ctx,
		"INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status, changed_at) VALUES (?, ?, 'admin', 1, ?, ?, ?)",
		tenantA.ID, prospect2.ID, "baru", "closing", closingTime,
	)
	if err != nil {
		t.Fatalf("Failed to insert status history 2: %v", err)
	}

	t.Run("Progress calculation for closing_pax", func(t *testing.T) {
		progressList, err := targetRepo.ListAgentProgress(ctx, tenantA.ID, targetPax.ID)
		if err != nil {
			t.Fatalf("ListAgentProgress failed: %v", err)
		}
		var found *repository.AgentTargetProgressRow
		for i := range progressList {
			if progressList[i].AgentID == agentA.ID {
				found = &progressList[i]
				break
			}
		}
		if found == nil {
			t.Fatalf("Agent A progress not found in list")
		}
		if found.AchievedValue != 5 {
			t.Errorf("Expected AchievedValue=5 (3+2), got %d", found.AchievedValue)
		}
		if !found.Achieved {
			t.Errorf("Expected Achieved=true, got false")
		}

		// Single agent progress
		val, err := targetRepo.GetAgentProgress(ctx, tenantA.ID, agentA.ID, "closing_pax", startStr, endStr)
		if err != nil {
			t.Fatalf("GetAgentProgress failed: %v", err)
		}
		if val != 5 {
			t.Errorf("GetAgentProgress mismatch: expected 5, got %d", val)
		}
	})

	// 2. Target Mitra Baru
	targetMitra := &repository.AgentTarget{
		Title:             strPtr("Target Rekrut Agen"),
		MetricType:        "mitra_baru_count",
		MetricValue:       2,
		RewardDescription: strPtr("Bonus Rekrut Rp 1.000.000"),
		PeriodStart:       startStr,
		PeriodEnd:         endStr,
		Status:            "active",
	}
	if err := targetRepo.Create(ctx, tenantA.ID, targetMitra); err != nil {
		t.Fatalf("Failed to create targetMitra: %v", err)
	}
	defer targetRepo.Delete(ctx, tenantA.ID, targetMitra.ID)

	// Create 2 downline agents under Agent A in Tenant A
	downline1 := &repository.Agent{
		Name:          "Downline 1",
		Phone:         strPtr("08123456711"),
		ReferralCode:  fmt.Sprintf("DL1_%d", time.Now().UnixNano()),
		ParentAgentID: &agentA.ID,
		Status:        "active",
	}
	if err := agentRepo.Create(ctx, tenantA.ID, downline1); err != nil {
		t.Fatalf("Failed to create downline1: %v", err)
	}

	pax1 := 1
	prospectDL1 := &repository.Prospect{
		TenantID:      tenantA.ID,
		AgentID:       &downline1.ID,
		PackageID:     &pkgA.ID,
		Name:          "Jamaah DL1",
		Phone:         "0811111121",
		Status:        "baru",
		JumlahJamaah:  &pax1,
		SourceChannel: "agen",
		EntryMethod:   "web_form",
	}
	if err := prospectRepo.Create(ctx, tenantA.ID, prospectDL1); err != nil {
		t.Fatalf("Failed to create prospectDL1: %v", err)
	}
	defer prospectRepo.Delete(ctx, tenantA.ID, prospectDL1.ID)

	_, err = db.ExecContext(ctx,
		"INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status, changed_at) VALUES (?, ?, 'admin', 1, ?, ?, ?)",
		tenantA.ID, prospectDL1.ID, "baru", "closing", closingTime,
	)
	if err != nil {
		t.Fatalf("Failed to insert prospectDL1 status history: %v", err)
	}

	downline2 := &repository.Agent{
		Name:          "Downline 2",
		Phone:         strPtr("08123456712"),
		ReferralCode:  fmt.Sprintf("DL2_%d", time.Now().UnixNano()),
		ParentAgentID: &agentA.ID,
		Status:        "active",
	}
	if err := agentRepo.Create(ctx, tenantA.ID, downline2); err != nil {
		t.Fatalf("Failed to create downline2: %v", err)
	}

	prospectDL2 := &repository.Prospect{
		TenantID:      tenantA.ID,
		AgentID:       &downline2.ID,
		PackageID:     &pkgA.ID,
		Name:          "Jamaah DL2",
		Phone:         "0811111122",
		Status:        "baru",
		JumlahJamaah:  &pax1,
		SourceChannel: "agen",
		EntryMethod:   "web_form",
	}
	if err := prospectRepo.Create(ctx, tenantA.ID, prospectDL2); err != nil {
		t.Fatalf("Failed to create prospectDL2: %v", err)
	}
	defer prospectRepo.Delete(ctx, tenantA.ID, prospectDL2.ID)

	_, err = db.ExecContext(ctx,
		"INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status, changed_at) VALUES (?, ?, 'admin', 1, ?, ?, ?)",
		tenantA.ID, prospectDL2.ID, "baru", "closing", closingTime,
	)
	if err != nil {
		t.Fatalf("Failed to insert prospectDL2 status history: %v", err)
	}

	t.Run("Progress calculation for mitra_baru_count", func(t *testing.T) {
		val, err := targetRepo.GetAgentProgress(ctx, tenantA.ID, agentA.ID, "mitra_baru_count", startStr, endStr)
		if err != nil {
			t.Fatalf("GetAgentProgress for mitra_baru failed: %v", err)
		}
		if val != 2 {
			t.Errorf("Expected AchievedValue=2, got %d", val)
		}
	})

	t.Run("Cross-tenant: Tenant B cannot see Tenant A progress", func(t *testing.T) {
		progressB, err := targetRepo.ListAgentProgress(ctx, tenantB.ID, targetPax.ID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("Expected ErrNotFound when Tenant B requests progress for Tenant A's target, got %v, progress=%+v", err, progressB)
		}
	})
}

func TestAgentTarget_Close_And_Achievements_CrossTenant(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	targetRepo := repository.NewAgentTargetRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "A-close")
	defer tenantRepo.Delete(ctx, tenantA.ID)

	tenantB := createDummyTenant(t, ctx, tenantRepo, "B-close")
	defer tenantRepo.Delete(ctx, tenantB.ID)

	adminA := &repository.AdminUser{
		TenantID:     tenantA.ID,
		Email:        fmt.Sprintf("admin-%d@example.com", tenantA.ID),
		PasswordHash: "hashed",
		Name:         "Admin A",
	}
	if err := adminRepo.Create(ctx, tenantA.ID, adminA); err != nil {
		t.Fatalf("Failed to create adminA: %v", err)
	}

	agentA := &repository.Agent{
		Name:         "Agent Closer",
		Phone:        strPtr("08199999901"),
		ReferralCode: fmt.Sprintf("REFCLO_%d", time.Now().UnixNano()),
		Status:       "active",
	}
	if err := agentRepo.Create(ctx, tenantA.ID, agentA); err != nil {
		t.Fatalf("Failed to create agentA: %v", err)
	}

	now := time.Now().UTC()
	startStr := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	endStr := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Format("2006-01-02")

	targetA := &repository.AgentTarget{
		Title:             strPtr("Target Bulanan Siap Tutup"),
		MetricType:        "closing_pax",
		MetricValue:       10,
		RewardDescription: strPtr("Hadiah Laptop"),
		PeriodStart:       startStr,
		PeriodEnd:         endStr,
		Status:            "active",
	}
	if err := targetRepo.Create(ctx, tenantA.ID, targetA); err != nil {
		t.Fatalf("Failed to create targetA: %v", err)
	}
	defer targetRepo.Delete(ctx, tenantA.ID, targetA.ID)

	// Close target period
	if err := targetRepo.Close(ctx, tenantA.ID, targetA.ID); err != nil {
		t.Fatalf("Failed to close target: %v", err)
	}

	// Insert achievement for agentA
	ach := &repository.AgentTargetAchievement{
		TenantID:                  tenantA.ID,
		TargetID:                  targetA.ID,
		AgentID:                   agentA.ID,
		AchievedValue:             12,
		AchievedAt:                time.Now().UTC(),
		RewardStatus:              "pending",
		RewardDescriptionSnapshot: targetA.RewardDescription,
	}
	if err := targetRepo.CreateAchievement(ctx, tenantA.ID, ach); err != nil {
		t.Fatalf("Failed to create achievement: %v", err)
	}

	// Verify target is now closed
	closedTarget, err := targetRepo.GetByID(ctx, tenantA.ID, targetA.ID)
	if err != nil {
		t.Fatalf("Failed to get closed target: %v", err)
	}
	if closedTarget.Status != "closed" {
		t.Errorf("Expected status='closed', got %s", closedTarget.Status)
	}

	// Verify HasAchievements
	hasAch, err := targetRepo.HasAchievements(ctx, tenantA.ID, targetA.ID)
	if err != nil {
		t.Fatalf("HasAchievements failed: %v", err)
	}
	if !hasAch {
		t.Errorf("Expected HasAchievements=true, got false")
	}

	// List achievements
	listAch, err := targetRepo.ListAchievementsByTarget(ctx, tenantA.ID, targetA.ID)
	if err != nil {
		t.Fatalf("ListAchievementsByTarget failed: %v", err)
	}
	if len(listAch) != 1 {
		t.Fatalf("Expected 1 achievement, got %d", len(listAch))
	}
	achID := listAch[0].ID
	if listAch[0].AgentID != agentA.ID || listAch[0].AchievedValue != 12 {
		t.Errorf("Achievement data mismatch: %+v", listAch[0])
	}

	// Cross-tenant: Tenant B cannot list achievements of targetA
	t.Run("Cross-tenant: ListAchievementsByTarget isolation", func(t *testing.T) {
		listB, err := targetRepo.ListAchievementsByTarget(ctx, tenantB.ID, targetA.ID)
		if err != nil {
			t.Fatalf("Tenant B ListAchievementsByTarget failed: %v", err)
		}
		if len(listB) != 0 {
			t.Errorf("Tenant B leaked Tenant A achievements: %+v", listB)
		}
	})

	// Cross-tenant: Tenant B cannot get achievement by ID
	t.Run("Cross-tenant: GetAchievementByID isolation", func(t *testing.T) {
		got, err := targetRepo.GetAchievementByID(ctx, tenantB.ID, achID)
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound for Tenant B accessing Tenant A achievement, got err=%v, data=%+v", err, got)
		}
	})

	// Cross-tenant: Tenant B cannot update reward status
	t.Run("Cross-tenant: UpdateRewardStatus isolation", func(t *testing.T) {
		err := targetRepo.UpdateRewardStatus(ctx, tenantB.ID, achID, adminA.ID, "given", strPtr("Tampered"))
		if !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Expected ErrNotFound when Tenant B updates Tenant A achievement reward, got err=%v", err)
		}
	})

	// Positive: Tenant A updates reward status to 'given'
	t.Run("Positive: Tenant A updates reward status", func(t *testing.T) {
		note := "Diserahkan saat gathering"
		err := targetRepo.UpdateRewardStatus(ctx, tenantA.ID, achID, adminA.ID, "given", &note)
		if err != nil {
			t.Fatalf("Tenant A failed to update reward status: %v", err)
		}

		updated, err := targetRepo.GetAchievementByID(ctx, tenantA.ID, achID)
		if err != nil {
			t.Fatalf("Failed to get updated achievement: %v", err)
		}
		if updated.RewardStatus != "given" {
			t.Errorf("Expected RewardStatus='given', got %s", updated.RewardStatus)
		}
		if updated.RewardGivenBy == nil || *updated.RewardGivenBy != adminA.ID {
			t.Errorf("Expected RewardGivenBy=%d, got %v", adminA.ID, updated.RewardGivenBy)
		}
		if updated.RewardGivenAt == nil {
			t.Errorf("Expected RewardGivenAt to be set, got nil")
		}
		if updated.Notes == nil || *updated.Notes != note {
			t.Errorf("Expected Notes=%s, got %v", note, updated.Notes)
		}
	})
}
