package repository

import (
	"context"
	"database/sql"
	"time"
)

type PackagePhoto struct {
	ID        uint64    `json:"id"`
	TenantID  uint64    `json:"tenant_id"`
	PackageID uint64    `json:"package_id"`
	FilePath  string    `json:"file_path"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

type PackagePhotoRepository interface {
	Create(ctx context.Context, tenantID uint64, photo *PackagePhoto) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*PackagePhoto, error)
	ListByPackage(ctx context.Context, tenantID uint64, packageID uint64) ([]PackagePhoto, error)
	Delete(ctx context.Context, tenantID uint64, photoID uint64) error
	UpdateSortOrder(ctx context.Context, tenantID uint64, photoID uint64, newSortOrder int) error
}

type mysqlPackagePhotoRepository struct {
	db *sql.DB
}

func NewPackagePhotoRepository(db *sql.DB) PackagePhotoRepository {
	return &mysqlPackagePhotoRepository{db: db}
}

func (r *mysqlPackagePhotoRepository) Create(ctx context.Context, tenantID uint64, photo *PackagePhoto) error {
	query := `
		INSERT INTO package_photos (tenant_id, package_id, file_path, sort_order)
		VALUES (?, ?, ?, ?)
	`
	photo.TenantID = tenantID

	res, err := r.db.ExecContext(ctx, query, tenantID, photo.PackageID, photo.FilePath, photo.SortOrder)
	if err != nil {
		return err
	}
	
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	photo.ID = uint64(id)
	return nil
}

func (r *mysqlPackagePhotoRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*PackagePhoto, error) {
	query := `
		SELECT id, tenant_id, package_id, file_path, sort_order, created_at
		FROM package_photos
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	var p PackagePhoto
	if err := row.Scan(&p.ID, &p.TenantID, &p.PackageID, &p.FilePath, &p.SortOrder, &p.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *mysqlPackagePhotoRepository) ListByPackage(ctx context.Context, tenantID uint64, packageID uint64) ([]PackagePhoto, error) {
	query := `
		SELECT id, tenant_id, package_id, file_path, sort_order, created_at
		FROM package_photos
		WHERE tenant_id = ? AND package_id = ?
		ORDER BY sort_order ASC, id ASC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, packageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var photos []PackagePhoto
	for rows.Next() {
		var p PackagePhoto
		if err := rows.Scan(&p.ID, &p.TenantID, &p.PackageID, &p.FilePath, &p.SortOrder, &p.CreatedAt); err != nil {
			return nil, err
		}
		photos = append(photos, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return photos, nil
}

func (r *mysqlPackagePhotoRepository) Delete(ctx context.Context, tenantID uint64, photoID uint64) error {
	query := `DELETE FROM package_photos WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, photoID, tenantID)
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

func (r *mysqlPackagePhotoRepository) UpdateSortOrder(ctx context.Context, tenantID uint64, photoID uint64, newSortOrder int) error {
	query := `UPDATE package_photos SET sort_order = ? WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, newSortOrder, photoID, tenantID)
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
