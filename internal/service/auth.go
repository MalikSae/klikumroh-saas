package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
)

// ErrInvalidCredentials is returned when login authentication fails.
// Intentionally generic to prevent email enumeration and brute-force attacks.
var ErrInvalidCredentials = errors.New("invalid credentials")

// AdminUserInfo holds safe, non-sensitive admin user details returned to client.
type AdminUserInfo struct {
	ID         uint64 `json:"id"`
	TenantID   uint64 `json:"tenant_id"`
	TenantName string `json:"tenant_name,omitempty"`
	Email      string `json:"email"`
	Name       string `json:"name"`
	Status     string `json:"status"`
}

// LoginResult contains authentication token and user session data.
type LoginResult struct {
	Token        string        `json:"token"`
	ExpiresAt    time.Time     `json:"expires_at"`
	TenantStatus string        `json:"tenant_status"`
	PublicToken  string        `json:"public_token,omitempty"`
	User         AdminUserInfo `json:"user"`
}

// AuthService defines the authentication business logic.
type AuthService interface {
	Login(ctx context.Context, email, password string) (*LoginResult, error)
	Logout(ctx context.Context, token string) error
	SetPaymentVerificationRepo(pvRepo repository.PaymentVerificationRepository)
}

type authService struct {
	adminUserRepo repository.AdminUserRepository
	sessionRepo   repository.SessionRepository
	tenantRepo    repository.TenantRepository
	pvRepo        repository.PaymentVerificationRepository
}

// NewAuthService creates a new AuthService instance.
func NewAuthService(
	adminUserRepo repository.AdminUserRepository,
	sessionRepo repository.SessionRepository,
	tenantRepos ...repository.TenantRepository,
) AuthService {
	var tr repository.TenantRepository
	if len(tenantRepos) > 0 {
		tr = tenantRepos[0]
	}
	return &authService{
		adminUserRepo: adminUserRepo,
		sessionRepo:   sessionRepo,
		tenantRepo:    tr,
	}
}

func (s *authService) SetPaymentVerificationRepo(pvRepo repository.PaymentVerificationRepository) {
	s.pvRepo = pvRepo
}

func (s *authService) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	// Find user by email across all tenants (login resolution)
	user, err := s.adminUserRepo.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	// Reject inactive user accounts
	if user.Status != "active" {
		return nil, ErrInvalidCredentials
	}

	// Verify bcrypt password hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	// Generate 32-byte secure random session token encoded in hex (64 chars)
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(tokenBytes)

	expiresAt := time.Now().Add(7 * 24 * time.Hour) // 7 days expiration for MVP
	session := &repository.Session{
		Token:       token,
		AdminUserID: user.ID,
		TenantID:    user.TenantID,
		ExpiresAt:   expiresAt,
	}

	if err := s.sessionRepo.Create(ctx, user.TenantID, session); err != nil {
		return nil, err
	}

	tenantName := ""
	tenantStatus := "active"
	if s.tenantRepo != nil {
		if t, err := s.tenantRepo.GetByID(ctx, user.TenantID); err == nil && t != nil {
			tenantName = t.Name
			if t.Status != "" {
				tenantStatus = t.Status
			}
		}
	}

	var publicToken string
	if tenantStatus == "pending" && s.pvRepo != nil {
		verifications, err := s.pvRepo.ListByTenant(ctx, user.TenantID)
		if err == nil && len(verifications) > 0 {
			publicToken = verifications[0].PublicToken
		}
	}

	return &LoginResult{
		Token:        token,
		ExpiresAt:    expiresAt,
		TenantStatus: tenantStatus,
		PublicToken:  publicToken,
		User: AdminUserInfo{
			ID:         user.ID,
			TenantID:   user.TenantID,
			TenantName: tenantName,
			Email:      user.Email,
			Name:       user.Name,
			Status:     user.Status,
		},
	}, nil
}

func (s *authService) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	err := s.sessionRepo.DeleteByToken(ctx, token)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return err
	}
	return nil
}
