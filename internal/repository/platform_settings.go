package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// PlatformSettingsRepository handles persistence of global platform configuration.
type PlatformSettingsRepository interface {
	GetAll(ctx context.Context) (map[string]string, error)
	SetMany(ctx context.Context, settings map[string]string) error
}

type mysqlPlatformSettingsRepository struct {
	db *sql.DB
}

// NewPlatformSettingsRepository creates a new PlatformSettingsRepository instance.
func NewPlatformSettingsRepository(db *sql.DB) PlatformSettingsRepository {
	return &mysqlPlatformSettingsRepository{db: db}
}

func (r *mysqlPlatformSettingsRepository) GetAll(ctx context.Context) (map[string]string, error) {
	query := "SELECT `key`, `value` FROM platform_settings"
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query platform_settings: %w", err)
	}
	defer rows.Close()

	result := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, fmt.Errorf("failed to scan platform_settings row: %w", err)
		}
		result[k] = v
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error during platform_settings iteration: %w", err)
	}

	return result, nil
}

func (r *mysqlPlatformSettingsRepository) SetMany(ctx context.Context, settings map[string]string) error {
	if len(settings) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin tx for platform_settings: %w", err)
	}
	defer tx.Rollback()

	now := time.Now()
	query := "INSERT INTO platform_settings (`key`, `value`, `updated_at`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = VALUES(`updated_at`)"
	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to prepare platform_settings upsert: %w", err)
	}
	defer stmt.Close()

	for k, v := range settings {
		cleanKey := strings.TrimSpace(k)
		if cleanKey == "" {
			continue
		}
		if _, err := stmt.ExecContext(ctx, cleanKey, strings.TrimSpace(v), now); err != nil {
			return fmt.Errorf("failed to upsert platform_setting %s: %w", cleanKey, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit platform_settings: %w", err)
	}

	return nil
}
