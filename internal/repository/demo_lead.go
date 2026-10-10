package repository

import (
	"context"
	"database/sql"
	"time"
)

// DemoLead is a person who opened the demo dashboard (see migration 000076).
type DemoLead struct {
	ID          uint64    `json:"id"`
	Name        string    `json:"name"`
	Phone       string    `json:"phone"`
	TravelName  string    `json:"travel_name"`
	City        string    `json:"city"`
	Source      *string   `json:"source"`
	ConsentAt   time.Time `json:"consent_at"`
	VisitCount  int       `json:"visit_count"`
	FirstSeenAt time.Time `json:"first_seen_at"`
	LastSeenAt  time.Time `json:"last_seen_at"`
}

// DemoLeadRepository stores the demo visitors. The table is platform level (not tied to a travel), so
// there is no tenant_id: it is read only by KlikUmroh staff.
type DemoLeadRepository interface {
	// Upsert records a demo visit. A known WhatsApp number updates the details and counts one more visit.
	Upsert(ctx context.Context, lead *DemoLead) error
	// List returns the most recently active leads first.
	List(ctx context.Context, limit int) ([]DemoLead, error)
}

type mysqlDemoLeadRepository struct {
	db *sql.DB
}

// NewDemoLeadRepository creates the repository.
func NewDemoLeadRepository(db *sql.DB) DemoLeadRepository {
	return &mysqlDemoLeadRepository{db: db}
}

func (r *mysqlDemoLeadRepository) Upsert(ctx context.Context, lead *DemoLead) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO demo_leads (name, phone, travel_name, city, source, consent_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			name = VALUES(name),
			travel_name = VALUES(travel_name),
			city = VALUES(city),
			source = COALESCE(demo_leads.source, VALUES(source)),
			consent_at = VALUES(consent_at),
			visit_count = visit_count + 1,
			last_seen_at = CURRENT_TIMESTAMP`,
		lead.Name, lead.Phone, lead.TravelName, lead.City, lead.Source, lead.ConsentAt)
	return err
}

func (r *mysqlDemoLeadRepository) List(ctx context.Context, limit int) ([]DemoLead, error) {
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, phone, travel_name, city, source, consent_at, visit_count, first_seen_at, last_seen_at
		FROM demo_leads
		ORDER BY last_seen_at DESC, id DESC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DemoLead{}
	for rows.Next() {
		var l DemoLead
		if err := rows.Scan(&l.ID, &l.Name, &l.Phone, &l.TravelName, &l.City, &l.Source, &l.ConsentAt, &l.VisitCount, &l.FirstSeenAt, &l.LastSeenAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}
