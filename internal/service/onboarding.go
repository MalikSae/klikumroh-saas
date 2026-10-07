package service

import (
	"context"
	"strings"

	"klikumroh/internal/repository"
)

// OnboardingStatus says which onboarding steps a travel has done (founder decision 7 Oct 2026). Three
// stages, each step done by the travel's own data; the dashboard shows the copy and the order.
//
//	Tahap 1, website siap dilihat jamaah: profile, logo, package_ready, trust (site_viewed is browser-side)
//	Tahap 2, siap rekrut agen:          agent_program, commission, target, agent_registered, agent_active
//	Tahap 3, tambah jamaah:             prospect, followed_up, pixel, custom_domain, team
//
// Optional by decision: the PPIU number, package photos, and the agent registration fee (0 is fine).
type OnboardingStatus struct {
	Profile         bool `json:"profile"`
	Logo            bool `json:"logo"`
	PackageReady    bool `json:"package_ready"`
	Trust           bool `json:"trust"`
	Commission      bool `json:"commission"`
	AgentProgram    bool `json:"agent_program"`
	AgentRegistered bool `json:"agent_registered"`
	AgentActive     bool `json:"agent_active"`
	Target          bool `json:"target"`
	Prospect        bool `json:"prospect"`
	FollowedUp      bool `json:"followed_up"`
	Pixel           bool `json:"pixel"`
	CustomDomain    bool `json:"custom_domain"`
	Team            bool `json:"team"`

	// Where the package steps send the travel: the sample draft to finish, the published package without
	// a commission amount.
	DraftPackageID             *uint64 `json:"draft_package_id"`
	MissingCommissionPackageID *uint64 `json:"missing_commission_package_id"`
}

type OnboardingService interface {
	Status(ctx context.Context, tenantID uint64) (*OnboardingStatus, error)
}

type onboardingService struct {
	repo repository.OnboardingRepository
}

func NewOnboardingService(repo repository.OnboardingRepository) OnboardingService {
	return &onboardingService{repo: repo}
}

func filled(v string) bool { return strings.TrimSpace(v) != "" }

func (s *onboardingService) Status(ctx context.Context, tenantID uint64) (*OnboardingStatus, error) {
	f, err := s.repo.Facts(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return &OnboardingStatus{
		Profile:      filled(f.TravelName) && (filled(f.Address) || filled(f.City)),
		Logo:         filled(f.LogoURL),
		PackageReady: f.ReadyPackages > 0,
		Trust:        f.TrustItems > 0,
		// Every package on sale tells the agent what they earn.
		Commission:      f.PublishedPackages > 0 && f.PackagesWithoutCommission == 0,
		AgentProgram:    filled(f.AgentBenefits) && filled(f.AgentTerms),
		AgentRegistered: f.Agents > 0,
		AgentActive:     f.ActiveAgents > 0,
		Target:          f.Targets > 0,
		Prospect:        f.Prospects > 0,
		FollowedUp:      f.FollowedUp > 0,
		Pixel:           filled(f.MetaPixelID),
		CustomDomain:    f.CustomDomains > 0,
		Team:            f.AdminUsers > 1,

		DraftPackageID:             f.DraftPackageID,
		MissingCommissionPackageID: f.MissingCommissionPackageID,
	}, nil
}
