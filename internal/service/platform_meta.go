package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// Meta Pixel + Conversions API of KlikUmroh itself (platform level, 14 Okt 2026), used to measure the
// ads that acquire travels. It is separate from the per-travel integration in meta.go: one Pixel for the
// whole klikumroh.id funnel, configured by staff in the internal dashboard.
//
// Settings live in platform_settings (key/value). The access token is stored encrypted with
// APP_ENCRYPTION_KEY and is never returned by any endpoint.

const (
	platformMetaKeyPixelID     = "meta_pixel_id"
	platformMetaKeyTokenEnc    = "meta_capi_token_enc"
	platformMetaKeyTestCode    = "meta_test_event_code"
	platformMetaKeyLastSuccess = "meta_last_success_at"
	platformMetaKeyLastError   = "meta_last_error"
	platformMetaKeyLastErrorAt = "meta_last_error_at"
)

// platformMetaExternalID is the (hashed when sent) identifier that ties a travel's Lead and Purchase together.
func platformMetaExternalID(tenantID uint64) string {
	return fmt.Sprintf("klikumroh-platform-%d", tenantID)
}

// PlatformMetaSettingsView is what the internal dashboard sees: the token itself is never returned.
type PlatformMetaSettingsView struct {
	PixelID         string `json:"pixel_id"`
	TokenConfigured bool   `json:"token_configured"`
	TokenHint       string `json:"token_hint"`
	TestEventCode   string `json:"test_event_code"`
	// EncryptionReady is false when the server has no APP_ENCRYPTION_KEY: a token cannot be saved then.
	EncryptionReady bool       `json:"encryption_ready"`
	LastSuccessAt   *time.Time `json:"last_success_at"`
	LastError       string     `json:"last_error"`
	LastErrorAt     *time.Time `json:"last_error_at"`
}

// PlatformMetaInput updates the settings. PixelID and TestEventCode are replaced as sent (empty clears);
// AccessToken nil keeps the stored token.
type PlatformMetaInput struct {
	PixelID       string  `json:"pixel_id"`
	AccessToken   *string `json:"access_token"`
	ClearToken    bool    `json:"clear_token"`
	TestEventCode string  `json:"test_event_code"`
}

// PlatformMetaService manages KlikUmroh's own Meta settings and sends its Conversions API events.
type PlatformMetaService interface {
	GetSettings(ctx context.Context) (*PlatformMetaSettingsView, error)
	SaveSettings(ctx context.Context, input PlatformMetaInput) (*PlatformMetaSettingsView, error)
	// SendTestEvent sends a test PageView carrying the staff member's browser (IP, user agent).
	SendTestEvent(ctx context.Context, clientIP, userAgent string) (*MetaTestResult, error)
	// PublicPixelID is the Pixel ID for the klikumroh.id pages, or "" when not configured.
	PublicPixelID(ctx context.Context) (string, error)
	PlatformLeadTracker
	PlatformPurchaseTracker
}

// PlatformPurchaseEvent is a travel's first subscription payment, confirmed by staff.
type PlatformPurchaseEvent struct {
	EventID     string
	EventTime   time.Time
	User        MetaUserData
	Value       float64
	ContentName string
	ContentID   string
	// OnFailed is called when the event could not be delivered (so the caller can allow a retry).
	OnFailed func()
}

// PlatformPurchaseTracker sends the Purchase event of a confirmed subscription payment.
type PlatformPurchaseTracker interface {
	// Enabled reports whether Conversions API is configured (Pixel ID + token + encryption key).
	Enabled(ctx context.Context) bool
	TrackPurchase(ev PlatformPurchaseEvent)
	// SendPurchase delivers synchronously and returns Meta's answer (used by the staff resend).
	SendPurchase(ctx context.Context, ev PlatformPurchaseEvent) error
}

// PlatformLeadEvent is a new travel signup, reported to Meta as Lead.
type PlatformLeadEvent struct {
	EventID     string
	EventTime   time.Time
	SourceURL   string
	User        MetaUserData
	ContentName string
}

