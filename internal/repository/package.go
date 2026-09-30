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
	// SeatsTaken counts the jamaah of this package's Closing (DP paid) prospects, so the remaining seats
	// shown to visitors are real (quota - seats_taken). A cancelled closing no longer counts.
	SeatsTaken         int            `json:"seats_taken"`
	Status             string         `json:"status"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
	Itinerary          *string        `json:"itinerary"`
	FacilitiesIncluded *string        `json:"facilities_included"`
	FacilitiesExcluded *string        `json:"facilities_excluded"`
	HotelInfo          *string        `json:"hotel_info"`
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

// packageSelect is shared by every read so the column order and the seats count stay in one place.
const packageSelect = `
	SELECT p.id, p.tenant_id, p.name, p.description, p.price, p.departure_date, p.quota, p.status,
		p.created_at, p.updated_at, p.itinerary, p.facilities_included, p.facilities_excluded,
		p.hotel_info, p.flight_info, p.terms_conditions, p.commission_amount,
		(SELECT COALESCE(SUM(COALESCE(pr.jumlah_jamaah, 1)), 0) FROM prospects pr
			WHERE pr.tenant_id = p.tenant_id AND pr.package_id = p.id AND pr.status = 'closing') AS seats_taken
	FROM packages p
`

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
	row := r.db.QueryRowContext(ctx, packageSelect+` WHERE p.id = ? AND p.tenant_id = ?`, id, tenantID)
	p, err := scanPackageRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return p, nil
}

func (r *mysqlPackageRepository) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]Package, error) {
	query := packageSelect + ` WHERE p.tenant_id = ?`
	args := []interface{}{tenantID}
	if statusFilter != nil && *statusFilter != "" {
		query += ` AND p.status = ?`
		args = append(args, *statusFilter)
	}
	query += ` ORDER BY p.created_at DESC`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var packages []Package
	for rows.Next() {
		p, err := scanPackageRow(rows)
		if err != nil {
			return nil, err
		}
		packages = append(packages, *p)
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

// Delete removes a package. It fails with ErrForeignKeyViolation while prospects or commission history
// (RESTRICT, migration 053) still reference it: such a package can only be archived.
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

func scanPackageRow(row rowScanner) (*Package, error) {
	var p Package
	var description, itinerary, facilitiesIncluded, facilitiesExcluded, hotelInfo, flightInfo, termsConditions sql.NullString
	var price, commissionAmount sql.NullFloat64
	var departureDate sql.NullTime
	var quota sql.NullInt32

	if err := row.Scan(
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
		&p.SeatsTaken,
	); err != nil {
		return nil, err
	}

	p.Description = nullStringPtr(description)
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
	p.Itinerary = nullStringPtr(itinerary)
	p.FacilitiesIncluded = nullStringPtr(facilitiesIncluded)
	p.FacilitiesExcluded = nullStringPtr(facilitiesExcluded)
	p.HotelInfo = nullStringPtr(hotelInfo)
	p.FlightInfo = nullStringPtr(flightInfo)
	p.TermsConditions = nullStringPtr(termsConditions)
	if commissionAmount.Valid {
		p.CommissionAmount = &commissionAmount.Float64
	}
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
