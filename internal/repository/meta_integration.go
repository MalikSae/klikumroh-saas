package repository

import (
	"context"
	"database/sql"
	"errors"
)

// MetaIntegration is a travel's Meta Pixel + Conversions API configuration.
// TokenEnc is the encrypted CAPI access token; it never leaves the backend.
type MetaIntegration struct {
	TenantID      uint64
	PixelID       *string
	TokenEnc      *string
	TestEventCode *string
}

// MetaIntegrationRepository reads and writes a tenant's Meta settings. Every call is scoped by tenant_id.
type MetaIntegrationRepository interface {
	Get(ctx context.Context, tenantID uint64) (*MetaIntegration, error)
	// Save stores pixel ID and test code; the token is replaced only when tokenEnc is non-nil
	// (clearToken removes it).
	Save(ctx context.Context, tenantID uint64, pixelID *string, tokenEnc *string, clearToken bool, testEventCode *string) error
	// GetPublicPixelID returns the pixel ID for the public site, or "" when none or when the site is not
	// live (pending, inactive, or subscription expired past the 7-day grace period: the suspended page).
	GetPublicPixelID(ctx context.Context, tenantID uint64) (string, error)
}

type mysqlMetaIntegrationRepository struct {
	db *sql.DB
}

// NewMetaIntegrationRepository creates a MySQL-backed MetaIntegrationRepository.
func NewMetaIntegrationRepository(db *sql.DB) MetaIntegrationRepository {
	return &mysqlMetaIntegrationRepository{db: db}
}

func (r *mysqlMetaIntegrationRepository) Get(ctx context.Context, tenantID uint64) (*MetaIntegration, error) {
	var pixel, token, testCode sql.NullString
	err := r.db.QueryRowContext(ctx,
		`SELECT meta_pixel_id, meta_capi_token_enc, meta_test_event_code FROM tenants WHERE id = ?`, tenantID,
	).Scan(&pixel, &token, &testCode)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &MetaIntegration{
		TenantID:      tenantID,
		PixelID:       nullStringPtr(pixel),
		TokenEnc:      nullStringPtr(token),
		TestEventCode: nullStringPtr(testCode),
	}, nil
}

func (r *mysqlMetaIntegrationRepository) Save(ctx context.Context, tenantID uint64, pixelID *string, tokenEnc *string, clearToken bool, testEventCode *string) error {
	query := `UPDATE tenants SET meta_pixel_id = ?, meta_test_event_code = ?`
	args := []interface{}{pixelID, testEventCode}
	switch {
	case clearToken:
		query += `, meta_capi_token_enc = NULL`
	case tokenEnc != nil:
		query += `, meta_capi_token_enc = ?`
		args = append(args, *tokenEnc)
	}
	query += ` WHERE id = ?`
	args = append(args, tenantID)
	res, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		var exists int
		if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tenants WHERE id = ?`, tenantID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return ErrNotFound
		}
	}
	return nil
}

func (r *mysqlMetaIntegrationRepository) GetPublicPixelID(ctx context.Context, tenantID uint64) (string, error) {
	var pixel sql.NullString
	err := r.db.QueryRowContext(ctx,
		`SELECT meta_pixel_id FROM tenants
		 WHERE id = ? AND status NOT IN ('pending', 'inactive')
		   AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW() - INTERVAL 7 DAY)`, tenantID).Scan(&pixel)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return pixel.String, nil
}