// PlatformLeadTracker sends the Lead event of a travel signup (fire-and-forget; nothing is sent while the
// platform Pixel ID or token is not configured).
type PlatformLeadTracker interface {
	TrackLead(ev PlatformLeadEvent)
}

type platformMetaService struct {
	repo       repository.PlatformSettingsRepository
	box        *util.SecretBox // nil when APP_ENCRYPTION_KEY is missing
	httpClient *http.Client
	baseURL    string
	version    string
	// dispatch runs event sends in the background (tests replace it to run inline).
	dispatch func(func())
}

// NewPlatformMetaService creates the service. box may be nil (no encryption key): the pixel ID can still
// be saved, but no token can be stored and no Conversions API event is sent.
func NewPlatformMetaService(repo repository.PlatformSettingsRepository, box *util.SecretBox) PlatformMetaService {
	return &platformMetaService{
		repo:       repo,
		box:        box,
		httpClient: &http.Client{Timeout: metaSendTimeout},
		baseURL:    metaGraphBaseURL,
		version:    metaGraphVersion(),
		dispatch:   func(f func()) { go f() },
	}
}

// NewPlatformMetaServiceForTest points the service at a fake Graph API and sends events synchronously.
func NewPlatformMetaServiceForTest(repo repository.PlatformSettingsRepository, box *util.SecretBox, baseURL string) PlatformMetaService {
	s := NewPlatformMetaService(repo, box).(*platformMetaService)
	s.baseURL = baseURL
	s.dispatch = func(f func()) { f() }
	return s
}

func (s *platformMetaService) Enabled(ctx context.Context) bool {
	_, _, _, ok := s.credentials(ctx)
	return ok
}

// Content categories of the events (the browser pixel uses the same values).
const (
	metaCategorySignup       = "klikumroh_signup"
	metaCategorySubscription = "klikumroh_subscription"
)

func buildPlatformLeadEvent(ev PlatformLeadEvent) map[string]interface{} {
	custom := map[string]interface{}{"content_category": metaCategorySignup}
	if ev.ContentName != "" {
		custom["content_name"] = ev.ContentName
	}
	event := map[string]interface{}{
		"event_name":    "Lead",
		"event_time":    ev.EventTime.Unix(),
		"event_id":      ev.EventID,
		"action_source": websiteActionSource(ev.User.UserAgent),
		"user_data":     metaUserData(ev.User),
		"custom_data":   custom,
	}
	if ev.SourceURL != "" {
		event["event_source_url"] = ev.SourceURL
	}
	return event
}

func buildPlatformPurchaseEvent(ev PlatformPurchaseEvent) map[string]interface{} {
	custom := map[string]interface{}{"currency": "IDR", "value": ev.Value, "content_category": metaCategorySubscription}
	if ev.ContentName != "" {
		custom["content_name"] = ev.ContentName
	}
	if ev.ContentID != "" {
		custom["content_ids"] = []string{ev.ContentID}
		custom["content_type"] = "product"
	}
	return map[string]interface{}{
		"event_name": "Purchase",
		"event_time": ev.EventTime.Unix(),
		"event_id":   ev.EventID,
		// Payment is confirmed by staff in the internal dashboard, not on the website.
		"action_source": "system_generated",
		"user_data":     metaUserData(ev.User),
		"custom_data":   custom,
	}
}

// sendEvent delivers one event with the stored credentials. ErrMetaNotConfigured when Conversions API is
// not usable (no Pixel ID, token or encryption key).
func (s *platformMetaService) sendEvent(ctx context.Context, event map[string]interface{}) error {
	pixelID, token, testCode, ok := s.credentials(ctx)
	if !ok {
		return ErrMetaNotConfigured
	}
	_, err := s.deliver(ctx, pixelID, token, testCode, event)
	return err
}

