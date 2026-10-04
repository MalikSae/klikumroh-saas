package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"klikumroh/internal/service"
)

// Login happens on the public web (klikumroh.id) but the dashboard runs on another origin
// (app.klikumroh.id), so the session has to be handed over in a URL. Handing over the token itself lets
// anyone craft a link that signs a victim into the attacker's account (login CSRF). Instead the login
// response carries a one-time code, and the same response sets an HttpOnly cookie on the parent domain.
// The dashboard trades the code for the session, and only a browser holding the matching cookie (the one
// that actually logged in) can redeem it.
//
// Staff impersonation uses the same mechanism: the impersonation token never appears in the response
// or in a URL (where it would end up in history and server logs), only a code bound to the staff browser.

const (
	handoffCookieName = "ku_handoff"
	handoffCookiePath = "/api/auth/handoff"
	handoffTTL        = 2 * time.Minute
	platformDomain    = "klikumroh.id"
)

// handoffPayload is what the dashboard receives for a code: the session, and whether KlikUmroh staff
// opened it by impersonation (decided by the server, never by the URL).
type handoffPayload struct {
	service.LoginResult
	Impersonated bool `json:"impersonated,omitempty"`
}

type handoffEntry struct {
	result      handoffPayload
	bindingHash [sha256.Size]byte
	expiresAt   time.Time
}

// handoffStore keeps pending handoffs in memory: they live two minutes and are used once, so losing them
// on a restart only means signing in again.
type handoffStore struct {
	mu      sync.Mutex
	entries map[string]handoffEntry
	now     func() time.Time
}

func newHandoffStore() *handoffStore {
	return &handoffStore{entries: map[string]handoffEntry{}, now: time.Now}
}

// sharedHandoffs serves both the travel login (AuthHandler) and staff impersonation (StaffHandler); the
// dashboard redeems either through POST /api/auth/handoff/exchange.
var sharedHandoffs = newHandoffStore()

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// create stores the login result and returns the code (for the URL) and the binding secret (for the cookie).
func (s *handoffStore) create(res handoffPayload) (code, binding string, err error) {
	if code, err = randomHex(32); err != nil {
		return "", "", err
	}
	if binding, err = randomHex(32); err != nil {
		return "", "", err
	}
	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, e := range s.entries {
		if now.After(e.expiresAt) {
			delete(s.entries, k)
		}
	}
	s.entries[code] = handoffEntry{
		result:      res,
		bindingHash: sha256.Sum256([]byte(binding)),
		expiresAt:   now.Add(handoffTTL),
	}
	return code, binding, nil
}

// redeem returns the login result once, and only for the browser holding the matching binding secret.
// A wrong binding does not consume the code, so an attacker's attempt cannot burn the real user's code.
func (s *handoffStore) redeem(code, binding string) (*handoffPayload, bool) {
	if code == "" || binding == "" {
		return nil, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[code]
	if !ok {
		return nil, false
	}
	if s.now().After(e.expiresAt) {
		delete(s.entries, code)
		return nil, false
	}
	h := sha256.Sum256([]byte(binding))
	if subtle.ConstantTimeCompare(h[:], e.bindingHash[:]) != 1 {
		return nil, false
	}
	delete(s.entries, code)
	res := e.result
	return &res, true
}

// handoffCookieDomain is the parent domain shared by the web and the dashboard. AUTH_COOKIE_DOMAIN
// overrides it; otherwise any klikumroh.id host gets "klikumroh.id". Local dev (localhost) uses a
// host-only cookie, which browsers share across ports.
func handoffCookieDomain(r *http.Request) string {
	if d := strings.TrimSpace(os.Getenv("AUTH_COOKIE_DOMAIN")); d != "" {
		return d
	}
	candidates := []string{r.Header.Get("X-Forwarded-Host"), r.Host}
	if u, err := url.Parse(r.Header.Get("Origin")); err == nil {
		candidates = append(candidates, u.Host)
	}
	for _, c := range candidates {
		host := strings.ToLower(strings.TrimSpace(c))
		if i := strings.LastIndex(host, ":"); i >= 0 && !strings.Contains(host[i:], "]") {
			host = host[:i]
		}
		if host == platformDomain || strings.HasSuffix(host, "."+platformDomain) {
			return platformDomain
		}
	}
	return ""
}

func requestIsHTTPS(r *http.Request) bool {
	return r.TLS != nil ||
		strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") ||
		strings.HasPrefix(strings.ToLower(r.Header.Get("Origin")), "https://")
}

func setHandoffCookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     handoffCookieName,
		Value:    value,
		Path:     handoffCookiePath,
		Domain:   handoffCookieDomain(r),
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   requestIsHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
}

// loginResponse is the login result plus the one-time code that opens the dashboard.
type loginResponse struct {
	*service.LoginResult
	HandoffCode string `json:"handoff_code"`
}

// issueHandoff stores the payload, binds it to this browser with the cookie, and returns the code.
func issueHandoff(w http.ResponseWriter, r *http.Request, payload handoffPayload) (string, error) {
	code, binding, err := sharedHandoffs.create(payload)
	if err != nil {
		return "", err
	}
	setHandoffCookie(w, r, binding, int(handoffTTL.Seconds()))
	return code, nil
}

// respondLogin answers a successful login: the session, plus a handoff code bound to this browser.
func (h *AuthHandler) respondLogin(w http.ResponseWriter, r *http.Request, res *service.LoginResult) {
	code, err := issueHandoff(w, r, handoffPayload{LoginResult: *res})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	respondJSON(w, http.StatusOK, loginResponse{LoginResult: res, HandoffCode: code})
}

// ExchangeHandoff handles POST /api/auth/handoff/exchange: trades a one-time code for the session.
func (h *AuthHandler) ExchangeHandoff(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	binding := ""
	if c, err := r.Cookie(handoffCookieName); err == nil {
		binding = c.Value
	}
	res, ok := sharedHandoffs.redeem(strings.TrimSpace(req.Code), binding)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid or expired handoff"})
		return
	}
	setHandoffCookie(w, r, "", -1)
	respondJSON(w, http.StatusOK, res)
}
