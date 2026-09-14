package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Tenant represents the data model for the tenants table.
type Tenant struct {
	ID                           uint64     `json:"id"`
	Name                         string     `json:"name"`
	Slug                         string     `json:"slug"`
	Status                       string     `json:"status"`
	CommissionScheme             string     `json:"commission_scheme"`
	CurrentPlanID                *uint64    `json:"current_plan_id"`
	SubscriptionExpiresAt        *time.Time `json:"subscription_expires_at"`
	BrandPrimaryColor            *string    `json:"brand_primary_color"`
	BrandLogoURL                 *string    `json:"brand_logo_url"`
	BrandIconURL                 *string    `json:"brand_icon_url"`
	WhatsAppNumber               *string    `json:"whatsapp_number"`
	Tagline                      *string    `json:"tagline"`
	AboutSummary                 *string    `json:"about_summary"`
	PPIUNumber                   *string    `json:"ppiu_number"`
	Address                      *string    `json:"address"`
	City                         *string    `json:"city"`
	Province                     *string    `json:"province"`
	Phone                        *string    `json:"phone"`
	Email                        *string    `json:"email"`
	TrustRating                  *string    `json:"trust_rating"`
	TrustAlumniCount             *string    `json:"trust_alumni_count"`
	TrustGuarantee               *string    `json:"trust_guarantee"`
	SocialInstagram              *string    `json:"social_instagram"`
	SocialFacebook               *string    `json:"social_facebook"`
	SocialYoutube                *string    `json:"social_youtube"`
	MetaTitle                    *string    `json:"meta_title"`
	MetaDescription              *string    `json:"meta_description"`
	MetaKeywords                 *string    `json:"meta_keywords"`
	OGImageURL                   *string    `json:"og_image_url"`
	CommissionOverrideEnabled    bool       `json:"commission_override_enabled"`
	CommissionOverridePercentage *float64   `json:"commission_override_percentage"`
	AgentRegistrationFee         *float64   `json:"agent_registration_fee"`
	AgentRegistrationBenefits    *string    `json:"agent_registration_benefits"`
	AgentBankName                *string    `json:"agent_bank_name"`
	AgentBankAccountNumber       *string    `json:"agent_bank_account_number"`
	AgentBankAccountHolder       *string    `json:"agent_bank_account_holder"`
	AgentTermsConditions         *string    `json:"agent_terms_conditions"`
	AgentPosterURL               *string    `json:"agent_poster_url"`
	MinimumPayoutAmount          *float64   `json:"minimum_payout_amount"`
	TargetPeriodStart            *string    `json:"target_period_start"`
	TargetPeriodEnd              *string    `json:"target_period_end"`
	TargetJamaah                 *int       `json:"target_jamaah"`
	CreatedAt                    time.Time  `json:"created_at"`
	UpdatedAt                    time.Time  `json:"updated_at"`
}

// TenantAgentSettings represents the settings for agent onboarding and payouts.
type TenantAgentSettings struct {
	AgentRegistrationFee      *float64 `json:"agent_registration_fee"`
	AgentRegistrationBenefits *string  `json:"agent_registration_benefits"`
	AgentBankName             *string  `json:"agent_bank_name"`
	AgentBankAccountNumber    *string  `json:"agent_bank_account_number"`
	AgentBankAccountHolder    *string  `json:"agent_bank_account_holder"`
	AgentTermsConditions      *string  `json:"agent_terms_conditions"`
	AgentPosterURL            *string  `json:"agent_poster_url"`
	MinimumPayoutAmount       *float64 `json:"minimum_payout_amount"`
}

