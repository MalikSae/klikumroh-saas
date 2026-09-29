package service

import (
	"context"

	"klikumroh/internal/repository"
)

// maxAccessLogsShown caps how many recent audit records the travel dashboard loads at once.
const maxAccessLogsShown = 500

// AccessLogService exposes the staff access audit trail to the travel that owns the data.
type AccessLogService interface {
	ListForTenant(ctx context.Context, tenantID uint64) ([]repository.AccessLog, error)
}

type accessLogService struct {
	accessLogRepo repository.AccessLogRepository
}

// NewAccessLogService creates a new AccessLogService instance.
func NewAccessLogService(accessLogRepo repository.AccessLogRepository) AccessLogService {
	return &accessLogService{accessLogRepo: accessLogRepo}
}

func (s *accessLogService) ListForTenant(ctx context.Context, tenantID uint64) ([]repository.AccessLog, error) {
	return s.accessLogRepo.ListByTenant(ctx, tenantID, maxAccessLogsShown)
}
