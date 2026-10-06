package repository_test

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// pfaPNG is a tiny real image, so UploadRenewalProof can convert and store it.
func pfaPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for x := 0; x < 8; x++ {
		for y := 0; y < 8; y++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 30), G: uint8(y * 30), B: 90, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("png: %v", err)
	}
	return buf.Bytes()
}

func pfaAmount(p *float64) string {
	if p == nil {
		return "<nil>"
	}
	return fmt.Sprintf("%.2f", *p)
}

// Keputusan pendiri 6 Okt 2026: proof_final_amount records the invoice total at the moment the current
// transfer proof was stored. A travel proof (renewal request or upload, incl. reopening a rejected invoice)
// sets it; a staff plan change keeps the proof and this amount while final_amount moves; a travel change
// of the billed amount without a new proof clears both.
func TestProofFinalAmount_Lifecycle(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	var staffID uint64
	if err := db.QueryRow(`SELECT id FROM staff_users ORDER BY id LIMIT 1`).Scan(&staffID); err != nil {
		t.Skipf("no staff user in test DB: %v", err)
	}
	planRepo := repository.NewPricingPlanRepository(db)
	cheap := bh5Plan(t, ctx, planRepo, 100000)
	pricey := bh5Plan(t, ctx, planRepo, 250000)
	tenantRepo := repository.NewTenantRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	couponRepo := repository.NewCouponRepository(db)
	sub := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenantRepo)

	tenant := createDummyTenant(t, ctx, tenantRepo, "pfa")
	t.Cleanup(func() {
		// Proof files written by UploadRenewalProof (relative to the test's working directory).
		_ = os.RemoveAll(filepath.Join(".", util.PrivateUploadsDir, fmt.Sprintf("%d", tenant.ID)))
		_ = os.Remove(filepath.Join(".", util.PrivateUploadsDir))
		_ = os.Remove(filepath.Join(".", "storage"))
	})

	get := func(id uint64) *repository.PaymentVerification {
		t.Helper()
		pv, err := pvRepo.GetByID(ctx, id)
		if err != nil {
			t.Fatalf("get invoice: %v", err)
		}
		return pv
	}

	t.Run("renewal request with proof sets it", func(t *testing.T) {
		proof := fmt.Sprintf("/uploads/%d/subscription-proofs/pfa-first.webp", tenant.ID)
		pv, err := sub.CreateRenewalRequest(ctx, tenant.ID, cheap.ID, nil, &proof)
		if err != nil {
			t.Fatalf("renewal request: %v", err)
		}
		got := get(pv.ID)
		t.Logf("final_amount=%.2f proof_final_amount=%s", got.FinalAmount, pfaAmount(got.ProofFinalAmount))
		if got.ProofFinalAmount == nil || *got.ProofFinalAmount != got.FinalAmount {
			t.Fatalf("proof_final_amount = %s, want %.2f", pfaAmount(got.ProofFinalAmount), got.FinalAmount)
		}
	})

	history, err := pvRepo.ListByTenant(ctx, tenant.ID)
	if err != nil || len(history) != 1 {
		t.Fatalf("expected one invoice, got %d (%v)", len(history), err)
	}
	invoiceID := history[0].ID

	t.Run("upload on the open invoice sets it", func(t *testing.T) {
		ref, err := sub.UploadRenewalProof(ctx, tenant.ID, invoiceID, pfaPNG(t))
		if err != nil {
			t.Fatalf("upload: %v", err)
		}
		got := get(invoiceID)
		t.Logf("proof=%s final_amount=%.2f proof_final_amount=%s", ref, got.FinalAmount, pfaAmount(got.ProofFinalAmount))
		if got.ProofURL == nil || *got.ProofURL != ref {
			t.Fatalf("proof_url = %v, want %s", got.ProofURL, ref)
		}
		if got.ProofFinalAmount == nil || *got.ProofFinalAmount != got.FinalAmount {
			t.Fatalf("proof_final_amount = %s, want %.2f", pfaAmount(got.ProofFinalAmount), got.FinalAmount)
		}
	})

	var uploadedFor float64
	var uploadedProof string
	t.Run("staff plan change keeps proof and amount, final_amount moves", func(t *testing.T) {
		before := get(invoiceID)
		uploadedFor = *before.ProofFinalAmount
		uploadedProof = *before.ProofURL
		if _, err := sub.UpdateVerificationPlan(ctx, invoiceID, pricey.ID, staffID); err != nil {
			t.Fatalf("staff plan change: %v", err)
		}
		got := get(invoiceID)
		t.Logf("final_amount %.2f -> %.2f, proof_final_amount=%s", before.FinalAmount, got.FinalAmount, pfaAmount(got.ProofFinalAmount))
		if got.FinalAmount == before.FinalAmount || got.PlanID != pricey.ID {
			t.Fatalf("plan change did not reprice: plan=%d final=%.2f", got.PlanID, got.FinalAmount)
		}
		if got.ProofURL == nil || *got.ProofURL != uploadedProof {
			t.Fatalf("staff plan change must keep the proof, got %v", got.ProofURL)
		}
		if got.ProofFinalAmount == nil || *got.ProofFinalAmount != uploadedFor {
			t.Fatalf("proof_final_amount = %s, want unchanged %.2f", pfaAmount(got.ProofFinalAmount), uploadedFor)
		}
	})

	t.Run("staff coupon removal keeps it too", func(t *testing.T) {
		if _, err := sub.UpdateVerificationCoupon(ctx, invoiceID, nil, staffID); err != nil {
			t.Fatalf("staff coupon change: %v", err)
		}
		got := get(invoiceID)
		if got.ProofFinalAmount == nil || *got.ProofFinalAmount != uploadedFor || got.ProofURL == nil {
			t.Fatalf("proof_final_amount = %s, want unchanged %.2f", pfaAmount(got.ProofFinalAmount), uploadedFor)
		}
	})

	t.Run("travel re-upload updates it to the current total", func(t *testing.T) {
		ref, err := sub.UploadRenewalProof(ctx, tenant.ID, invoiceID, pfaPNG(t))
		if err != nil {
			t.Fatalf("re-upload: %v", err)
		}
		got := get(invoiceID)
		t.Logf("final_amount=%.2f proof_final_amount=%s (was %.2f)", got.FinalAmount, pfaAmount(got.ProofFinalAmount), uploadedFor)
		if got.ProofURL == nil || *got.ProofURL != ref {
			t.Fatalf("proof_url = %v, want %s", got.ProofURL, ref)
		}
		if got.ProofFinalAmount == nil || *got.ProofFinalAmount != got.FinalAmount || *got.ProofFinalAmount == uploadedFor {
			t.Fatalf("proof_final_amount = %s, want new total %.2f", pfaAmount(got.ProofFinalAmount), got.FinalAmount)
		}
	})

	t.Run("travel plan change without proof clears it", func(t *testing.T) {
		if _, err := sub.CreateRenewalRequest(ctx, tenant.ID, cheap.ID, nil, nil); err != nil {
			t.Fatalf("travel plan change: %v", err)
		}
		got := get(invoiceID)
		t.Logf("proof_url=%v proof_final_amount=%s", got.ProofURL, pfaAmount(got.ProofFinalAmount))
		if got.ProofURL != nil || got.ProofFinalAmount != nil {
			t.Fatalf("proof and proof_final_amount must be cleared, got %v / %s", got.ProofURL, pfaAmount(got.ProofFinalAmount))
		}
	})

	t.Run("reopening a rejected invoice with a proof sets it", func(t *testing.T) {
		reason, at := "bukti buram", time.Now()
		if err := pvRepo.TransitionStatus(ctx, invoiceID, "pending", "rejected", &reason, &staffID, &at); err != nil {
			t.Fatalf("reject: %v", err)
		}
		if _, err := sub.UploadRenewalProof(ctx, tenant.ID, invoiceID, pfaPNG(t)); err != nil {
			t.Fatalf("reopen upload: %v", err)
		}
		got := get(invoiceID)
		t.Logf("status=%s final_amount=%.2f proof_final_amount=%s", got.Status, got.FinalAmount, pfaAmount(got.ProofFinalAmount))
		if got.Status != "pending" || got.ProofFinalAmount == nil || *got.ProofFinalAmount != got.FinalAmount {
			t.Fatalf("reopen: status=%s proof_final_amount=%s, want pending / %.2f", got.Status, pfaAmount(got.ProofFinalAmount), got.FinalAmount)
		}
	})
}
