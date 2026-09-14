package service

import (
	"context"
	"log"

	"klikumroh/internal/repository"
)

// NotificationListResponse encapsulates notifications and unread counter.
type NotificationListResponse struct {
	Notifications []repository.Notification `json:"notifications"`
	UnreadCount   int                       `json:"unread_count"`
}

// NotificationService defines core notification management and delivery.
type NotificationService interface {
	CreateNotification(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64, notifType, title, body, linkURL string) (*repository.Notification, error)
	ListNotifications(ctx context.Context, recipientType string, recipientID uint64, limit int) (*NotificationListResponse, error)
	MarkAsRead(ctx context.Context, recipientType string, recipientID uint64, notifID uint64) error
	MarkAllAsRead(ctx context.Context, recipientType string, recipientID uint64) error
}

type notificationService struct {
	notifRepo repository.NotificationRepository
}

// NewNotificationService creates a new generic NotificationService.
func NewNotificationService(notifRepo repository.NotificationRepository) NotificationService {
	return &notificationService{
		notifRepo: notifRepo,
	}
}

func (s *notificationService) CreateNotification(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64, notifType, title, body, linkURL string) (*repository.Notification, error) {
	var link *string
	if linkURL != "" {
		link = &linkURL
	}

	notif := &repository.Notification{
		TenantID:      tenantID,
		RecipientType: recipientType,
		RecipientID:   recipientID,
		Type:          notifType,
		Title:         title,
		Body:          body,
		LinkURL:       link,
	}

	if err := s.notifRepo.Create(ctx, notif); err != nil {
		log.Printf("[NotificationService] Failed to create notification for %s (id=%d): %v", recipientType, recipientID, err)
		return nil, err
	}

	return notif, nil
}

func (s *notificationService) ListNotifications(ctx context.Context, recipientType string, recipientID uint64, limit int) (*NotificationListResponse, error) {
	items, err := s.notifRepo.ListByRecipient(ctx, recipientType, recipientID, limit)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []repository.Notification{}
	}

	unread, err := s.notifRepo.CountUnread(ctx, recipientType, recipientID)
	if err != nil {
		return nil, err
	}

	return &NotificationListResponse{
		Notifications: items,
		UnreadCount:   unread,
	}, nil
}

func (s *notificationService) MarkAsRead(ctx context.Context, recipientType string, recipientID uint64, notifID uint64) error {
	return s.notifRepo.MarkAsRead(ctx, recipientType, recipientID, notifID)
}

func (s *notificationService) MarkAllAsRead(ctx context.Context, recipientType string, recipientID uint64) error {
	return s.notifRepo.MarkAllAsRead(ctx, recipientType, recipientID)
}
