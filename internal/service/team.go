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
	ErrInvalidRole                    = errors.New("peran harus 'pic' atau 'admin'")
	ErrCannotRemoveLastPIC            = errors.New("travel harus punya minimal satu PIC aktif")
)

// TeamMemberResponse represents safe admin user details for team management.
type TeamMemberResponse struct {
	ID        uint64    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Status    string    `json:"status"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// MyProfileResponse represents the user's own profile.
type MyProfileResponse struct {
	ID        uint64    `json:"id"`
	TenantID  uint64    `json:"tenant_id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Status    string    `json:"status"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TeamService defines operations for team members and user profile management.
type TeamService interface {
	ListTeam(ctx context.Context, tenantID uint64) ([]TeamMemberResponse, error)
	// AddTeamMember creates a member; role is repository.RolePIC or RoleAdmin (empty means admin).
	AddTeamMember(ctx context.Context, tenantID uint64, name, email, password, role string) (*TeamMemberResponse, error)
	// SetRole changes a member's role. A travel always keeps at least one active PIC.
	SetRole(ctx context.Context, tenantID uint64, targetUserID uint64, role string) (*TeamMemberResponse, error)
	ToggleStatus(ctx context.Context, tenantID uint64, currentAdminUserID uint64, targetUserID uint64, action string) (*TeamMemberResponse, error)
	GetMyProfile(ctx context.Context, tenantID uint64, adminUserID uint64) (*MyProfileResponse, error)
	UpdateMyProfile(ctx context.Context, tenantID uint64, adminUserID uint64, name, email *string) (*MyProfileResponse, error)
	// UpdateMyPassword changes the password and signs the admin out of every other session; currentToken
	// (the session making the request) stays signed in.
	UpdateMyPassword(ctx context.Context, tenantID uint64, adminUserID uint64, currentPassword, newPassword, currentToken string) error
}

type teamService struct {
	adminUserRepo repository.AdminUserRepository
	sessionRepo   repository.SessionRepository
}

// NewTeamService creates a new TeamService.
func NewTeamService(adminUserRepo repository.AdminUserRepository, sessionRepo repository.SessionRepository) TeamService {
	return &teamService{
		adminUserRepo: adminUserRepo,
		sessionRepo:   sessionRepo,
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
			Role:      u.Role,
			CreatedAt: u.CreatedAt,
		})
	}
	return result, nil
}

func (s *teamService) AddTeamMember(ctx context.Context, tenantID uint64, name, email, password, role string) (*TeamMemberResponse, error) {
	role = strings.ToLower(strings.TrimSpace(role))
	if role == "" {
		role = repository.RoleAdmin
	}
	if role != repository.RolePIC && role != repository.RoleAdmin {
		return nil, ErrInvalidRole
	}
	name = strings.TrimSpace(name)
	email = strings.TrimSpace(strings.ToLower(email))

	if name == "" {
		return nil, ErrNameRequired
	}
	if email == "" || !strings.Contains(email, "@") {
		return nil, ErrEmailRequired
	}
	if err := checkNewPassword(password, ErrPasswordTooShort); err != nil {
		return nil, err
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
		Role:         role,
	}

	if err := s.adminUserRepo.Create(ctx, tenantID, user); err != nil {
		return nil, err
	}

	return &TeamMemberResponse{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		Status:    user.Status,
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, nil
}

// SetRole implements TeamService.
func (s *teamService) SetRole(ctx context.Context, tenantID uint64, targetUserID uint64, role string) (*TeamMemberResponse, error) {
	role = strings.ToLower(strings.TrimSpace(role))
	if role != repository.RolePIC && role != repository.RoleAdmin {
		return nil, ErrInvalidRole
	}
	target, err := s.adminUserRepo.GetByID(ctx, tenantID, targetUserID)
	if err != nil {
		return nil, err
	}
	if target.Role == role {
		return teamMemberResponse(target), nil
	}
	if target.Role == repository.RolePIC && role == repository.RoleAdmin && target.Status == "active" {
		if err := s.requireOtherActivePIC(ctx, tenantID, target.ID); err != nil {
			return nil, err
		}
	}
	target.Role = role
	if err := s.adminUserRepo.Update(ctx, tenantID, target); err != nil {
		return nil, err
	}
	return teamMemberResponse(target), nil
}

// requireOtherActivePIC fails with ErrCannotRemoveLastPIC unless the travel has an active PIC besides
// excludeID.
func (s *teamService) requireOtherActivePIC(ctx context.Context, tenantID, excludeID uint64) error {
	users, err := s.adminUserRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		return err
	}
	for _, u := range users {
		if u.ID != excludeID && u.Role == repository.RolePIC && u.Status == "active" {
			return nil
		}
	}
	return ErrCannotRemoveLastPIC
}

func teamMemberResponse(u *repository.AdminUser) *TeamMemberResponse {
	return &TeamMemberResponse{ID: u.ID, Name: u.Name, Email: u.Email, Status: u.Status, Role: u.Role, CreatedAt: u.CreatedAt}
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

	if action == "deactivate" && targetUser.Role == repository.RolePIC && targetUser.Status == "active" {
		if err := s.requireOtherActivePIC(ctx, tenantID, targetUser.ID); err != nil {
			return nil, err
		}
	}

	// The MySQL repository counts and deactivates in one locking transaction, so two admins deactivating
	// each other at the same time cannot leave the travel without an active admin.
	if deactivator, ok := s.adminUserRepo.(adminDeactivator); ok && action == "deactivate" {
		if err := deactivator.DeactivateKeepingOneActive(ctx, tenantID, targetUserID); err != nil {
			if errors.Is(err, repository.ErrLastActiveAdmin) {
				return nil, ErrCannotDeactivateLastActiveAdmin
			}
			return nil, err
		}
		targetUser.Status = "inactive"
		if err := s.sessionRepo.DeleteByAdminUser(ctx, tenantID, targetUser.ID, ""); err != nil {
			return nil, err
		}
		return &TeamMemberResponse{
			ID:        targetUser.ID,
			Name:      targetUser.Name,
			Email:     targetUser.Email,
			Status:    targetUser.Status,
			Role:      targetUser.Role,
			CreatedAt: targetUser.CreatedAt,
		}, nil
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

	// A deactivated admin must lose access now, not when their token expires.
	if targetUser.Status == "inactive" {
		if err := s.sessionRepo.DeleteByAdminUser(ctx, tenantID, targetUser.ID, ""); err != nil {
			return nil, err
		}
	}

	return &TeamMemberResponse{
		ID:        targetUser.ID,
		Name:      targetUser.Name,
		Email:     targetUser.Email,
		Status:    targetUser.Status,
		Role:      targetUser.Role,
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
		Role:      user.Role,
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
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
		UpdatedAt: user.UpdatedAt,
	}, nil
}

func (s *teamService) UpdateMyPassword(ctx context.Context, tenantID uint64, adminUserID uint64, currentPassword, newPassword, currentToken string) error {
	if err := checkNewPassword(newPassword, ErrPasswordTooShort); err != nil {
		return err
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
	if err := s.adminUserRepo.Update(ctx, tenantID, user); err != nil {
		return err
	}

	// Changing the password evicts anyone else holding a session (e.g. a stolen token).
	return s.sessionRepo.DeleteByAdminUser(ctx, tenantID, adminUserID, currentToken)
}

// adminDeactivator is implemented by the MySQL admin user repository.
type adminDeactivator interface {
	DeactivateKeepingOneActive(ctx context.Context, tenantID uint64, id uint64) error
}
