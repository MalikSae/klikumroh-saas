package service

import (
	"context"
	"errors"
	"klikumroh/internal/repository"
)

type PackagePhotoService interface {
	Create(ctx context.Context, tenantID uint64, photo *repository.PackagePhoto) error
	ListByPackage(ctx context.Context, tenantID uint64, packageID uint64) ([]repository.PackagePhoto, error)
	Delete(ctx context.Context, tenantID uint64, photoID uint64) (*repository.PackagePhoto, error)
	Move(ctx context.Context, tenantID uint64, photoID uint64, direction string) error
}

type packagePhotoService struct {
	photoRepo   repository.PackagePhotoRepository
	packageRepo repository.PackageRepository
}

func NewPackagePhotoService(photoRepo repository.PackagePhotoRepository, packageRepo repository.PackageRepository) PackagePhotoService {
	return &packagePhotoService{photoRepo: photoRepo, packageRepo: packageRepo}
}

func (s *packagePhotoService) Create(ctx context.Context, tenantID uint64, photo *repository.PackagePhoto) error {
	// Verify package belongs to tenant
	_, err := s.packageRepo.GetByID(ctx, tenantID, photo.PackageID)
	if err != nil {
		return err
	}
	
	// Get max sort_order
	photos, err := s.photoRepo.ListByPackage(ctx, tenantID, photo.PackageID)
	if err != nil {
		return err
	}
	
	maxSort := 0
	for _, p := range photos {
		if p.SortOrder > maxSort {
			maxSort = p.SortOrder
		}
	}
	photo.SortOrder = maxSort + 1

	return s.photoRepo.Create(ctx, tenantID, photo)
}

func (s *packagePhotoService) ListByPackage(ctx context.Context, tenantID uint64, packageID uint64) ([]repository.PackagePhoto, error) {
	// Verify package belongs to tenant
	_, err := s.packageRepo.GetByID(ctx, tenantID, packageID)
	if err != nil {
		return nil, err
	}
	return s.photoRepo.ListByPackage(ctx, tenantID, packageID)
}

func (s *packagePhotoService) Delete(ctx context.Context, tenantID uint64, photoID uint64) (*repository.PackagePhoto, error) {
	photo, err := s.photoRepo.GetByID(ctx, tenantID, photoID)
	if err != nil {
		return nil, err
	}
	
	err = s.photoRepo.Delete(ctx, tenantID, photoID)
	if err != nil {
		return nil, err
	}
	
	return photo, nil
}

func (s *packagePhotoService) Move(ctx context.Context, tenantID uint64, photoID uint64, direction string) error {
	photo, err := s.photoRepo.GetByID(ctx, tenantID, photoID)
	if err != nil {
		return err
	}

	photos, err := s.photoRepo.ListByPackage(ctx, tenantID, photo.PackageID)
	if err != nil {
		return err
	}

	if len(photos) < 2 {
		return nil // Nothing to move
	}

	// Find the current index
	idx := -1
	for i, p := range photos {
		if p.ID == photo.ID {
			idx = i
			break
		}
	}

	if idx == -1 {
		return errors.New("photo not found in list")
	}

	var swapWith *repository.PackagePhoto

	if direction == "up" {
		if idx > 0 {
			swapWith = &photos[idx-1]
		}
	} else if direction == "down" {
		if idx < len(photos)-1 {
			swapWith = &photos[idx+1]
		}
	} else {
		return errors.New("invalid direction")
	}

	if swapWith != nil {
		// Swap sort_order
		tempSort := photo.SortOrder
		
		err = s.photoRepo.UpdateSortOrder(ctx, tenantID, photo.ID, swapWith.SortOrder)
		if err != nil {
			return err
		}
		
		err = s.photoRepo.UpdateSortOrder(ctx, tenantID, swapWith.ID, tempSort)
		if err != nil {
			return err
		}
	}

	return nil
}
