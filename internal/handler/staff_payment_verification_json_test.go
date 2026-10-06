package handler

import (
	"encoding/json"
	"strings"
	"testing"

	"klikumroh/internal/repository"
)

// proof_final_amount is staff-only (keputusan pendiri 6 Okt 2026): the shared struct never serializes it
// (travel-facing JSON), the staff wrapper always does (null without a proof).
func TestProofFinalAmount_StaffJSONOnly(t *testing.T) {
	amount := 1500123.0
	proof := "/uploads/1/subscription-proofs/a.webp"
	pv := repository.PaymentVerification{ID: 7, FinalAmount: 2500456, ProofURL: &proof, ProofFinalAmount: &amount}

	travel, err := json.Marshal(pv)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(travel), "proof_final_amount") {
		t.Fatalf("travel-facing JSON must not carry proof_final_amount: %s", travel)
	}

	staff, err := json.Marshal(toStaffPaymentVerification(&pv))
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]interface{}
	if err := json.Unmarshal(staff, &got); err != nil {
		t.Fatal(err)
	}
	if got["proof_final_amount"] != amount || got["final_amount"] != 2500456.0 || got["proof_url"] != proof {
		t.Fatalf("staff JSON: %s", staff)
	}

	list, err := json.Marshal(toStaffPaymentVerifications([]repository.PaymentVerification{{ID: 8}}))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(list), `"proof_final_amount":null`) {
		t.Fatalf("staff list JSON without proof: %s", list)
	}
}
