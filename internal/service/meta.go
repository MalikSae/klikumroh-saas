package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// Meta Pixel + Conversions API (CAPI) per travel.
//
// Standard events:
//   - PageView, ViewContent, Contact: browser pixel only (public site).
//   - Lead: browser pixel AND server CAPI with the same event_id (Meta deduplicates them).
//   - Purchase: server CAPI when the admin marks a web-form prospect as Closing (= DP paid), with the
//     package value, so ad campaigns can optimise for real bookings.
//
// Personal data is only sent hashed (SHA-256) as Meta requires, only for prospects with UU PDP consent,
// and never for anonymized prospects.

const (
	metaGraphBaseURL = "https://graph.facebook.com"
	// defaultMetaGraphVersion is the Marketing API version used for Conversions API calls. Marketing API
	// versions expire (v21.0 expired 9 Sep 2025); override with META_GRAPH_VERSION to upgrade without a
	// code change. Checked 29 Sep 2026: v25.0 is the newest Marketing API version, no expiry date yet.
	defaultMetaGraphVersion = "v25.0"
	metaSendTimeout         = 10 * time.Second
)

var (
	// ErrInvalidMetaPixelID is returned for a Pixel ID that is not 10-20 digits.
	ErrInvalidMetaPixelID = errors.New("Pixel ID harus berupa 10-20 digit angka (lihat Events Manager)")
	// ErrInvalidMetaToken is returned for an access token with an impossible format.
	ErrInvalidMetaToken = errors.New("access token Conversions API tidak valid")
	// ErrInvalidMetaTestCode is returned for a malformed test event code.
	ErrInvalidMetaTestCode = errors.New("Test Event Code hanya boleh huruf dan angka (maksimal 40 karakter)")
	// ErrMetaNotConfigured is returned when testing without pixel ID or token.
	ErrMetaNotConfigured = errors.New("isi Pixel ID dan access token Conversions API terlebih dulu")
	// ErrMetaTestCodeRequired is returned when testing without a test event code.
	ErrMetaTestCodeRequired = errors.New("isi Test Event Code dari Events Manager > Test Events agar event uji tidak tercatat sebagai data asli")
)

var (
	metaPixelIDPattern  = regexp.MustCompile(`^[0-9]{10,20}$`)
	metaTestCodePattern = regexp.MustCompile(`^[A-Za-z0-9]{1,40}$`)
	metaVersionPattern  = regexp.MustCompile(`^v[0-9]{2,3}\.0$`)
	metaCookiePattern   = regexp.MustCompile(`^fb\.[0-9]\.[0-9]{10,13}\.[A-Za-z0-9_\-.]{1,200}$`)
)

// MetaSettingsView is what the dashboard sees: the token itself is never returned.
type MetaSettingsView struct {
	PixelID         string `json:"pixel_id"`
	TokenConfigured bool   `json:"token_configured"`
	TokenHint       string `json:"token_hint"`
	TestEventCode   string `json:"test_event_code"`
	// EncryptionReady is false when the server has no APP_ENCRYPTION_KEY: a token cannot be saved then.
	EncryptionReady bool `json:"encryption_ready"`
	// Delivery status of server events, so a failing token is visible to the travel.
	LastSuccessAt *time.Time `json:"last_success_at"`
	LastError     string     `json:"last_error"`
	LastErrorAt   *time.Time `json:"last_error_at"`
}

// MetaSettingsInput updates the settings. AccessToken nil keeps the stored token.
type MetaSettingsInput struct {
	PixelID       string  `json:"pixel_id"`
	AccessToken   *string `json:"access_token"`
	ClearToken    bool    `json:"clear_token"`
	TestEventCode string  `json:"test_event_code"`
}

// MetaTestResult is Meta's answer to a test event.
type MetaTestResult struct {
	EventsReceived int    `json:"events_received"`
	FbTraceID      string `json:"fbtrace_id"`
}

// MetaUserData identifies the visitor for Meta matching. Plain values; hashed when sent.
type MetaUserData struct {
	Phone      string // normalized 62xxxxxxxx
	Email      string
	Name       string
	City       string
	ExternalID string
	ClientIP   string
	UserAgent  string
	Fbp        string
	Fbc        string
}

// MetaLeadEvent is a new lead from the public interest form.
type MetaLeadEvent struct {
	EventID     string
	EventTime   time.Time
	SourceURL   string
	User        MetaUserData
	ContentName string
	ContentID   string
}