// background runs fn off the request, with the send timeout.
func (s *platformMetaService) background(fn func(ctx context.Context)) {
	s.dispatch(func() {
		ctx, cancel := context.WithTimeout(context.Background(), metaSendTimeout)
		defer cancel()
		fn(ctx)
	})
}

func (s *platformMetaService) SendPurchase(ctx context.Context, ev PlatformPurchaseEvent) error {
	return s.sendEvent(ctx, buildPlatformPurchaseEvent(ev))
}

func (s *platformMetaService) TrackPurchase(ev PlatformPurchaseEvent) {
	s.background(func(ctx context.Context) {
		if err := s.SendPurchase(ctx, ev); err != nil {
			if !errors.Is(err, ErrMetaNotConfigured) {
				log.Printf("[PlatformMeta] Purchase event failed: %v", err)
			}
			if ev.OnFailed != nil {
				ev.OnFailed()
			}
		}
	})
}

func (s *platformMetaService) TrackLead(ev PlatformLeadEvent) {
	s.background(func(ctx context.Context) {
		if err := s.sendEvent(ctx, buildPlatformLeadEvent(ev)); err != nil && !errors.Is(err, ErrMetaNotConfigured) {
			log.Printf("[PlatformMeta] Lead event failed: %v", err)
		}
	})
}

// applyAttributionToUser copies the signup browser context (IP, user agent, Meta cookies) into the
// matching data of an event.
func applyAttributionToUser(u *MetaUserData, a *repository.TenantAdAttribution) {
	if a == nil {
		return
	}
	if a.ClientIP != nil {
		u.ClientIP = *a.ClientIP
	}
	if a.UserAgent != nil {
		u.UserAgent = *a.UserAgent
	}
	if a.Fbp != nil {
		u.Fbp = *a.Fbp
	}
	if a.Fbc != nil {
		u.Fbc = *a.Fbc
	}
}

func parseStoredTime(v string) *time.Time {
	if t, err := time.Parse(time.RFC3339, strings.TrimSpace(v)); err == nil {
		return &t
	}
	return nil
}

func (s *platformMetaService) view(data map[string]string) *PlatformMetaSettingsView {
	v := &PlatformMetaSettingsView{
		PixelID:         strings.TrimSpace(data[platformMetaKeyPixelID]),
		TestEventCode:   strings.TrimSpace(data[platformMetaKeyTestCode]),
		EncryptionReady: s.box != nil,
		LastSuccessAt:   parseStoredTime(data[platformMetaKeyLastSuccess]),
		LastError:       data[platformMetaKeyLastError],
		LastErrorAt:     parseStoredTime(data[platformMetaKeyLastErrorAt]),
	}
	if enc := data[platformMetaKeyTokenEnc]; enc != "" {
		v.TokenConfigured = true
		if s.box != nil {
			if token, err := s.box.Open(enc); err == nil && len(token) >= 4 {
				v.TokenHint = token[len(token)-4:]
			}
		}
	}
	return v
}

func (s *platformMetaService) GetSettings(ctx context.Context) (*PlatformMetaSettingsView, error) {
	data, err := s.repo.GetAll(ctx)
	if err != nil {
		return nil, err
	}
	return s.view(data), nil
}

