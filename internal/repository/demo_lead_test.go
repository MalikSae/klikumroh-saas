package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

func TestDemoLeadRepository_UpsertCountsVisits(t *testing.T) {
	db := setupTestDB(t)
	// Registered first, so it runs after the row cleanup below (t.Cleanup is last in, first out).
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	repo := repository.NewDemoLeadRepository(db)

	// A number no real lead uses; removed when the test ends.
	phone := fmt.Sprintf("6299%010d", time.Now().UnixNano()%10000000000)
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM demo_leads WHERE phone = ?`, phone) })

	src := "utm_source=meta"
	first := &repository.DemoLead{Name: "Budi", Phone: phone, TravelName: "Al Fath Tours", City: "Surabaya", Source: &src, ConsentAt: time.Now()}
	if err := repo.Upsert(ctx, first); err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	second := &repository.DemoLead{Name: "Budi Santoso", Phone: phone, TravelName: "Al Fath Travel", City: "Surabaya", ConsentAt: time.Now()}
	if err := repo.Upsert(ctx, second); err != nil {
		t.Fatalf("second upsert: %v", err)
	}

	list, err := repo.List(ctx, 1000)
	if err != nil {
		t.Fatal(err)
	}
	var got *repository.DemoLead
	for i := range list {
		if list[i].Phone == phone {
			got = &list[i]
		}
	}
	if got == nil {
		t.Fatal("lead not listed")
	}
	if got.VisitCount != 2 {
		t.Fatalf("visit_count = %d, want 2", got.VisitCount)
	}
	if got.Name != "Budi Santoso" || got.TravelName != "Al Fath Travel" {
		t.Fatalf("details not updated: %+v", got)
	}
	if got.Source == nil || *got.Source != src {
		t.Fatalf("first source must be kept, got %v", got.Source)
	}
}