// TenantSEOGeoSettings represents the SEO and GEO settings for a tenant.
type TenantSEOGeoSettings struct {
	City            *string `json:"city"`
	Province        *string `json:"province"`
	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`
	MetaKeywords    *string `json:"meta_keywords"`
	OGImageURL      *string `json:"og_image_url"`
}

// TenantTargetSettings represents the monthly target settings for agents.
type TenantTargetSettings struct {
	TargetPeriodStart *string `json:"target_period_start"`
	TargetPeriodEnd   *string `json:"target_period_end"`
	TargetJamaah      *int    `json:"target_jamaah"`
}

// TenantRepository defines access methods for root tenant entities.
type TenantRepository interface {
	Create(ctx context.Context, tenant *Tenant) error
	GetByID(ctx context.Context, id uint64) (*Tenant, error)
	GetBySlug(ctx context.Context, slug string) (*Tenant, error)
	GetByWhatsAppNumber(ctx context.Context, whatsappNumber string) (*Tenant, error)
	Update(ctx context.Context, tenant *Tenant) error
	UpdateBranding(ctx context.Context, tenantID uint64, brandPrimaryColor string) error
	UpdateBrandIcon(ctx context.Context, tenantID uint64, iconURL *string) error
	UpdateBrandLogo(ctx context.Context, tenantID uint64, logoURL *string) error
	GetSEOGeo(ctx context.Context, tenantID uint64) (*TenantSEOGeoSettings, error)
	UpdateSEOGeo(ctx context.Context, tenantID uint64, settings *TenantSEOGeoSettings) error
	UpdateOGImage(ctx context.Context, tenantID uint64, ogImageURL *string) error
	UpdateProfile(ctx context.Context, tenantID uint64, name string, logoURL *string, tagline *string, aboutSummary *string) error
	UpdateContactAndLegal(ctx context.Context, tenantID uint64, ppiuNumber *string, address *string, phone *string, email *string, whatsapp *string, instagram *string, facebook *string, youtube *string) error
	UpdateTrustMetrics(ctx context.Context, tenantID uint64, rating *string, alumniCount *string, guarantee *string) error
	UpdateWhatsAppNumber(ctx context.Context, tenantID uint64, whatsappNumber string) error
	UpdateCommissionSettings(ctx context.Context, tenantID uint64, enabled bool, percentage *float64) error
	UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *TenantAgentSettings) error
	UpdateAgentPoster(ctx context.Context, tenantID uint64, posterURL *string) error
	GetTargetSettings(ctx context.Context, tenantID uint64) (*TenantTargetSettings, error)
	UpdateTargetSettings(ctx context.Context, tenantID uint64, settings *TenantTargetSettings) error
	UpdateSubscription(ctx context.Context, tenantID uint64, planID uint64, expiresAt time.Time, status string) error
	Delete(ctx context.Context, id uint64) error
}

type mysqlTenantRepository struct {
	db *sql.DB
}

// NewTenantRepository creates a new TenantRepository instance.
func NewTenantRepository(db *sql.DB) TenantRepository {
	return &mysqlTenantRepository{db: db}
}

func (r *mysqlTenantRepository) Create(ctx context.Context, tenant *Tenant) error {
	query := `
		INSERT INTO tenants (
			name, slug, status, commission_scheme, current_plan_id, subscription_expires_at, brand_primary_color, brand_logo_url, whatsapp_number,
			tagline, about_summary, ppiu_number, address, phone, email,
			trust_rating, trust_alumni_count, trust_guarantee,
			social_instagram, social_facebook, social_youtube,
			commission_override_enabled, commission_override_percentage
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	if tenant.Status == "" {
		tenant.Status = "active"
	}
	if tenant.CommissionScheme == "" {
		tenant.CommissionScheme = "flat"
	}

	result, err := r.db.ExecContext(ctx, query,
		tenant.Name,
		tenant.Slug,
		tenant.Status,
		tenant.CommissionScheme,
		tenant.CurrentPlanID,
		tenant.SubscriptionExpiresAt,
		tenant.BrandPrimaryColor,
		tenant.BrandLogoURL,
		tenant.WhatsAppNumber,
		tenant.Tagline,
		tenant.AboutSummary,
		tenant.PPIUNumber,
		tenant.Address,
		tenant.Phone,
		tenant.Email,
		tenant.TrustRating,
		tenant.TrustAlumniCount,
		tenant.TrustGuarantee,
		tenant.SocialInstagram,
		tenant.SocialFacebook,
		tenant.SocialYoutube,
		tenant.CommissionOverrideEnabled,
		tenant.CommissionOverridePercentage,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	tenant.ID = uint64(id)
	return nil
}

func (r *mysqlTenantRepository) GetByID(ctx context.Context, id uint64) (*Tenant, error) {
	query := `
		SELECT id, name, slug, status, commission_scheme, current_plan_id, subscription_expires_at, brand_primary_color, brand_logo_url, brand_icon_url, whatsapp_number,
			tagline, about_summary, ppiu_number, address, city, province, phone, email,
			trust_rating, trust_alumni_count, trust_guarantee,
			social_instagram, social_facebook, social_youtube,
			meta_title, meta_description, meta_keywords, og_image_url,
			commission_override_enabled, commission_override_percentage,
			agent_registration_fee, agent_registration_benefits, agent_bank_name,
			agent_bank_account_number, agent_bank_account_holder, agent_terms_conditions,
			agent_poster_url, minimum_payout_amount, created_at, updated_at
		FROM tenants
		WHERE id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id)
	return r.scanTenant(row)
}

func (r *mysqlTenantRepository) GetBySlug(ctx context.Context, slug string) (*Tenant, error) {
	query := `
		SELECT id, name, slug, status, commission_scheme, current_plan_id, subscription_expires_at, brand_primary_color, brand_logo_url, brand_icon_url, whatsapp_number,
			tagline, about_summary, ppiu_number, address, city, province, phone, email,
			trust_rating, trust_alumni_count, trust_guarantee,
			social_instagram, social_facebook, social_youtube,
			meta_title, meta_description, meta_keywords, og_image_url,
			commission_override_enabled, commission_override_percentage,
			agent_registration_fee, agent_registration_benefits, agent_bank_name,
			agent_bank_account_number, agent_bank_account_holder, agent_terms_conditions,
			agent_poster_url, minimum_payout_amount, created_at, updated_at
		FROM tenants
		WHERE slug = ?
	`
	row := r.db.QueryRowContext(ctx, query, slug)
	return r.scanTenant(row)
}

func (r *mysqlTenantRepository) GetByWhatsAppNumber(ctx context.Context, whatsappNumber string) (*Tenant, error) {
	query := `
		SELECT id, name, slug, status, commission_scheme, current_plan_id, subscription_expires_at, brand_primary_color, brand_logo_url, brand_icon_url, whatsapp_number,
			tagline, about_summary, ppiu_number, address, city, province, phone, email,
			trust_rating, trust_alumni_count, trust_guarantee,
			social_instagram, social_facebook, social_youtube,
			meta_title, meta_description, meta_keywords, og_image_url,
			commission_override_enabled, commission_override_percentage,
			agent_registration_fee, agent_registration_benefits, agent_bank_name,
			agent_bank_account_number, agent_bank_account_holder, agent_terms_conditions,
			agent_poster_url, minimum_payout_amount, created_at, updated_at
		FROM tenants
		WHERE whatsapp_number = ?
		LIMIT 1
	`
	row := r.db.QueryRowContext(ctx, query, whatsappNumber)
	return r.scanTenant(row)
}

func (r *mysqlTenantRepository) Update(ctx context.Context, tenant *Tenant) error {
	query := `
		UPDATE tenants
		SET name = ?, slug = ?, status = ?, commission_scheme = ?, current_plan_id = ?, subscription_expires_at = ?, brand_primary_color = ?, brand_logo_url = ?, whatsapp_number = ?,
			tagline = ?, about_summary = ?, ppiu_number = ?, address = ?, phone = ?, email = ?,
			trust_rating = ?, trust_alumni_count = ?, trust_guarantee = ?,
			social_instagram = ?, social_facebook = ?, social_youtube = ?,
			commission_override_enabled = ?, commission_override_percentage = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		tenant.Name,
		tenant.Slug,
		tenant.Status,
		tenant.CommissionScheme,
		tenant.CurrentPlanID,
		tenant.SubscriptionExpiresAt,
		tenant.BrandPrimaryColor,
		tenant.BrandLogoURL,
		tenant.WhatsAppNumber,
		tenant.Tagline,
		tenant.AboutSummary,
		tenant.PPIUNumber,
		tenant.Address,
		tenant.Phone,
		tenant.Email,
		tenant.TrustRating,
		tenant.TrustAlumniCount,
		tenant.TrustGuarantee,
		tenant.SocialInstagram,
		tenant.SocialFacebook,
		tenant.SocialYoutube,
		tenant.CommissionOverrideEnabled,
		tenant.CommissionOverridePercentage,
		tenant.ID,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenant.ID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateProfile(ctx context.Context, tenantID uint64, name string, logoURL *string, tagline *string, aboutSummary *string) error {
	query := `
		UPDATE tenants
		SET name = ?, brand_logo_url = ?, tagline = ?, about_summary = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query, name, logoURL, tagline, aboutSummary, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateContactAndLegal(ctx context.Context, tenantID uint64, ppiuNumber *string, address *string, phone *string, email *string, whatsapp *string, instagram *string, facebook *string, youtube *string) error {
	query := `
		UPDATE tenants
		SET ppiu_number = ?, address = ?, phone = ?, email = ?, whatsapp_number = ?,
			social_instagram = ?, social_facebook = ?, social_youtube = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query, ppiuNumber, address, phone, email, whatsapp, instagram, facebook, youtube, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateTrustMetrics(ctx context.Context, tenantID uint64, rating *string, alumniCount *string, guarantee *string) error {
	query := `
		UPDATE tenants
		SET trust_rating = ?, trust_alumni_count = ?, trust_guarantee = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query, rating, alumniCount, guarantee, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateBranding(ctx context.Context, tenantID uint64, brandPrimaryColor string) error {
	query := `UPDATE tenants SET brand_primary_color = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, brandPrimaryColor, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateBrandIcon(ctx context.Context, tenantID uint64, iconURL *string) error {
	query := `UPDATE tenants SET brand_icon_url = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, iconURL, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateBrandLogo(ctx context.Context, tenantID uint64, logoURL *string) error {
	query := `UPDATE tenants SET brand_logo_url = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, logoURL, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) GetSEOGeo(ctx context.Context, tenantID uint64) (*TenantSEOGeoSettings, error) {
	query := `SELECT city, province, meta_title, meta_description, meta_keywords, og_image_url FROM tenants WHERE id = ?`
	var city, province, metaTitle, metaDescription, metaKeywords, ogImageURL sql.NullString
	err := r.db.QueryRowContext(ctx, query, tenantID).Scan(&city, &province, &metaTitle, &metaDescription, &metaKeywords, &ogImageURL)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	var s TenantSEOGeoSettings
	if city.Valid {
		s.City = &city.String
	}
	if province.Valid {
		s.Province = &province.String
	}
	if metaTitle.Valid {
		s.MetaTitle = &metaTitle.String
	}
	if metaDescription.Valid {
		s.MetaDescription = &metaDescription.String
	}
	if metaKeywords.Valid {
		s.MetaKeywords = &metaKeywords.String
	}
	if ogImageURL.Valid {
		s.OGImageURL = &ogImageURL.String
	}
	return &s, nil
}

func (r *mysqlTenantRepository) UpdateSEOGeo(ctx context.Context, tenantID uint64, settings *TenantSEOGeoSettings) error {
	query := `
		UPDATE tenants
		SET city = ?,
		    province = ?,
		    meta_title = ?,
		    meta_description = ?,
		    meta_keywords = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		settings.City,
		settings.Province,
		settings.MetaTitle,
		settings.MetaDescription,
		settings.MetaKeywords,
		tenantID,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateOGImage(ctx context.Context, tenantID uint64, ogImageURL *string) error {
	query := `UPDATE tenants SET og_image_url = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, ogImageURL, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateWhatsAppNumber(ctx context.Context, tenantID uint64, whatsappNumber string) error {
	query := `UPDATE tenants SET whatsapp_number = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, whatsappNumber, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateCommissionSettings(ctx context.Context, tenantID uint64, enabled bool, percentage *float64) error {
	query := `
		UPDATE tenants
		SET commission_override_enabled = ?, commission_override_percentage = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query, enabled, percentage, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) Delete(ctx context.Context, id uint64) error {
	query := `DELETE FROM tenants WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *TenantAgentSettings) error {
	query := `
		UPDATE tenants
		SET agent_registration_fee = ?,
		    agent_registration_benefits = ?,
		    agent_bank_name = ?,
		    agent_bank_account_number = ?,
		    agent_bank_account_holder = ?,
		    agent_terms_conditions = ?,
		    agent_poster_url = ?,
		    minimum_payout_amount = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		settings.AgentRegistrationFee,
		settings.AgentRegistrationBenefits,
		settings.AgentBankName,
		settings.AgentBankAccountNumber,
		settings.AgentBankAccountHolder,
		settings.AgentTermsConditions,
		settings.AgentPosterURL,
		settings.MinimumPayoutAmount,
		tenantID,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) UpdateAgentPoster(ctx context.Context, tenantID uint64, posterURL *string) error {
	query := `UPDATE tenants SET agent_poster_url = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, posterURL, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlTenantRepository) GetTargetSettings(ctx context.Context, tenantID uint64) (*TenantTargetSettings, error) {
	return &TenantTargetSettings{}, nil
}

func (r *mysqlTenantRepository) UpdateTargetSettings(ctx context.Context, tenantID uint64, settings *TenantTargetSettings) error {
	return nil
}

func (r *mysqlTenantRepository) scanTenant(row *sql.Row) (*Tenant, error) {
	var t Tenant
	var currentPlanID sql.NullInt64
	var subscriptionExpiresAt sql.NullTime
	var brandPrimaryColor sql.NullString
	var brandLogoURL sql.NullString
	var brandIconURL sql.NullString
	var whatsappNumber sql.NullString
	var tagline sql.NullString
	var aboutSummary sql.NullString
	var ppiuNumber sql.NullString
	var address sql.NullString
	var city sql.NullString
	var province sql.NullString
	var phone sql.NullString
	var email sql.NullString
	var trustRating sql.NullString
	var trustAlumniCount sql.NullString
	var trustGuarantee sql.NullString
	var socialInstagram sql.NullString
	var socialFacebook sql.NullString
	var socialYoutube sql.NullString
	var metaTitle sql.NullString
	var metaDescription sql.NullString
	var metaKeywords sql.NullString
	var ogImageURL sql.NullString
	var commissionOverridePercentage sql.NullFloat64
	var agentRegistrationFee sql.NullFloat64
	var agentRegistrationBenefits sql.NullString
	var agentBankName sql.NullString
	var agentBankAccountNumber sql.NullString
	var agentBankAccountHolder sql.NullString
	var agentTermsConditions sql.NullString
	var agentPosterURL sql.NullString
	var minimumPayoutAmount sql.NullFloat64

	err := row.Scan(
		&t.ID,
		&t.Name,
		&t.Slug,
		&t.Status,
		&t.CommissionScheme,
		&currentPlanID,
		&subscriptionExpiresAt,
		&brandPrimaryColor,
		&brandLogoURL,
		&brandIconURL,
		&whatsappNumber,
		&tagline,
		&aboutSummary,
		&ppiuNumber,
		&address,
		&city,
		&province,
		&phone,
		&email,
		&trustRating,
		&trustAlumniCount,
		&trustGuarantee,
		&socialInstagram,
		&socialFacebook,
		&socialYoutube,
		&metaTitle,
		&metaDescription,
		&metaKeywords,
		&ogImageURL,
		&t.CommissionOverrideEnabled,
		&commissionOverridePercentage,
		&agentRegistrationFee,
		&agentRegistrationBenefits,
		&agentBankName,
		&agentBankAccountNumber,
		&agentBankAccountHolder,
		&agentTermsConditions,
		&agentPosterURL,
		&minimumPayoutAmount,
		&t.CreatedAt,
		&t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if currentPlanID.Valid {
		val := uint64(currentPlanID.Int64)
		t.CurrentPlanID = &val
	}
	if subscriptionExpiresAt.Valid {
		t.SubscriptionExpiresAt = &subscriptionExpiresAt.Time
	}
	if brandPrimaryColor.Valid {
		t.BrandPrimaryColor = &brandPrimaryColor.String
	}
	if brandLogoURL.Valid {
		t.BrandLogoURL = &brandLogoURL.String
	}
	if brandIconURL.Valid {
		t.BrandIconURL = &brandIconURL.String
	}
	if whatsappNumber.Valid {
		t.WhatsAppNumber = &whatsappNumber.String
	}
	if tagline.Valid {
		t.Tagline = &tagline.String
	}
	if aboutSummary.Valid {
		t.AboutSummary = &aboutSummary.String
	}
	if ppiuNumber.Valid {
		t.PPIUNumber = &ppiuNumber.String
	}
	if address.Valid {
		t.Address = &address.String
	}
	if city.Valid {
		t.City = &city.String
	}
	if province.Valid {
		t.Province = &province.String
	}
	if phone.Valid {
		t.Phone = &phone.String
	}
	if email.Valid {
		t.Email = &email.String
	}
	if trustRating.Valid {
		t.TrustRating = &trustRating.String
	}
	if trustAlumniCount.Valid {
		t.TrustAlumniCount = &trustAlumniCount.String
	}
	if trustGuarantee.Valid {
		t.TrustGuarantee = &trustGuarantee.String
	}
	if socialInstagram.Valid {
		t.SocialInstagram = &socialInstagram.String
	}
	if socialFacebook.Valid {
		t.SocialFacebook = &socialFacebook.String
	}
	if socialYoutube.Valid {
		t.SocialYoutube = &socialYoutube.String
	}
	if metaTitle.Valid {
		t.MetaTitle = &metaTitle.String
	}
	if metaDescription.Valid {
		t.MetaDescription = &metaDescription.String
	}
	if metaKeywords.Valid {
		t.MetaKeywords = &metaKeywords.String
	}
	if ogImageURL.Valid {
		t.OGImageURL = &ogImageURL.String
	}
	if commissionOverridePercentage.Valid {
		t.CommissionOverridePercentage = &commissionOverridePercentage.Float64
	}
	if agentRegistrationFee.Valid {
		t.AgentRegistrationFee = &agentRegistrationFee.Float64
	}
	if agentRegistrationBenefits.Valid {
		t.AgentRegistrationBenefits = &agentRegistrationBenefits.String
	}
	if agentBankName.Valid {
		t.AgentBankName = &agentBankName.String
	}
	if agentBankAccountNumber.Valid {
		t.AgentBankAccountNumber = &agentBankAccountNumber.String
	}
	if agentBankAccountHolder.Valid {
		t.AgentBankAccountHolder = &agentBankAccountHolder.String
	}
	if agentTermsConditions.Valid {
		t.AgentTermsConditions = &agentTermsConditions.String
	}
	if agentPosterURL.Valid {
		t.AgentPosterURL = &agentPosterURL.String
	}
	if minimumPayoutAmount.Valid {
		t.MinimumPayoutAmount = &minimumPayoutAmount.Float64
	}

	return &t, nil
}

func (r *mysqlTenantRepository) UpdateSubscription(ctx context.Context, tenantID uint64, planID uint64, expiresAt time.Time, status string) error {
	query := `
		UPDATE tenants
		SET current_plan_id = ?, subscription_expires_at = ?, status = ?, updated_at = NOW()
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query, planID, expiresAt, status, tenantID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}