func (s *platformMetaService) SaveSettings(ctx context.Context, input PlatformMetaInput) (*PlatformMetaSettingsView, error) {
	pixelID := strings.TrimSpace(input.PixelID)
	if pixelID != "" && !metaPixelIDPattern.MatchString(pixelID) {
		return nil, ErrInvalidMetaPixelID
	}
	testCode := strings.TrimSpace(input.TestEventCode)
	if testCode != "" && !metaTestCodePattern.MatchString(testCode) {
		return nil, ErrInvalidMetaTestCode
	}

	updates := map[string]string{
		platformMetaKeyPixelID:  pixelID,
		platformMetaKeyTestCode: testCode,
	}
	switch {
	case input.ClearToken:
		updates[platformMetaKeyTokenEnc] = ""
	case input.AccessToken != nil && strings.TrimSpace(*input.AccessToken) != "":
		token := strings.TrimSpace(*input.AccessToken)
		if len(token) < 20 || len(token) > 1000 || strings.ContainsAny(token, " \t\r\n") {
			return nil, ErrInvalidMetaToken
		}
		if s.box == nil {
			return nil, util.ErrEncryptionKeyMissing
		}
		sealed, err := s.box.Seal(token)
		if err != nil {
			return nil, err
		}
		updates[platformMetaKeyTokenEnc] = sealed
		// A new token starts with a clean delivery status.
		updates[platformMetaKeyLastError] = ""
		updates[platformMetaKeyLastErrorAt] = ""
	}
	if err := s.repo.SetMany(ctx, updates); err != nil {
		return nil, err
	}
	return s.GetSettings(ctx)
}

func (s *platformMetaService) PublicPixelID(ctx context.Context) (string, error) {
	data, err := s.repo.GetAll(ctx)
	if err != nil {
		return "", err
	}
	pixelID := strings.TrimSpace(data[platformMetaKeyPixelID])
	if !metaPixelIDPattern.MatchString(pixelID) {
		return "", nil
	}
	return pixelID, nil
}

// credentials returns pixel ID, token and test code, or ok=false when Conversions API is not usable.
func (s *platformMetaService) credentials(ctx context.Context) (pixelID, token, testCode string, ok bool) {
	if s.box == nil {
		return "", "", "", false
	}
	data, err := s.repo.GetAll(ctx)
	if err != nil {
		return "", "", "", false
	}
	pixelID = strings.TrimSpace(data[platformMetaKeyPixelID])
	enc := data[platformMetaKeyTokenEnc]
	if pixelID == "" || enc == "" {
		return "", "", "", false
	}
	token, err = s.box.Open(enc)
	if err != nil {
		log.Printf("[PlatformMeta] cannot decrypt CAPI token (APP_ENCRYPTION_KEY changed?)")
		return "", "", "", false
	}
	return pixelID, token, strings.TrimSpace(data[platformMetaKeyTestCode]), true
}

func (s *platformMetaService) SendTestEvent(ctx context.Context, clientIP, userAgent string) (*MetaTestResult, error) {
	pixelID, token, testCode, ok := s.credentials(ctx)
	if !ok {
		return nil, ErrMetaNotConfigured
	}
	if testCode == "" {
		return nil, ErrMetaTestCodeRequired
	}
	event := map[string]interface{}{
		"event_name":    "PageView",
		"event_time":    time.Now().Unix(),
		"event_id":      "test-" + newMetaEventID(),
		"action_source": websiteActionSource(userAgent),
		"user_data": metaUserData(MetaUserData{
			ExternalID: "klikumroh-platform-test",
			ClientIP:   strings.TrimSpace(clientIP),
			UserAgent:  truncate(strings.TrimSpace(userAgent), 500),
		}),
	}
	return s.deliver(ctx, pixelID, token, testCode, event)
}

// deliver sends one event and records the outcome for the dashboard (never the token).
func (s *platformMetaService) deliver(ctx context.Context, pixelID, token, testCode string, event map[string]interface{}) (*MetaTestResult, error) {
	result, err := postMetaEvent(ctx, s.httpClient, s.baseURL, s.version, pixelID, token, testCode, event)
	now := time.Now().UTC().Format(time.RFC3339)
	status := map[string]string{}
	if err != nil {
		status[platformMetaKeyLastError] = truncate(err.Error(), 500)
		status[platformMetaKeyLastErrorAt] = now
	} else {
		status[platformMetaKeyLastSuccess] = now
		status[platformMetaKeyLastError] = ""
		status[platformMetaKeyLastErrorAt] = ""
	}
	if recErr := s.repo.SetMany(context.Background(), status); recErr != nil {
		log.Printf("[PlatformMeta] cannot record delivery status: %v", recErr)
	}
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	return result, nil
}
