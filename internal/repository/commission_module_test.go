package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

func strPtr(s string) *string {
	return &s
}

func TestCommissionModule_CrossTenantAndCalculations(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	packageRepo := repository.NewPackageRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	commissionRepo := repository.NewCommissionLedgerRepository(db)
	statusHistoryRepo := repository.NewProspectStatusHistoryRepository(db)
	noteRepo := repository.NewProspectNoteRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "comm_a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "comm_b")

	// Create admin user for Tenant A
	adminUserA := &repository.AdminUser{
		TenantID:     tenantA.ID,
		Email:        fmt.Sprintf("admin-%d@example.com", tenantA.ID),
		PasswordHash: "hashed",
		Name:         "Admin Travel A",
	}
	if err := adminUserRepo.Create(ctx, tenantA.ID, adminUserA); err != nil {
		t.Fatalf("Failed to create admin user: %v", err)
	}

	// 1. Cross-Tenant: parent_agent_id validation
	t.Run("Cross-Tenant: Agent cannot have parent_agent_id from another tenant", func(t *testing.T) {
		agentA := &repository.Agent{
			Name:         "Agent Travel A",
			Phone:        strPtr("08111111111"),
			ReferralCode: fmt.Sprintf("REFA_%d", time.Now().UnixNano()),
			Status:       "active",
		}
		if err := agentRepo.Create(ctx, tenantA.ID, agentA); err != nil {
			t.Fatalf("Failed to create agentA: %v", err)
		}

		// Tenant B attempts to create agent with agentA.ID as ParentAgentID
		agentB := &repository.Agent{
			Name:          "Agent Travel B",
			Phone:         strPtr("08222222222"),
			ReferralCode:  fmt.Sprintf("REFB_%d", time.Now().UnixNano()),
			ParentAgentID: &agentA.ID,
			Status:        "active",
		}
		err := agentRepo.Create(ctx, tenantB.ID, agentB)
		if err != repository.ErrCrossTenantParentAgent {
			t.Fatalf("Expected ErrCrossTenantParentAgent on Create, got %v", err)
		}

		// Create a valid agent in Tenant B, then attempt to update parent to agentA.ID
		validAgentB := &repository.Agent{
			Name:         "Valid Agent Travel B",
			Phone:        strPtr("08333333333"),
			ReferralCode: fmt.Sprintf("REFVB_%d", time.Now().UnixNano()),
			Status:       "active",
		}
		if err := agentRepo.Create(ctx, tenantB.ID, validAgentB); err != nil {
			t.Fatalf("Failed to create validAgentB: %v", err)
		}

		validAgentB.ParentAgentID = &agentA.ID
		err = agentRepo.Update(ctx, tenantB.ID, validAgentB)
		if err != repository.ErrCrossTenantParentAgent {
			t.Fatalf("Expected ErrCrossTenantParentAgent on Update, got %v", err)
		}
	})

	// 1b. Self-Referencing: Agent cannot have parent_agent_id set to its own ID
	t.Run("Self-Referencing: Agent cannot have parent_agent_id set to its own ID", func(t *testing.T) {
		agentSelf := &repository.Agent{
			Name:         "Agent Self Test",
			Phone:        strPtr("08777777777"),
			ReferralCode: fmt.Sprintf("REFSELF_%d", time.Now().UnixNano()),
			Status:       "active",
		}
		if err := agentRepo.Create(ctx, tenantA.ID, agentSelf); err != nil {
			t.Fatalf("Failed to create agentSelf: %v", err)
		}

		// Update agent with parent_agent_id = agent.ID -> MUST BE REJECTED
		agentSelf.ParentAgentID = &agentSelf.ID
		err := agentRepo.Update(ctx, tenantA.ID, agentSelf)
		if err != repository.ErrSelfReferencingParentAgent {
			t.Fatalf("Expected ErrSelfReferencingParentAgent on Update with self-reference, got: %v", err)
		}

		// Create agent with parent_agent_id = agent.ID (when ID is pre-set) -> MUST BE REJECTED
		preID := uint64(88888)
		agentCreateSelf := &repository.Agent{
			ID:            preID,
			Name:          "Agent Create Self Test",
			Phone:         strPtr("08888888888"),
			ReferralCode:  fmt.Sprintf("REFCS_%d", time.Now().UnixNano()),
			ParentAgentID: &preID,
			Status:        "active",
		}
		err = agentRepo.Create(ctx, tenantA.ID, agentCreateSelf)
		if err != repository.ErrSelfReferencingParentAgent {
			t.Fatalf("Expected ErrSelfReferencingParentAgent on Create with self-reference, got: %v", err)
		}
	})

	// 2. Positive: Parent agent in SAME tenant works
	var parentAgentA, childAgentA *repository.Agent
	t.Run("Positive: Parent agent in same tenant is valid", func(t *testing.T) {
		parentAgentA = &repository.Agent{
			Name:         "Parent Agent A",
			Phone:        strPtr("08444444444"),
			ReferralCode: fmt.Sprintf("REFPA_%d", time.Now().UnixNano()),
			Status:       "active",
		}
		if err := agentRepo.Create(ctx, tenantA.ID, parentAgentA); err != nil {
			t.Fatalf("Failed to create parentAgentA: %v", err)
		}

		childAgentA = &repository.Agent{
			Name:          "Child Agent A",
			Phone:         strPtr("08555555555"),
			ReferralCode:  fmt.Sprintf("REFCA_%d", time.Now().UnixNano()),
			ParentAgentID: &parentAgentA.ID,
			Status:        "active",
		}
		if err := agentRepo.Create(ctx, tenantA.ID, childAgentA); err != nil {
			t.Fatalf("Failed to create childAgentA: %v", err)
		}

		fetchedChild, err := agentRepo.GetByID(ctx, tenantA.ID, childAgentA.ID)
		if err != nil {
			t.Fatalf("Failed to get child agent: %v", err)
		}
		if fetchedChild.ParentAgentID == nil || *fetchedChild.ParentAgentID != parentAgentA.ID {
			t.Errorf("Expected ParentAgentID %d, got %v", parentAgentA.ID, fetchedChild.ParentAgentID)
		}
	})

	// 3. Commission calculation on closing with override enabled
	prospectSvc := service.NewProspectService(
		prospectRepo,
		packageRepo,
		agentRepo,
		tenantRepo,
		commissionRepo,
		statusHistoryRepo,
		noteRepo,
		nil,
		nil,
	)

	// Setup package with commission amount = 2,000,000
	commAmount := 2000000.0
	pkgA := &repository.Package{
		Name:             "Paket Barokah",
		CommissionAmount: &commAmount,
		Status:           "published",
	}
	if err := packageRepo.Create(ctx, tenantA.ID, pkgA); err != nil {
		t.Fatalf("Failed to create package: %v", err)
	}

	// Enable commission override 15% on Tenant A
	overridePct := 15.0
	if err := tenantRepo.UpdateCommissionSettings(ctx, tenantA.ID, true, &overridePct); err != nil {
		t.Fatalf("Failed to enable commission override: %v", err)
	}

	// Create prospect for Tenant A with 3 jamaah, referred by childAgentA
	jamaah3 := 3
	prospectA := &repository.Prospect{
		TenantID:      tenantA.ID,
		Name:          "Calon Jamaah 1",
		Phone:         "081234567890",
		PackageID:     &pkgA.ID,
		AgentID:       &childAgentA.ID,
		JumlahJamaah:  &jamaah3,
		SourceChannel: "agen",
		Status:        "baru",
	}
	if err := prospectRepo.Create(ctx, tenantA.ID, prospectA); err != nil {
		t.Fatalf("Failed to create prospect: %v", err)
	}

	t.Run("Commission calculation when closing with override", func(t *testing.T) {
		// Change status to closing
		err := prospectSvc.UpdateStatus(ctx, tenantA.ID, prospectA.ID, adminUserA.ID, "closing", nil)
		if err != nil {
			t.Fatalf("Failed to update status to closing: %v", err)
		}

		ledgers, err := commissionRepo.ListByProspect(ctx, tenantA.ID, prospectA.ID)
		if err != nil {
			t.Fatalf("Failed to list ledgers: %v", err)
		}

		if len(ledgers) != 2 {
			t.Fatalf("Expected 2 commission ledgers (direct and override), got %d", len(ledgers))
		}

		var directLedger, overrideLedger *repository.CommissionLedger
		for i := range ledgers {
			if ledgers[i].Type == "direct" {
				directLedger = &ledgers[i]
			} else if ledgers[i].Type == "override" {
				overrideLedger = &ledgers[i]
			}
		}

		if directLedger == nil {
			t.Fatalf("Direct ledger not found")
		}
		expectedDirect := 2000000.0 * 3 // 6,000,000
		if directLedger.Amount != expectedDirect {
			t.Errorf("Expected direct commission %.2f, got %.2f", expectedDirect, directLedger.Amount)
		}
		if directLedger.AgentID != childAgentA.ID {
			t.Errorf("Expected direct ledger agent %d, got %d", childAgentA.ID, directLedger.AgentID)
		}

		if overrideLedger == nil {
			t.Fatalf("Override ledger not found")
		}
		expectedOverride := 6000000.0 * 0.15 // 900,000
		if overrideLedger.Amount != expectedOverride {
			t.Errorf("Expected override commission %.2f, got %.2f", expectedOverride, overrideLedger.Amount)
		}
		if overrideLedger.AgentID != parentAgentA.ID {
			t.Errorf("Expected override ledger agent %d, got %d", parentAgentA.ID, overrideLedger.AgentID)
		}

		// Verify status history
		histories, err := statusHistoryRepo.ListByProspect(ctx, tenantA.ID, prospectA.ID)
		if err != nil {
			t.Fatalf("Failed to list status history: %v", err)
		}
		if len(histories) != 1 {
			t.Errorf("Expected 1 history entry, got %d", len(histories))
		} else {
			if histories[0].OldStatus != "baru" || histories[0].NewStatus != "closing" {
				t.Errorf("Unexpected history statuses: %s -> %s", histories[0].OldStatus, histories[0].NewStatus)
			}
			if histories[0].ChangedByID != adminUserA.ID {
				t.Errorf("Expected ChangedByID %d, got %d", adminUserA.ID, histories[0].ChangedByID)
			}
		}
	})

	// 4. Updating status when already closing is rejected as immutable
	t.Run("Updating status when already closing is rejected as immutable", func(t *testing.T) {
		allStatuses := []string{"baru", "dihubungi", "tertarik", "tidak_lanjut", "closing"}
		for _, targetStatus := range allStatuses {
			err := prospectSvc.UpdateStatus(ctx, tenantA.ID, prospectA.ID, adminUserA.ID, targetStatus, nil)
			if err == nil {
				t.Fatalf("Expected error when updating already closed prospect to '%s', got nil", targetStatus)
			}
			if !errors.Is(err, service.ErrProspectAlreadyClosed) {
				t.Fatalf("Expected ErrProspectAlreadyClosed for status '%s', got: %v", targetStatus, err)
			}
		}

		ledgers, err := commissionRepo.ListByProspect(ctx, tenantA.ID, prospectA.ID)
		if err != nil {
			t.Fatalf("Failed to list ledgers: %v", err)
		}
		if len(ledgers) != 2 {
			t.Errorf("Expected still 2 ledgers, got %d", len(ledgers))
		}
	})

	// 5. Modifying jumlah_jamaah on closing prospect creates correction ledger
	t.Run("Modifying jumlah_jamaah on closing prospect creates correction ledger", func(t *testing.T) {
		newJamaah := 5
		reason := "Penambahan 2 anggota keluarga"
		input := service.UpdateProspectInput{
			Name:             prospectA.Name,
			Phone:            prospectA.Phone,
			PackageID:        prospectA.PackageID,
			JumlahJamaah:     &newJamaah,
			CorrectionReason: &reason,
		}

		err := prospectSvc.UpdateDetail(ctx, tenantA.ID, prospectA.ID, adminUserA.ID, input)
		if err != nil {
			t.Fatalf("Failed to update prospect detail: %v", err)
		}

		ledgers, err := commissionRepo.ListByProspect(ctx, tenantA.ID, prospectA.ID)
		if err != nil {
			t.Fatalf("Failed to list ledgers: %v", err)
		}

		// Now should have 4 ledgers: 2 original + 2 correction
		if len(ledgers) != 4 {
			t.Fatalf("Expected 4 ledgers after correction, got %d", len(ledgers))
		}

		// Check Detail endpoint returns correct updated totals
		detail, err := prospectSvc.GetDetail(ctx, tenantA.ID, prospectA.ID)
		if err != nil {
			t.Fatalf("Failed to get prospect detail: %v", err)
		}
		if detail.InfoKomisi == nil {
			t.Fatalf("InfoKomisi should not be nil")
		}
		if detail.InfoKomisi.Type != "final" {
			t.Errorf("Expected commission type 'final', got '%s'", detail.InfoKomisi.Type)
		}
		// Direct: 6,000,000 + 4,000,000 = 10,000,000 (5 * 2,000,000)
		expectedTotalDirect := 2000000.0 * 5
		if detail.InfoKomisi.DirectAmount != expectedTotalDirect {
			t.Errorf("Expected direct total %.2f, got %.2f", expectedTotalDirect, detail.InfoKomisi.DirectAmount)
		}
		// Override: 900,000 + 600,000 = 1,500,000 (15% of 10,000,000)
		expectedTotalOverride := expectedTotalDirect * 0.15
		if detail.InfoKomisi.OverrideAmount != expectedTotalOverride {
			t.Errorf("Expected override total %.2f, got %.2f", expectedTotalOverride, detail.InfoKomisi.OverrideAmount)
		}
	})

	// 6. Add prospect notes
	t.Run("Admin can add prospect note", func(t *testing.T) {
		note, err := prospectSvc.AddNote(ctx, tenantA.ID, prospectA.ID, adminUserA.ID, "Follow up via WA: jamaah berminat ambil paket 5 orang.")
		if err != nil {
			t.Fatalf("Failed to add note: %v", err)
		}
		if note.ID == 0 {
			t.Errorf("Expected note ID > 0")
		}

		detail, err := prospectSvc.GetDetail(ctx, tenantA.ID, prospectA.ID)
		if err != nil {
			t.Fatalf("Failed to get detail: %v", err)
		}
		if len(detail.Notes) != 1 {
			t.Fatalf("Expected 1 note in detail, got %d", len(detail.Notes))
		}
		if detail.Notes[0].NoteText != "Follow up via WA: jamaah berminat ambil paket 5 orang." {
			t.Errorf("Unexpected note text: %s", detail.Notes[0].NoteText)
		}
	})

	// 7. Prospect without agent writes 0 commission ledgers
	t.Run("Prospect without agent writes 0 commission ledgers", func(t *testing.T) {
		organicProspect := &repository.Prospect{
			TenantID:      tenantA.ID,
			Name:          "Organic Lead",
			Phone:         "08999999999",
			PackageID:     &pkgA.ID,
			AgentID:       nil,
			SourceChannel: "organik",
			Status:        "baru",
		}
		if err := prospectRepo.Create(ctx, tenantA.ID, organicProspect); err != nil {
			t.Fatalf("Failed to create organic prospect: %v", err)
		}

		err := prospectSvc.UpdateStatus(ctx, tenantA.ID, organicProspect.ID, adminUserA.ID, "closing", nil)
		if err != nil {
			t.Fatalf("Failed to update status to closing: %v", err)
		}

		ledgers, err := commissionRepo.ListByProspect(ctx, tenantA.ID, organicProspect.ID)
		if err != nil {
			t.Fatalf("Failed to list ledgers: %v", err)
		}
		if len(ledgers) != 0 {
			t.Errorf("Expected 0 commission ledgers for organic lead, got %d", len(ledgers))
		}

		detail, err := prospectSvc.GetDetail(ctx, tenantA.ID, organicProspect.ID)
		if err != nil {
			t.Fatalf("Failed to get detail: %v", err)
		}
		if detail.InfoKomisi != nil {
			t.Errorf("InfoKomisi should be nil for organic lead without agent, got %+v", detail.InfoKomisi)
		}
	})

	// 8. Cross-Tenant isolation for ledgers and notes
	t.Run("Cross-Tenant: Tenant B cannot read Tenant A ledgers, notes, or prospect detail", func(t *testing.T) {
		_, err := prospectSvc.GetDetail(ctx, tenantB.ID, prospectA.ID)
		if err != repository.ErrNotFound {
			t.Errorf("Expected ErrNotFound when Tenant B accesses Tenant A prospect, got %v", err)
		}

		ledgersB, err := commissionRepo.ListByProspect(ctx, tenantB.ID, prospectA.ID)
		if err != nil {
			t.Fatalf("Error listing ledgers: %v", err)
		}
		if len(ledgersB) != 0 {
			t.Errorf("Tenant B saw Tenant A's ledgers! Count: %d", len(ledgersB))
		}

		notesB, err := noteRepo.ListByProspect(ctx, tenantB.ID, prospectA.ID)
		if err != nil {
			t.Fatalf("Error listing notes: %v", err)
		}
		if len(notesB) != 0 {
			t.Errorf("Tenant B saw Tenant A's notes! Count: %d", len(notesB))
		}
	})
}

