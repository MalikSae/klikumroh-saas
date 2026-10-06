package middleware

import (
	"log"
	"runtime/debug"
	"strings"
	"sync"
	"time"
)

// LoginFailureLimiter counts failed logins per key (e.g. tenant + email) inside a sliding window.
// Unlike the IP limiter it cannot be bypassed by changing IP address: after maxFailures wrong
// passwords the account is locked for the rest of the window, whoever is trying.
//
// Begin reserves an attempt atomically (bug hunt putaran 5): attempts still in flight count against the
// limit together with recorded failures, so concurrent requests cannot all pass the check before the
// first failure is recorded. At most maxFailures password checks per key can run per window.
type LoginFailureLimiter struct {
	mu          sync.Mutex
	failures    map[string][]time.Time
	inflight    map[string]int
	maxFailures int
	window      time.Duration
}

// NewLoginFailureLimiter creates a limiter allowing maxFailures failed logins per key per window.
func NewLoginFailureLimiter(maxFailures int, window time.Duration) *LoginFailureLimiter {
	l := &LoginFailureLimiter{
		failures:    make(map[string][]time.Time),
		inflight:    make(map[string]int),
		maxFailures: maxFailures,
		window:      window,
	}
	go func() {
		ticker := time.NewTicker(window)
		for range ticker.C {
			func() {
				defer recoverBackground("login-limiter-cleanup")
				l.mu.Lock()
				defer l.mu.Unlock()
				now := time.Now()
				for k := range l.failures {
					if l.pruneLocked(k, now) == 0 {
						delete(l.failures, k)
					}
				}
			}()
		}
	}()
	return l
}

// recoverBackground logs a panic in a background goroutine instead of letting it kill the API.
func recoverBackground(name string) {
	if rec := recover(); rec != nil {
		log.Printf("[Job %s] panic recovered: %v\n%s", name, rec, debug.Stack())
	}
}

// LoginKey builds a case-insensitive limiter key.
func LoginKey(parts ...string) string {
	cleaned := make([]string, len(parts))
	for i, p := range parts {
		cleaned[i] = strings.ToLower(strings.TrimSpace(p))
	}
	return strings.Join(cleaned, "|")
}

func (l *LoginFailureLimiter) pruneLocked(key string, now time.Time) int {
	valid := l.failures[key][:0]
	for _, t := range l.failures[key] {
		if now.Sub(t) <= l.window {
			valid = append(valid, t)
		}
	}
	l.failures[key] = valid
	return len(valid)
}

// LoginAttempt is one reserved login attempt (see Begin). Exactly one of Fail, Succeed or Done should end
// it; calling Done after Fail/Succeed (e.g. deferred) is a no-op. A nil attempt (limiter disabled) is valid.
type LoginAttempt struct {
	l    *LoginFailureLimiter
	key  string
	done bool
}

// Begin checks the lock and reserves one attempt for key in one locked step. ok is false (answer 429)
// when recorded failures plus attempts still in flight already reach the limit. A nil limiter allows
// everything.
func (l *LoginFailureLimiter) Begin(key string) (attempt *LoginAttempt, ok bool) {
	if l == nil {
		return nil, true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.pruneLocked(key, time.Now())+l.inflight[key] >= l.maxFailures {
		return nil, false
	}
	l.inflight[key]++
	return &LoginAttempt{l: l, key: key}, true
}

func (a *LoginAttempt) finish(record func()) {
	if a == nil || a.done {
		return
	}
	a.done = true
	a.l.mu.Lock()
	defer a.l.mu.Unlock()
	if record != nil {
		record()
	}
	if a.l.inflight[a.key] <= 1 {
		delete(a.l.inflight, a.key)
	} else {
		a.l.inflight[a.key]--
	}
}

// Fail records the attempt as a failed login (wrong password) and releases the reservation.
func (a *LoginAttempt) Fail() {
	if a == nil {
		return
	}
	a.finish(func() { a.l.failures[a.key] = append(a.l.failures[a.key], time.Now()) })
}

// Succeed clears the key's failures after a successful login and releases the reservation.
func (a *LoginAttempt) Succeed() {
	if a == nil {
		return
	}
	a.finish(func() { delete(a.l.failures, a.key) })
}

// Done releases the reservation without recording anything (e.g. a server error, not a wrong password).
func (a *LoginAttempt) Done() {
	a.finish(nil)
}

// Blocked reports whether the key has used up its failed attempts in the current window (attempts in
// flight included).
func (l *LoginFailureLimiter) Blocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.pruneLocked(key, time.Now())+l.inflight[key] >= l.maxFailures
}

// Fail records one failed login for the key.
func (l *LoginFailureLimiter) Fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.failures[key] = append(l.failures[key], time.Now())
}

// Reset clears the key after a successful login.
func (l *LoginFailureLimiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.failures, key)
}

// LoginLockedMessage is returned (HTTP 429) while an account is locked.
const LoginLockedMessage = "Terlalu banyak percobaan login yang gagal. Silakan coba lagi dalam 15 menit."
