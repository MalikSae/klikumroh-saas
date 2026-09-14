package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
)

// Package represents the data model for the packages table.
type Package struct {
	ID            uint64     `json:"id"`
	TenantID      uint64     `json:"tenant_id"`
	Name          string     `json:"name"`
	Description   *string    `json:"description"`
	Price         *float64   `json:"price"`
	DepartureDate *time.Time `json:"departure_date"`
	Quota         *int       `json:"quota"`
	Status             string     `json:"status"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	Itinerary          *string    `json:"itinerary"`
	FacilitiesIncluded *string    `json:"facilities_included"`
	FacilitiesExcluded *string    `json:"facilities_excluded"`
	HotelInfo          *string    `json:"hotel_info"`
	FlightInfo         *string        `json:"flight_info"`
	TermsConditions    *string        `json:"terms_conditions"`
	CommissionAmount   *float64       `json:"commission_amount"`
	Photos             []PackagePhoto `json:"photos,omitempty"`
}

// PackageRepository defines access methods for package records.
// All methods require tenantID as the first scoping parameter.
type PackageRepository interface {
	Create(ctx context.Context, tenantID uint64, pkg *Package) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*Package, error)
	List(ctx context.Context, tenantID uint64, statusFilter *string) ([]Package, error)
	Update(ctx context.Context, tenantID uint64, pkg *Package) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error
	CountByTenant(ctx context.Context, tenantID uint64) (int, error)
}

type mysqlPackageRepository struct {
	db *sql.DB
}

// NewPackageRepository creates a new PackageRepository instance.
func NewPackageRepository(db *sql.DB) PackageRepository {
	return &mysqlPackageRepository{db: db}
}

func (r *mysqlPackageRepository) Create(ctx context.Context, tenantID uint64, pkg *Package) error {
	query := `
		INSERT INTO packages (
			tenant_id, name, description, price, departure_date, quota, status,
			itinerary, facilities_included, facilities_excluded, hotel_info, flight_info, terms_conditions,
			commission_amount
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	pkg.TenantID = tenantID
	if pkg.Status == "" {
		pkg.Status = "draft"
	}

	result, err := r.db.ExecContext(ctx, query,
		tenantID,
		pkg.Name,
		pkg.Description,
		pkg.Price,
		pkg.DepartureDate,
		pkg.Quota,
		pkg.Status,
		pkg.Itinerary,
		pkg.FacilitiesIncluded,
		pkg.FacilitiesExcluded,
		pkg.HotelInfo,
		pkg.FlightInfo,
		pkg.TermsConditions,
		pkg.CommissionAmount,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	pkg.ID = uint64(id)
	return nil
}

func (r *mysqlPackageRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*Package, error) {
	query := `
		SELECT id, tenant_id, name, description, price, departure_date, quota, status, created_at, updated_at,
			itinerary, facilities_included, facilities_excluded, hotel_info, flight_info, terms_conditions,
			commission_amount
		FROM packages
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanPackage(row)
}

func (r *mysqlPackageRepository) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]Package, error) {
	var query string
	var args []interface{}

	if statusFilter != nil && *statusFilter != "" {
		query = `
			SELECT id, tenant_id, name, description, price, departure_date, quota, status, created_at, updated_at,
				itinerary, facilities_included, facilities_excluded, hotel_info, flight_info, terms_conditions,
				commission_amount
			FROM packages
			WHERE tenant_id = ? AND status = ?
			ORDER BY created_at DESC
		`
		args = append(args, tenantID, *statusFilter)
	} else {
		query = `
			SELECT id, tenant_id, name, description, price, departure_date, quota, status, created_at, updated_at,
				itinerary, facilities_included, facilities_excluded, hotel_info, flight_info, terms_conditions,
				commission_amount
			FROM packages
			WHERE tenant_id = ?
			ORDER BY created_at DESC
		`
		args = append(args, tenantID)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var packages []Package
	for rows.Next() {
		var p Package
		var description sql.NullString
		var price sql.NullFloat64
		var departureDate sql.NullTime
		var quota sql.NullInt32
		var itinerary, facilitiesIncluded, facilitiesExcluded, hotelInfo, flightInfo, termsConditions sql.NullString
		var commissionAmount sql.NullFloat64

		if err := rows.Scan(
			&p.ID,
			&p.TenantID,
			&p.Name,
			&description,
			&price,
			&departureDate,
			&quota,
			&p.Status,
			&p.CreatedAt,
			&p.UpdatedAt,
			&itinerary,
			&facilitiesIncluded,
			&facilitiesExcluded,
			&hotelInfo,
			&flightInfo,
			&termsConditions,
			&commissionAmount,
		); err != nil {
			return nil, err
		}

		if description.Valid {
			p.Description = &description.String
		}
		if price.Valid {
			p.Price = &price.Float64
		}
		if departureDate.Valid {
			p.DepartureDate = &departureDate.Time
		}
		if quota.Valid {
			q := int(quota.Int32)
			p.Quota = &q
		}
		if itinerary.Valid { p.Itinerary = &itinerary.String }
		if facilitiesIncluded.Valid { p.FacilitiesIncluded = &facilitiesIncluded.String }
		if facilitiesExcluded.Valid { p.FacilitiesExcluded = &facilitiesExcluded.String }
		if hotelInfo.Valid { p.HotelInfo = &hotelInfo.String }
		if flightInfo.Valid { p.FlightInfo = &flightInfo.String }
		if termsConditions.Valid { p.TermsConditions = &termsConditions.String }
		if commissionAmount.Valid { p.CommissionAmount = &commissionAmount.Float64 }
		packages = append(packages, p)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return packages, nil
}

func (r *mysqlPackageRepository) Update(ctx context.Context, tenantID uint64, pkg *Package) error {
	query := `
		UPDATE packages
		SET name = ?, description = ?, price = ?, departure_date = ?, quota = ?, status = ?,
			itinerary = ?, facilities_included = ?, facilities_excluded = ?, hotel_info = ?, flight_info = ?, terms_conditions = ?,
			commission_amount = ?
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		pkg.Name,
		pkg.Description,
		pkg.Price,
		pkg.DepartureDate,
		pkg.Quota,
		pkg.Status,
		pkg.Itinerary,
		pkg.FacilitiesIncluded,
		pkg.FacilitiesExcluded,
		pkg.HotelInfo,
		pkg.FlightInfo,
		pkg.TermsConditions,
		pkg.CommissionAmount,
		pkg.ID,
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
		var exists bool
		err := r.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM packages WHERE id = ? AND tenant_id = ?)", pkg.ID, tenantID).Scan(&exists)
		if err != nil {
			return err
		}
		if !exists {
			return ErrNotFound
		}
		return nil
	}
	return nil
}