func TestAgentRepository_SelfReferencingParentAgent(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)

	tenant := createDummyTenant(t, ctx, tenantRepo, "self_ref")

	// 1. Create a valid agent
	agent := &repository.Agent{
		Name:         "Agent Mandiri",
		Phone:        strPtr("089988776655"),
		ReferralCode: fmt.Sprintf("REFMANDIRI_%d", time.Now().UnixNano()),
		Status:       "active",
	}
	if err := agentRepo.Create(ctx, tenant.ID, agent); err != nil {
		t.Fatalf("Failed to create agent: %v", err)
	}

	// 2. Test Update: set parent_agent_id to agent.ID (self-reference) -> MUST BE REJECTED
	agent.ParentAgentID = &agent.ID
	err := agentRepo.Update(ctx, tenant.ID, agent)
	if err != repository.ErrSelfReferencingParentAgent {
		t.Fatalf("Expected ErrSelfReferencingParentAgent on Update when parent_agent_id == agent.ID, got: %v", err)
	}

	// 3. Test Create: set parent_agent_id to agent.ID when ID is pre-set -> MUST BE REJECTED
	fakeID := uint64(77777)
	agentNew := &repository.Agent{
		ID:            fakeID,
		Name:          "Agent PreID Self",
		Phone:         strPtr("089988776656"),
		ReferralCode:  fmt.Sprintf("REFPREID_%d", time.Now().UnixNano()),
		ParentAgentID: &fakeID,
		Status:        "active",
	}
	err = agentRepo.Create(ctx, tenant.ID, agentNew)
	if err != repository.ErrSelfReferencingParentAgent {
		t.Fatalf("Expected ErrSelfReferencingParentAgent on Create when parent_agent_id == agent.ID, got: %v", err)
	}
}

