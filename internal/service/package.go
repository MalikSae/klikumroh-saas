package service

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"klikumroh/internal/repository"
)

var (
	// ErrInvalidPackageStatus is returned when package status is not draft, published, or archived.
	ErrInvalidPackageStatus = errors.New("status paket harus 'draft', 'published', atau 'archived'")
	// ErrPackageNameRequired is returned when package name is empty.
	ErrPackageNameRequired = errors.New("nama paket wajib diisi")
	// ErrPackageInUse is returned when a package cannot be deleted because prospects or agents' commission
	// history reference it (it can be archived instead).
	ErrPackageInUse = errors.New("Paket tidak bisa dihapus karena sudah dipakai prospek atau tercatat di riwayat komisi agen. Arsipkan paket ini alih-alih menghapusnya.")
	// ErrPackageNameTooLong is returned for a name over 255 characters.
	ErrPackageNameTooLong = errors.New("nama paket maksimal 255 karakter")
	// ErrPackageNegativeValue is returned for a negative price, commission or quota.
	ErrPackageNegativeValue = errors.New("harga, komisi agen, dan kuota tidak boleh bernilai negatif")
	// ErrPackageCommissionAbovePrice is returned when the agent commission exceeds the package price.
	ErrPackageCommissionAbovePrice = errors.New("komisi agen per jamaah tidak boleh melebihi harga paket")
	// ErrPackagePublishNeedsPrice is returned when publishing a package without a price.
	ErrPackagePublishNeedsPrice = errors.New("isi harga paket sebelum menayangkannya di website")
)

var validPackageStatuses = map[string]bool{
	"draft":     true,
	"published": true,
	"archived":  true,
}

// IsPackageInputError reports whether err is a package validation error to show as 400.
func IsPackageInputError(err error) bool {
	for _, target := range []error{ErrPackageNameRequired, ErrInvalidPackageStatus, ErrPackageNameTooLong,
		ErrPackageNegativeValue, ErrPackageCommissionAbovePrice, ErrPackagePublishNeedsPrice} {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}

// validatePackage checks the values a travel enters. The dashboard form only lets digits through,
// but the API must not rely on that.
func validatePackage(pkg *repository.Package) error {
	pkg.Name = strings.TrimSpace(pkg.Name)
	if pkg.Name == "" {
		return ErrPackageNameRequired
	}
	if utf8.RuneCountInString(pkg.Name) > 255 {
		return ErrPackageNameTooLong
	}
	if (pkg.Price != nil && *pkg.Price < 0) || (pkg.CommissionAmount != nil && *pkg.CommissionAmount < 0) || (pkg.Quota != nil && *pkg.Quota < 0) {
		return ErrPackageNegativeValue
	}
	if pkg.Price != nil && pkg.CommissionAmount != nil && *pkg.CommissionAmount > *pkg.Price {
		return ErrPackageCommissionAbovePrice
	}
	if pkg.Status == "published" && (pkg.Price == nil || *pkg.Price <= 0) {
		return ErrPackagePublishNeedsPrice
	}
	return nil
}

// PackageDeparted reports whether the package's departure date (a calendar date in WIB) is before
// today: such a package is no longer offered on the public site or linkable from the interest form.
func PackageDeparted(pkg *repository.Package, now time.Time) bool {
	if pkg == nil || pkg.DepartureDate == nil {
		return false
	}
	d := pkg.DepartureDate.In(jakartaLocation)
	t := now.In(jakartaLocation)
	depDay := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, jakartaLocation)
	today := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, jakartaLocation)
	return depDay.Before(today)
}

// PackageService defines the business logic operations for Packages.
type PackageService interface {
	Create(ctx context.Context, tenantID uint64, pkg *repository.Package) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Package, error)
	List(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.Package, error)
	ListPublished(ctx context.Context, tenantID uint64) ([]repository.Package, error)
	Update(ctx context.Context, tenantID uint64, pkg *repository.Package) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error
}

type packageService struct {
	packageRepo      repository.PackageRepository
	packagePhotoRepo repository.PackagePhotoRepository
}

// NewPackageService creates a new PackageService.
func NewPackageService(packageRepo repository.PackageRepository, packagePhotoRepo repository.PackagePhotoRepository) PackageService {
	return &packageService{packageRepo: packageRepo, packagePhotoRepo: packagePhotoRepo}
}

func (s *packageService) Create(ctx context.Context, tenantID uint64, pkg *repository.Package) error {
	if pkg.Status == "" {
		pkg.Status = "draft"
	}
	if !validPackageStatuses[pkg.Status] {
		return ErrInvalidPackageStatus
	}
	if err := validatePackage(pkg); err != nil {
		return err
	}
	return s.packageRepo.Create(ctx, tenantID, pkg)
}

func (s *packageService) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Package, error) {
	pkg, err := s.packageRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	photos, err := s.packagePhotoRepo.ListByPackage(ctx, tenantID, id)
	if err == nil {
		pkg.Photos = photos
	}

	return pkg, nil
}

func (s *packageService) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.Package, error) {
	if statusFilter != nil && *statusFilter != "" {
		if !validPackageStatuses[*statusFilter] {
			return nil, ErrInvalidPackageStatus
		}
	}
	packages, err := s.packageRepo.List(ctx, tenantID, statusFilter)
	if err != nil {
		return nil, err
	}
	s.attachCover(ctx, tenantID, packages)
	return packages, nil
}

// attachCover sets Photos to the package's first photo (sort order), for list thumbnails. Photos are read
// with the same tenant_id, so a list never shows another tenant's image.
func (s *packageService) attachCover(ctx context.Context, tenantID uint64, packages []repository.Package) {
	for i := range packages {
		photos, err := s.packagePhotoRepo.ListByPackage(ctx, tenantID, packages[i].ID)
		if err == nil && len(photos) > 0 {
			packages[i].Photos = []repository.PackagePhoto{photos[0]}
		}
	}
}

// ListPublished returns what visitors may book: published packages that have not departed yet, nearest
// departure first (packages without a date last, newest first among them).
func (s *packageService) ListPublished(ctx context.Context, tenantID uint64) ([]repository.Package, error) {
	published := "published"
	all, err := s.packageRepo.List(ctx, tenantID, &published)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	packages := make([]repository.Package, 0, len(all))
	for i := range all {
		if !PackageDeparted(&all[i], now) {
			packages = append(packages, all[i])
		}
	}
	sort.SliceStable(packages, func(i, j int) bool {
		a, b := packages[i].DepartureDate, packages[j].DepartureDate
		if a == nil || b == nil {
			return a != nil && b == nil
		}
		return a.Before(*b)
	})

	s.attachCover(ctx, tenantID, packages)
	return packages, nil
}

func (s *packageService) Update(ctx context.Context, tenantID uint64, pkg *repository.Package) error {
	if !validPackageStatuses[pkg.Status] {
		return ErrInvalidPackageStatus
	}
	if err := validatePackage(pkg); err != nil {
		return err
	}
	return s.packageRepo.Update(ctx, tenantID, pkg)
}

func (s *packageService) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	err := s.packageRepo.Delete(ctx, tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrForeignKeyViolation) {
			return ErrPackageInUse
		}
		return err
	}
	return nil
}
