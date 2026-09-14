package service

import (
	"context"
	"errors"
	"strings"

	"klikumroh/internal/repository"
)

var (
	// ErrInvalidPackageStatus is returned when package status is not draft, published, or archived.
	ErrInvalidPackageStatus = errors.New("status paket harus 'draft', 'published', atau 'archived'")
	// ErrPackageNameRequired is returned when package name is empty.
	ErrPackageNameRequired = errors.New("nama paket wajib diisi")
	// ErrPackageInUse is returned when package cannot be deleted because it is referenced by existing prospects.
	ErrPackageInUse = errors.New("Paket tidak bisa dihapus karena masih memiliki data prospek terkait. Arsipkan paket ini alih-alih menghapusnya.")
)

var validPackageStatuses = map[string]bool{
	"draft":     true,
	"published": true,
	"archived":  true,
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
	pkg.Name = strings.TrimSpace(pkg.Name)
	if pkg.Name == "" {
		return ErrPackageNameRequired
	}

	if pkg.Status == "" {
		pkg.Status = "draft"
	}
	if !validPackageStatuses[pkg.Status] {
		return ErrInvalidPackageStatus
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
	return s.packageRepo.List(ctx, tenantID, statusFilter)
}

func (s *packageService) ListPublished(ctx context.Context, tenantID uint64) ([]repository.Package, error) {
	published := "published"
	packages, err := s.packageRepo.List(ctx, tenantID, &published)
	if err != nil {
		return nil, err
	}
	
	for i := range packages {
		photos, err := s.packagePhotoRepo.ListByPackage(ctx, tenantID, packages[i].ID)
		if err == nil && len(photos) > 0 {
			packages[i].Photos = []repository.PackagePhoto{photos[0]}
		}
	}
	return packages, nil
}

func (s *packageService) Update(ctx context.Context, tenantID uint64, pkg *repository.Package) error {
	pkg.Name = strings.TrimSpace(pkg.Name)
	if pkg.Name == "" {
		return ErrPackageNameRequired
	}

	if !validPackageStatuses[pkg.Status] {
		return ErrInvalidPackageStatus
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