// MetaPurchaseEvent is a closing (DP paid) of a web-form lead.
type MetaPurchaseEvent struct {
	EventID     string
	EventTime   time.Time
	User        MetaUserData
	Value       float64
	ContentName string
	ContentID   string
	NumItems    int
	// OnFailed is called when the event could not be delivered (so the caller can allow a retry).
	OnFailed func()
}

// MetaEventTracker is what the prospect service needs: fire-and-forget server events.
type MetaEventTracker interface {
	// Enabled reports whether the travel can receive server events (pixel ID + token configured).
	Enabled(ctx context.Context, tenantID uint64) bool
	TrackLead(tenantID uint64, ev MetaLeadEvent)
	TrackPurchase(tenantID uint64, ev MetaPurchaseEvent)
}

// MetaService manages a travel's Meta settings and sends Conversions API events.
type MetaService interface {
	MetaEventTracker
	GetSettings(ctx context.Context, tenantID uint64) (*MetaSettingsView, error)
	SaveSettings(ctx context.Context, tenantID uint64, input MetaSettingsInput) (*MetaSettingsView, error)
	// SendTestEvent sends a test PageView carrying the admin's browser (IP, user agent), which Meta
	// requires for website events.
	SendTestEvent(ctx context.Context, tenantID uint64, clientIP, userAgent string) (*MetaTestResult, error)
	PublicPixelID(ctx context.Context, tenantID uint64) (string, error)
}

type metaService struct {
	repo       repository.MetaIntegrationRepository
	box        *util.SecretBox // nil when APP_ENCRYPTION_KEY is missing
	httpClient *http.Client
	baseURL    string
	version    string
	// dispatch runs event sends in the background (tests replace it to run inline).
	dispatch func(func())
}

// NewMetaService creates the service. box may be nil (no encryption key): settings can then still be
// read and the pixel ID saved, but no token can be stored and no CAPI event is sent.
func NewMetaService(repo repository.MetaIntegrationRepository, box *util.SecretBox) MetaService {
	return &metaService{
		repo:       repo,
		box:        box,
		httpClient: &http.Client{Timeout: metaSendTimeout},
		baseURL:    metaGraphBaseURL,
		version:    metaGraphVersion(),
		dispatch:   func(f func()) { go f() },
	}
}

// metaGraphVersion returns META_GRAPH_VERSION when it is a valid version ("v25.0"), else the default.
func metaGraphVersion() string {
	if v := strings.TrimSpace(os.Getenv("META_GRAPH_VERSION")); v != "" {
		if metaVersionPattern.MatchString(v) {
			return v
		}
		log.Printf("[Meta] ignoring invalid META_GRAPH_VERSION %q, using %s", v, defaultMetaGraphVersion)
	}
	return defaultMetaGraphVersion
}

// NewMetaServiceForTest points the service at a fake Graph API and sends events synchronously.
func NewMetaServiceForTest(repo repository.MetaIntegrationRepository, box *util.SecretBox, baseURL string) MetaService {
	s := NewMetaService(repo, box).(*metaService)
	s.baseURL = baseURL
	s.dispatch = func(f func()) { f() }
	return s
}

func (s *metaService) view(m *repository.MetaIntegration) *MetaSettingsView {
	v := &MetaSettingsView{EncryptionReady: s.box != nil}
	if m.PixelID != nil {
		v.PixelID = *m.PixelID
	}
	if m.TestEventCode != nil {
		v.TestEventCode = *m.TestEventCode
	}
	v.LastSuccessAt = m.LastSuccessAt
	v.LastErrorAt = m.LastErrorAt
	if m.LastError != nil {
		v.LastError = *m.LastError
	}
	if m.TokenEnc != nil && *m.TokenEnc != "" {
		v.TokenConfigured = true
		if s.box != nil {
			if token, err := s.box.Open(*m.TokenEnc); err == nil && len(token) >= 4 {
				v.TokenHint = token[len(token)-4:]
			}
		}
	}
	return v
}

