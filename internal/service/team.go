package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
)

var (
	ErrEmailAlreadyExists             = errors.New("email sudah terdaftar di sistem")
	ErrPasswordTooShort               = errors.New("password minimal 8 karakter")
	ErrCannotDeactivateSelf           = errors.New("tidak dapat menonaktifkan akun sendiri")
	ErrCannotDeactivateLastActiveAdmin = errors.New("tidak dapat menonaktifkan satu-satunya admin aktif")
	ErrInvalidCurrentPassword         = errors.New("password saat ini salah")
	ErrInvalidAction                  = errors.New("action harus 'activate' atau 'deactivate'")
	ErrNameRequired                   = errors.New("nama harus diisi")
	ErrEmailRequired                  = errors.New("email harus diisi")
)

// TeamMemberResponse represents safe admin user details for team management.
type TeamMemberResponse struct {
	ID        uint64    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// MyProfileResponse represents the user's own profile.
type MyProfileResponse struct {
	ID        uint64    `json:"id"`
	TenantID  uint64    `json:"tenant_id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TeamService defines operations for team members and user profile management.
type TeamService interface {
	ListTeam(ctx context.Context, tenantID uint64) ([]TeamMemberResponse, error)
	AddTeamMember(ctx context.Context, tenantID uint64, name, email, password string) (*TeamMemberResponse, error)
	ToggleStatus(ctx context.Context, tenantID uint64, currentAdminUserID uint64, targetUserID uint64, action string) (*TeamMemberResponse, error)
	GetMyProfile(ctx context.Context, tenantID uint64, adminUserID uint64) (*MyProfileResponse, error)
	UpdateMyProfile(ctx context.Context, tenantID uint64, adminUserID uint64, name, email *string) (*MyProfileResponse, error)
	UpdateMyPassword(ctx context.Context, tenantID uint64, adminUserID uint64, currentPassword, newPassword string) error
}

type teamService struct {
	adminUserRepo repository.AdminUserRepository
}

// NewTeamService creates a new TeamService.
func NewTeamService(adminUserRepo repository.AdminUserRepository) TeamService {
	return &teamService{
		adminUserRepo: adminUserRepo,
	}
}

func (s *teamService) ListTeam(ctx context.Context, tenantID uint64) ([]TeamMemberResponse, error) {
	users, err := s.adminUserRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	result := make([]TeamMemberResponse, 0, len(users))
	for _, u := range users {
		result = append(result, TeamMemberResponse{
			ID:        u.ID,
			Name:      u.Name,
			Email:     u.Email,
			Status:    u.Status,
			CreatedAt: u.CreatedAt,
		})
	}
	return result, nil
}

func (s *teamService) AddTeamMember(ctx context.Context, tenantID uint64, name, email, password string) (*TeamMemberResponse, error) {
	name = strings.TrimSpace(name)
	email = strings.TrimSpace(strings.ToLower(email))

	if name == "" {
		return nil, ErrNameRequired
	}
	if email == "" || !strings.Contains(email, "@") {
		return nil, ErrEmailRequired
	}
	if len(password) < 8 {
		return nil, ErrPasswordTooShort
	}

	// Check if email already exists globally in the system (required for central single-door login)
	existing, err := s.adminUserRepo.FindByEmail(ctx, email)
	if err == nil && existing != nil {
		return nil, ErrEmailAlreadyExists
	} else if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &repository.AdminUser{
		TenantID:     tenantID,
		Name:         name,
		Email:        email,
		PasswordHash: string(hash),
		Status:       "active",
	}

	if err := s.adminUserRepo.Create(ctx, tenantID, user); err != nil {
		return nil, err
	}

	return &TeamMemberResponse{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		Status:    user.Status,
		CreatedAt: user.CreatedAt,
	}, nil
}

func (s *teamService) ToggleStatus(ctx context.Context, tenantID uint64, currentAdminUserID uint64, targetUserID uint64, action string) (*TeamMemberResponse, error) {
	action = strings.ToLower(strings.TrimSpace(action))
	if action != "activate" && action != "deactivate" {
		return nil, ErrInvalidAction
	}

	if action == "deactivate" && targetUserID == currentAdminUserID {
		return nil, ErrCannotDeactivateSelf
	}

	targetUser, err := s.adminUserRepo.GetByID(ctx, tenantID, targetUserID)
	if err != nil {
		return nil, err
	}

	if action == "deactivate" {
		if targetUser.Status == "active" {
			activeCount, err := s.adminUserRepo.CountActiveByTenant(ctx, tenantID)
			if err != nil {
				return nil, err
			}
			if activeCount <= 1 {
				return nil, ErrCannotDeactivateLastActiveAdmin
			}
		}
		targetUser.Status = "inactive"
	} else {
		targetUser.Status = "active"
	}

	if err := s.adminUserRepo.Update(ctx, tenantID, targetUser); err != nil {
		return nil, err
	}

	return &TeamMemberResponse{
		ID:        targetUser.ID,
		Name:      targetUser.Name,
		Email:     targetUser.Email,
		Status:    targetUser.Status,
		CreatedAt: targetUser.CreatedAt,
	}, nil
}

func (s *teamService) GetMyProfile(ctx context.Context, tenantID uint64, adminUserID uint64) (*MyProfileResponse, error) {
	user, err := s.adminUserRepo.GetByID(ctx, tenantID, adminUserID)
	if err != nil {
		return nil, err
	}

	return &MyProfileResponse{
		ID:        user.ID,
		TenantID:  user.TenantID,
		Name:      user.Name,
		Email:     user.Email,
		Status:    user.Status,
		CreatedAt: user.CreatedAt,
		UpdatedAt: user.UpdatedAt,
	}, nil
}

func (s *teamService) UpdateMyProfile(ctx context.Context, tenantID uint64, adminUserID uint64, name, email *string) (*MyProfileResponse, error) {
	user, err := s.adminUserRepo.GetByID(ctx, tenantID, adminUserID)
	if err != nil {
		return nil, err
	}

	if email != nil {
		trimmedEmail := strings.TrimSpace(strings.ToLower(*email))
		if trimmedEmail == "" || !strings.Contains(trimmedEmail, "@") {
			return nil, ErrEmailRequired
		}
		if trimmedEmail != user.Email {
			existing, err := s.adminUserRepo.FindByEmail(ctx, trimmedEmail)
			if err == nil && existing != nil && existing.ID != adminUserID {
				return nil, ErrEmailAlreadyExists
			} else if err != nil && !errors.Is(err, repository.ErrNotFound) {
				return nil, err
			}
			user.Email = trimmedEmail
		}
	}

	if name != nil {
		trimmedName := strings.TrimSpace(*name)
		if trimmedName == "" {
			return nil, ErrNameRequired
		}
		user.Name = trimmedName
	}

	if err := s.adminUserRepo.Update(ctx, tenantID, user); err != nil {
		return nil, err
	}

	return &MyProfileResponse{
		ID:        user.ID,
		TenantID:  user.TenantID,
		Name:      user.Name,
		Email:     user.Email,
		Status:    user.Status,
		CreatedAt: user.CreatedAt,
		UpdatedAt: user.UpdatedAt,
	}, nil
}

func (s *teamService) UpdateMyPassword(ctx context.Context, tenantID uint64, adminUserID uint64, currentPassword, newPassword string) error {
	if len(newPassword) < 8 {
		return ErrPasswordTooShort
	}

	user, err := s.adminUserRepo.GetByID(ctx, tenantID, adminUserID)
	if err != nil {
		return err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return ErrInvalidCurrentPassword
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	user.PasswordHash = string(newHash)
	return s.adminUserRepo.Update(ctx, tenantID, user)
}