func (r *mysqlPackageRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM packages WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, id, tenantID)
	if err != nil {
		var mysqlErr *mysql.MySQLError
		if errors.As(err, &mysqlErr) && mysqlErr.Number == 1451 {
			return ErrForeignKeyViolation
		}
		if strings.Contains(err.Error(), "1451") || strings.Contains(err.Error(), "foreign key constraint fails") {
			return ErrForeignKeyViolation
		}
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

func (r *mysqlPackageRepository) scanPackage(row *sql.Row) (*Package, error) {
	var p Package
	var description sql.NullString
	var price sql.NullFloat64
	var departureDate sql.NullTime
	var quota sql.NullInt32
	var commissionAmount sql.NullFloat64

	var itinerary, facilitiesIncluded, facilitiesExcluded, hotelInfo, flightInfo, termsConditions sql.NullString

	err := row.Scan(
		&p.ID,
		&p.TenantID,
		&p.Name,
		&description,
		&price,
		&departureDate,
		&quota,
		&p.Status,
		&p.CreatedAt,
		&p.UpdatedAt,
		&itinerary,
		&facilitiesIncluded,
		&facilitiesExcluded,
		&hotelInfo,
		&flightInfo,
		&termsConditions,
		&commissionAmount,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if description.Valid {
		p.Description = &description.String
	}
	if price.Valid {
		p.Price = &price.Float64
	}
	if departureDate.Valid {
		p.DepartureDate = &departureDate.Time
	}
	if quota.Valid {
		q := int(quota.Int32)
		p.Quota = &q
	}
	if itinerary.Valid { p.Itinerary = &itinerary.String }
	if facilitiesIncluded.Valid { p.FacilitiesIncluded = &facilitiesIncluded.String }
	if facilitiesExcluded.Valid { p.FacilitiesExcluded = &facilitiesExcluded.String }
	if hotelInfo.Valid { p.HotelInfo = &hotelInfo.String }
	if flightInfo.Valid { p.FlightInfo = &flightInfo.String }
	if termsConditions.Valid { p.TermsConditions = &termsConditions.String }
	if commissionAmount.Valid { p.CommissionAmount = &commissionAmount.Float64 }

	return &p, nil
}

func (r *mysqlPackageRepository) CountByTenant(ctx context.Context, tenantID uint64) (int, error) {
	query := `SELECT COUNT(*) FROM packages WHERE tenant_id = ?`
	var count int
	if err := r.db.QueryRowContext(ctx, query, tenantID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}