func (s *metaService) GetSettings(ctx context.Context, tenantID uint64) (*MetaSettingsView, error) {
	m, err := s.repo.Get(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return s.view(m), nil
}

func (s *metaService) SaveSettings(ctx context.Context, tenantID uint64, input MetaSettingsInput) (*MetaSettingsView, error) {
	var pixelID *string
	if p := strings.TrimSpace(input.PixelID); p != "" {
		if !metaPixelIDPattern.MatchString(p) {
			return nil, ErrInvalidMetaPixelID
		}
		pixelID = &p
	}
	var testCode *string
	if c := strings.TrimSpace(input.TestEventCode); c != "" {
		if !metaTestCodePattern.MatchString(c) {
			return nil, ErrInvalidMetaTestCode
		}
		testCode = &c
	}
	var tokenEnc *string
	if !input.ClearToken && input.AccessToken != nil && strings.TrimSpace(*input.AccessToken) != "" {
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
		tokenEnc = &sealed
	}
	if err := s.repo.Save(ctx, tenantID, pixelID, tokenEnc, input.ClearToken, testCode); err != nil {
		return nil, err
	}
	return s.GetSettings(ctx, tenantID)
}

func (s *metaService) PublicPixelID(ctx context.Context, tenantID uint64) (string, error) {
	return s.repo.GetPublicPixelID(ctx, tenantID)
}

// credentials returns pixel ID, token and test code, or ok=false when CAPI is not usable.
func (s *metaService) credentials(ctx context.Context, tenantID uint64) (pixelID, token, testCode string, ok bool) {
	if s.box == nil {
		return "", "", "", false
	}
	m, err := s.repo.Get(ctx, tenantID)
	if err != nil || m.PixelID == nil || m.TokenEnc == nil || *m.TokenEnc == "" {
		return "", "", "", false
	}
	token, err = s.box.Open(*m.TokenEnc)
	if err != nil {
		log.Printf("[Meta] tenant %d: cannot decrypt CAPI token (APP_ENCRYPTION_KEY changed?)", tenantID)
		return "", "", "", false
	}
	if m.TestEventCode != nil {
		testCode = *m.TestEventCode
	}
	return *m.PixelID, token, testCode, true
}

func (s *metaService) Enabled(ctx context.Context, tenantID uint64) bool {
	_, _, _, ok := s.credentials(ctx, tenantID)
	return ok
}

// websiteActionSource: Meta requires client_user_agent for "website" events; without it the event is
// reported as system_generated rather than being rejected.
func websiteActionSource(userAgent string) string {
	if strings.TrimSpace(userAgent) == "" {
		return "system_generated"
	}
	return "website"
}

func (s *metaService) SendTestEvent(ctx context.Context, tenantID uint64, clientIP, userAgent string) (*MetaTestResult, error) {
	pixelID, token, testCode, ok := s.credentials(ctx, tenantID)
	if !ok {
		return nil, ErrMetaNotConfigured
	}
	if testCode == "" {
		return nil, ErrMetaTestCodeRequired
	}
	user := metaUserData(MetaUserData{
		ExternalID: fmt.Sprintf("klikumroh-test-%d", tenantID),
		ClientIP:   strings.TrimSpace(clientIP),
		UserAgent:  truncate(strings.TrimSpace(userAgent), 500),
	})
	event := map[string]interface{}{
		"event_name":    "PageView",
		"event_time":    time.Now().Unix(),
		"event_id":      "test-" + newMetaEventID(),
		"action_source": websiteActionSource(userAgent),
		"user_data":     user,
	}
	return s.deliver(ctx, tenantID, pixelID, token, testCode, event)
}

// deliver sends one event and records the outcome for the dashboard (never the token).
func (s *metaService) deliver(ctx context.Context, tenantID uint64, pixelID, token, testCode string, event map[string]interface{}) (*MetaTestResult, error) {
	result, err := s.post(ctx, pixelID, token, testCode, event)
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	if recErr := s.repo.RecordDelivery(context.Background(), tenantID, msg); recErr != nil {
		log.Printf("[Meta] tenant %d: cannot record delivery status: %v", tenantID, recErr)
	}
	return result, err
}

func (s *metaService) TrackLead(tenantID uint64, ev MetaLeadEvent) {
	s.dispatch(func() {
		ctx, cancel := context.WithTimeout(context.Background(), metaSendTimeout)
		defer cancel()
		pixelID, token, testCode, ok := s.credentials(ctx, tenantID)
		if !ok {
			return
		}
		custom := map[string]interface{}{"currency": "IDR", "content_category": "umroh"}
		if ev.ContentName != "" {
			custom["content_name"] = ev.ContentName
		}
		if ev.ContentID != "" {
			custom["content_ids"] = []string{ev.ContentID}
			custom["content_type"] = "product"
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
		if _, err := s.deliver(ctx, tenantID, pixelID, token, testCode, event); err != nil {
			log.Printf("[Meta] tenant %d: Lead event failed: %v", tenantID, err)
		}
	})
}

func (s *metaService) TrackPurchase(tenantID uint64, ev MetaPurchaseEvent) {
	s.dispatch(func() {
		ctx, cancel := context.WithTimeout(context.Background(), metaSendTimeout)
		defer cancel()
		failed := func() {
			if ev.OnFailed != nil {
				ev.OnFailed()
			}
		}
		pixelID, token, testCode, ok := s.credentials(ctx, tenantID)
		if !ok {
			failed()
			return
		}
		custom := map[string]interface{}{"currency": "IDR", "value": ev.Value, "content_category": "umroh"}
		if ev.ContentName != "" {
			custom["content_name"] = ev.ContentName
		}
		if ev.ContentID != "" {
			custom["content_ids"] = []string{ev.ContentID}
			custom["content_type"] = "product"
		}
		if ev.NumItems > 0 {
			custom["num_items"] = ev.NumItems
		}
		event := map[string]interface{}{
			"event_name": "Purchase",
			"event_time": ev.EventTime.Unix(),
			"event_id":   ev.EventID,
			// The closing is recorded by the travel's admin in the dashboard, not on the website.
			"action_source": "system_generated",
			"user_data":     metaUserData(ev.User),
			"custom_data":   custom,
		}
		if _, err := s.deliver(ctx, tenantID, pixelID, token, testCode, event); err != nil {
			log.Printf("[Meta] tenant %d: Purchase event failed: %v", tenantID, err)
			failed()
		}
	})
}

// post sends one event. The token goes in the JSON body (not the URL) so it never lands in access logs.
func (s *metaService) post(ctx context.Context, pixelID, token, testCode string, event map[string]interface{}) (*MetaTestResult, error) {
	body := map[string]interface{}{
		"data":         []interface{}{event},
		"access_token": token,
	}
	if testCode != "" {
		body["test_event_code"] = testCode
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/%s/%s/events", s.baseURL, s.version, pixelID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tidak dapat menghubungi Meta: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	var parsed struct {
		EventsReceived int    `json:"events_received"`
		FbTraceID      string `json:"fbtrace_id"`
		Error          *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(respBody, &parsed)
	if resp.StatusCode >= 300 || parsed.Error != nil {
		msg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		if parsed.Error != nil && parsed.Error.Message != "" {
			msg = parsed.Error.Message
		}
		return nil, fmt.Errorf("Meta menolak event: %s", msg)
	}
	return &MetaTestResult{EventsReceived: parsed.EventsReceived, FbTraceID: parsed.FbTraceID}, nil
}

// metaUserData builds Meta's user_data: identifiers hashed with SHA-256 after normalization,
// browser identifiers (IP, user agent, fbp, fbc) as-is, as Meta specifies.
func metaUserData(u MetaUserData) map[string]interface{} {
	d := map[string]interface{}{"country": []string{hashMeta("id")}}
	if u.Phone != "" {
		d["ph"] = []string{hashMeta(u.Phone)}
	}
	if e := strings.ToLower(strings.TrimSpace(u.Email)); e != "" {
		d["em"] = []string{hashMeta(e)}
	}
	if parts := strings.Fields(strings.ToLower(u.Name)); len(parts) > 0 {
		d["fn"] = []string{hashMeta(lettersOnly(parts[0]))}
		if len(parts) > 1 {
			d["ln"] = []string{hashMeta(lettersOnly(parts[len(parts)-1]))}
		}
	}
	if c := lettersOnly(strings.ToLower(u.City)); c != "" {
		d["ct"] = []string{hashMeta(c)}
	}
	if u.ExternalID != "" {
		d["external_id"] = []string{hashMeta(u.ExternalID)}
	}
	if u.ClientIP != "" {
		d["client_ip_address"] = u.ClientIP
	}
	if u.UserAgent != "" {
		d["client_user_agent"] = u.UserAgent
	}
	if u.Fbp != "" {
		d["fbp"] = u.Fbp
	}
	if u.Fbc != "" {
		d["fbc"] = u.Fbc
	}
	return d
}

func lettersOnly(s string) string {
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func hashMeta(v string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(v)))
	return hex.EncodeToString(sum[:])
}

func newMetaEventID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// metaExternalID links a lead and its later purchase to the same (tenant-scoped) person for Meta.
func metaExternalID(tenantID, prospectID uint64) string {
	return fmt.Sprintf("klikumroh-%d-%d", tenantID, prospectID)
}

// cleanMetaCookie accepts only well-formed _fbp / _fbc values ("fb.1.<ms>.<value>").
func cleanMetaCookie(v string) *string {
	v = strings.TrimSpace(v)
	if v == "" || len(v) > 255 || !metaCookiePattern.MatchString(v) {
		return nil
	}
	return &v
}