func TestRegression_DoubleCommission_TerminalClosing(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	packageRepo := repository.NewPackageRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	commissionRepo := repository.NewCommissionLedgerRepository(db)
	statusHistoryRepo := repository.NewProspectStatusHistoryRepository(db)
	noteRepo := repository.NewProspectNoteRepository(db)
	adminUserRepo := repository.NewAdminUserRepository(db)

	tenant := createDummyTenant(t, ctx, tenantRepo, "reg_double_comm")

	adminUser := &repository.AdminUser{
		TenantID:     tenant.ID,
		Email:        fmt.Sprintf("admin-%d@travel.com", time.Now().UnixNano()),
		PasswordHash: "hashed",
		Name:         "Admin Travel",
	}
	if err := adminUserRepo.Create(ctx, tenant.ID, adminUser); err != nil {
		t.Fatalf("Failed to create admin user: %v", err)
	}

	// Single agent without parent (direct commission only)
	agent := &repository.Agent{
		Name:         "Solo Agent",
		Phone:        strPtr("081122334455"),
		ReferralCode: fmt.Sprintf("REFSOLO_%d", time.Now().UnixNano()),
		Status:       "active",
	}
	if err := agentRepo.Create(ctx, tenant.ID, agent); err != nil {
		t.Fatalf("Failed to create agent: %v", err)
	}

	directRate := 2500000.0
	pkg := &repository.Package{
		Name:             "Paket Bronze Solo",
		CommissionAmount: &directRate,
		Status:           "published",
	}
	if err := packageRepo.Create(ctx, tenant.ID, pkg); err != nil {
		t.Fatalf("Failed to create package: %v", err)
	}

	prospectSvc := service.NewProspectService(
		prospectRepo,
		packageRepo,
		agentRepo,
		tenantRepo,
		commissionRepo,
		statusHistoryRepo,
		noteRepo,
		nil,
		nil,
	)

	jj := 1
	prospect := &repository.Prospect{
		TenantID:      tenant.ID,
		Name:          "Jamaah Solo Direct",
		Phone:         "081234567890",
		PackageID:     &pkg.ID,
		AgentID:       &agent.ID,
		JumlahJamaah:  &jj,
		SourceChannel: "agen",
		Status:        "baru",
	}
	if err := prospectRepo.Create(ctx, tenant.ID, prospect); err != nil {
		t.Fatalf("Failed to create prospect: %v", err)
	}

	// 1. Initial status change to 'closing' -> should produce exactly 1 direct commission row
	err := prospectSvc.UpdateStatus(ctx, tenant.ID, prospect.ID, adminUser.ID, "closing", nil)
	if err != nil {
		t.Fatalf("Failed to set prospect to closing: %v", err)
	}

	// Raw SQL query to commission_ledger to verify initial 1 row
	var countBefore int
	err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM commission_ledger WHERE tenant_id = ? AND prospect_id = ?", tenant.ID, prospect.ID).Scan(&countBefore)
	if err != nil {
		t.Fatalf("Raw SQL SELECT COUNT(*) failed: %v", err)
	}
	if countBefore != 1 {
		t.Fatalf("Expected exactly 1 commission ledger row after closing, got %d", countBefore)
	}

	// 2. CRITICAL REGRESSION: attempt to call UpdateStatus with new_status='closing' again
	// MUST be rejected with ErrProspectAlreadyClosed (400)
	err = prospectSvc.UpdateStatus(ctx, tenant.ID, prospect.ID, adminUser.ID, "closing", nil)
	if err == nil {
		t.Fatalf("CRITICAL BUG: UpdateStatus allowed closing an already closed prospect!")
	}
	if !errors.Is(err, service.ErrProspectAlreadyClosed) {
		t.Fatalf("Expected ErrProspectAlreadyClosed, got: %v", err)
	}

	// Also test all other statuses: 'baru', 'dihubungi', 'tertarik', 'tidak_lanjut'
	otherStatuses := []string{"baru", "dihubungi", "tertarik", "tidak_lanjut"}
	for _, s := range otherStatuses {
		err = prospectSvc.UpdateStatus(ctx, tenant.ID, prospect.ID, adminUser.ID, s, nil)
		if err == nil {
			t.Fatalf("CRITICAL BUG: UpdateStatus allowed changing status to '%s' on already closed prospect!", s)
		}
		if !errors.Is(err, service.ErrProspectAlreadyClosed) {
			t.Fatalf("Expected ErrProspectAlreadyClosed for '%s', got: %v", s, err)
		}
	}

	// 3. Raw SQL query to commission_ledger MUST STILL BE EXACTLY 1 row (NO double-commission)
	var countAfter int
	var ledgerID uint64
	var ledgerType string
	var ledgerAmount float64
	err = db.QueryRowContext(ctx, "SELECT id, type, amount FROM commission_ledger WHERE tenant_id = ? AND prospect_id = ?", tenant.ID, prospect.ID).Scan(&ledgerID, &ledgerType, &ledgerAmount)
	if err != nil {
		t.Fatalf("Raw SQL SELECT row failed: %v", err)
	}
	err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM commission_ledger WHERE tenant_id = ? AND prospect_id = ?", tenant.ID, prospect.ID).Scan(&countAfter)
	if err != nil {
		t.Fatalf("Raw SQL SELECT COUNT(*) failed: %v", err)
	}

	if countAfter != 1 {
		t.Fatalf("CRITICAL REGRESSION BUG: commission_ledger row count increased! Expected 1, got %d", countAfter)
	}
	if ledgerType != "direct" || ledgerAmount != directRate {
		t.Fatalf("Unexpected ledger data: type=%s, amount=%.2f", ledgerType, ledgerAmount)
	}
	t.Logf("RAW SQL VERIFICATION: commission_ledger for prospect_id=%d has exactly 1 row (ID=%d, type=%s, amount=%.2f)", prospect.ID, ledgerID, ledgerType, ledgerAmount)
}

