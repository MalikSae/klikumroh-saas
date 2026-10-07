package repository

import (
	"context"
	"database/sql"
	"errors"
)

// OnboardingFacts are the raw counts behind the travel onboarding checklist (Beranda, 7 Oct 2026).
// Every query is scoped to one tenant.
type OnboardingFacts struct {
	TravelName                 string
	Address                    string
	City                       string
	LogoURL                    string
	AgentBenefits              string
	AgentTerms                 string
	MetaPixelID                string
	PublishedPackages          int
	ReadyPackages              int // published with a price and a departure date
	PackagesWithoutCommission  int // published without a commission amount
	DraftPackageID             *uint64
	MissingCommissionPackageID *uint64
	TrustItems                 int // active testimonials and banners (the FAQ is seeded at signup, so it proves nothing)
	Agents                     int // every registration, any status
	ActiveAgents               int
	Targets                    int
	Prospects                  int
	FollowedUp                 int // prospects past 'baru'
	CustomDomains              int // active custom domains
	AdminUsers                 int
}

type OnboardingRepository interface {
	Facts(ctx context.Context, tenantID uint64) (*OnboardingFacts, error)
}

type mysqlOnboardingRepository struct {
	db *sql.DB
}

func NewOnboardingRepository(db *sql.DB) OnboardingRepository {
	return &mysqlOnboardingRepository{db: db}
}

func (r *mysqlOnboardingRepository) Facts(ctx context.Context, tenantID uint64) (*OnboardingFacts, error) {
	f := &OnboardingFacts{}
	err := r.db.QueryRowContext(ctx, `
		SELECT name, COALESCE(address, ''), COALESCE(city, ''), COALESCE(brand_logo_url, ''),
		       COALESCE(agent_registration_benefits, ''), COALESCE(agent_terms_conditions, ''), COALESCE(meta_pixel_id, '')
		FROM tenants WHERE id = ?`, tenantID).
		Scan(&f.TravelName, &f.Address, &f.City, &f.LogoURL, &f.AgentBenefits, &f.AgentTerms, &f.MetaPixelID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(status = 'published'), 0),
		       COALESCE(SUM(status = 'published' AND price > 0 AND departure_date IS NOT NULL), 0),
		       COALESCE(SUM(status = 'published' AND (commission_amount IS NULL OR commission_amount <= 0)), 0)
		FROM packages WHERE tenant_id = ?`, tenantID).
		Scan(&f.PublishedPackages, &f.ReadyPackages, &f.PackagesWithoutCommission); err != nil {
		return nil, err
	}
	if f.DraftPackageID, err = r.firstID(ctx, `SELECT id FROM packages WHERE tenant_id = ? AND status = 'draft' ORDER BY id LIMIT 1`, tenantID); err != nil {
		return nil, err
	}
	if f.MissingCommissionPackageID, err = r.firstID(ctx, `SELECT id FROM packages WHERE tenant_id = ? AND status = 'published' AND (commission_amount IS NULL OR commission_amount <= 0) ORDER BY id LIMIT 1`, tenantID); err != nil {
		return nil, err
	}

	if err := r.db.QueryRowContext(ctx, `
		SELECT (SELECT COUNT(*) FROM tenant_testimonials WHERE tenant_id = ? AND is_active = 1)
		     + (SELECT COUNT(*) FROM tenant_banners WHERE tenant_id = ? AND is_active = 1)`,
		tenantID, tenantID).Scan(&f.TrustItems); err != nil {
		return nil, err
	}

	if err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM(status = 'active'), 0) FROM agents WHERE tenant_id = ?`, tenantID).
		Scan(&f.Agents, &f.ActiveAgents); err != nil {
		return nil, err
	}
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_targets WHERE tenant_id = ?`, tenantID).Scan(&f.Targets); err != nil {
		return nil, err
	}
	if err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM(status <> 'baru'), 0) FROM prospects WHERE tenant_id = ?`, tenantID).
		Scan(&f.Prospects, &f.FollowedUp); err != nil {
		return nil, err
	}
	if err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM domains WHERE tenant_id = ? AND type = 'custom' AND status = 'active'`, tenantID).
		Scan(&f.CustomDomains); err != nil {
		return nil, err
	}
	if err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM admin_users WHERE tenant_id = ? AND status = 'active'`, tenantID).
		Scan(&f.AdminUsers); err != nil {
		return nil, err
	}
	return f, nil
}

func (r *mysqlOnboardingRepository) firstID(ctx context.Context, query string, tenantID uint64) (*uint64, error) {
	var id uint64
	err := r.db.QueryRowContext(ctx, query, tenantID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &id, nil
}
