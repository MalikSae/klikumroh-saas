package service

import (
	"context"
	"errors"
	"regexp"

	"klikumroh/internal/repository"
)

// ErrInvalidPlaybookItem: the item id is not one the dashboard makes (block index, colon, short hash).
var ErrInvalidPlaybookItem = errors.New("butir daftar periksa tidak valid")

// playbookItemPattern matches ids like "3:k2j9x": the block index in the page, then a base-36 hash of the text.
var playbookItemPattern = regexp.MustCompile(`^[0-9]{1,3}:[a-z0-9]{1,12}$`)

// ValidPlaybookItemID reports whether id has the shape the dashboard makes for a checklist item.
func ValidPlaybookItemID(id string) bool { return playbookItemPattern.MatchString(id) }

// PlaybookCheckService keeps the checked items of the recruitment guide per travel.
type PlaybookCheckService interface {
	List(ctx context.Context, tenantID uint64, pageSlug string) ([]string, error)
	Set(ctx context.Context, tenantID uint64, pageSlug, itemID string, checked bool, adminUserID *uint64) error
}

type playbookCheckService struct {
	repo repository.PlaybookCheckRepository
}

func NewPlaybookCheckService(repo repository.PlaybookCheckRepository) PlaybookCheckService {
	return &playbookCheckService{repo: repo}
}

func (s *playbookCheckService) List(ctx context.Context, tenantID uint64, pageSlug string) ([]string, error) {
	return s.repo.List(ctx, tenantID, pageSlug)
}

func (s *playbookCheckService) Set(ctx context.Context, tenantID uint64, pageSlug, itemID string, checked bool, adminUserID *uint64) error {
	if !ValidPlaybookItemID(itemID) {
		return ErrInvalidPlaybookItem
	}
	return s.repo.Set(ctx, tenantID, pageSlug, itemID, checked, adminUserID)
}
