package service

import (
	"context"
	"testing"

	"klikumroh/internal/repository"
)

// fakePendingAmounts is a PaymentVerificationRepository that also lists open invoice totals.
type fakePendingAmounts struct {
	repository.PaymentVerificationRepository
	amounts   []float64
	gotMin    float64
	gotMax    float64
	gotExcept uint64
}

func (f *fakePendingAmounts) PendingFinalAmounts(_ context.Context, minAmount, maxAmount float64, excludeID uint64) ([]float64, error) {
	f.gotMin, f.gotMax, f.gotExcept = minAmount, maxAmount, excludeID
	return f.amounts, nil
}

// L2: the transfer code is unique among open invoices with the same total.
func TestPickUniqueCode_AvoidsOpenInvoiceTotals(t *testing.T) {
	ctx := context.Background()
	base := 500000.0
	// Every code but 777 is taken.
	f := &fakePendingAmounts{}
	for c := 100; c <= 999; c++ {
		if c != 777 {
			f.amounts = append(f.amounts, base+float64(c))
		}
	}
	for i := 0; i < 20; i++ {
		if got := pickUniqueCode(ctx, f, base, 42, 0); got != 777 {
			t.Fatalf("expected the only free code 777, got %d", got)
		}
	}
	if f.gotMin != base+100 || f.gotMax != base+999 || f.gotExcept != 42 {
		t.Fatalf("lookup range/exclude = %v-%v except %d", f.gotMin, f.gotMax, f.gotExcept)
	}

	// The current code is kept while it is still unique, replaced when another invoice has it.
	f.amounts = []float64{base + 250}
	if got := pickUniqueCode(ctx, f, base, 42, 321); got != 321 {
		t.Fatalf("a still-unique current code must be kept, got %d", got)
	}
	if got := pickUniqueCode(ctx, f, base, 42, 250); got == 250 || got < 100 || got > 999 {
		t.Fatalf("a taken current code must be replaced by a free one, got %d", got)
	}
}

// Rank tile: no rank without an own closing; equal totals share a rank.
func TestClosingRank(t *testing.T) {
	stats := []repository.AgentClosingStat{
		{AgentID: 1, TotalJamaah: 5}, {AgentID: 2, TotalJamaah: 3}, {AgentID: 3, TotalJamaah: 3},
		{AgentID: 4, TotalJamaah: 0},
	}
	cases := map[uint64]int{1: 1, 2: 2, 3: 2, 4: 0, 99: 0}
	for agent, want := range cases {
		if got := closingRank(stats, agent); got != want {
			t.Errorf("agent %d: rank %d, want %d", agent, got, want)
		}
	}
	nobody := []repository.AgentClosingStat{{AgentID: 1}, {AgentID: 2}}
	if got := closingRank(nobody, 1); got != 0 {
		t.Fatalf("nobody closed yet: oldest agent got rank %d, want 0", got)
	}
}

// Staff tenant detail: the primary custom domain wins over its redirecting alias, whatever the order.
func TestPickPrimaryCustomDomain(t *testing.T) {
	primaryID := uint64(10)
	primary := repository.Domain{ID: primaryID, Type: "custom", Hostname: "www.travel.com", Status: "active"}
	alias := repository.Domain{ID: 11, Type: "custom", Hostname: "travel.com", Status: "pending", RedirectToDomainID: &primaryID}
	sub := repository.Domain{ID: 9, Type: "subdomain", Hostname: "travel.klikumroh.id", Status: "active"}

	for _, list := range [][]repository.Domain{{sub, primary, alias}, {sub, alias, primary}} {
		if got := pickPrimaryCustomDomain(list); got == nil || got.Hostname != "www.travel.com" {
			t.Fatalf("expected the primary www domain, got %+v", got)
		}
	}
	if got := pickPrimaryCustomDomain([]repository.Domain{sub, alias}); got == nil || got.Hostname != "travel.com" {
		t.Fatalf("without a primary the alias is shown, got %+v", got)
	}
	if got := pickPrimaryCustomDomain([]repository.Domain{sub}); got != nil {
		t.Fatalf("no custom domain: expected nil, got %+v", got)
	}
}

// Paid vs organic (keputusan pendiri 5 Okt 2026): only a real Meta ad id makes a lead paid.
func TestProspectAttributionIsPaid(t *testing.T) {
	cases := []struct {
		name string
		attr ProspectAttribution
		paid bool
	}{
		{"fbclid only", ProspectAttribution{Fbclid: "IwAR0abc"}, false},
		{"utm_medium=paid only", ProspectAttribution{UTMMedium: "paid"}, false},
		{"utm_medium=cpc only", ProspectAttribution{UTMMedium: "cpc", UTMSource: "facebook"}, false},
		{"ad id", ProspectAttribution{AdID: "120200000000"}, true},
		{"ad id with spaces", ProspectAttribution{AdID: " 120200000000 "}, true},
		{"unfilled template", ProspectAttribution{AdID: "{{ad.id}}"}, false},
		{"non-digit", ProspectAttribution{AdID: "12020abc"}, false},
		{"too short", ProspectAttribution{AdID: "123"}, false},
		{"empty", ProspectAttribution{}, false},
	}
	for _, tc := range cases {
		if got := tc.attr.isPaid(); got != tc.paid {
			t.Errorf("%s: isPaid = %v, want %v", tc.name, got, tc.paid)
		}
	}
}

// Lost reason: only tidak_lanjut -> tidak_lanjut on a "batal_setelah_dp" prospect is refused.
func TestLostCategoryIsSystem(t *testing.T) {
	sys, other := "batal_setelah_dp", "harga"
	if !lostCategoryIsSystem("tidak_lanjut", "tidak_lanjut", &sys) {
		t.Fatal("tidak_lanjut -> tidak_lanjut on batal_setelah_dp must be refused")
	}
	if lostCategoryIsSystem("tidak_lanjut", "baru", &sys) {
		t.Fatal("reopening a cancelled closing stays allowed")
	}
	if lostCategoryIsSystem("tidak_lanjut", "tidak_lanjut", &other) || lostCategoryIsSystem("tidak_lanjut", "tidak_lanjut", nil) {
		t.Fatal("a normal category can still be changed")
	}
}
