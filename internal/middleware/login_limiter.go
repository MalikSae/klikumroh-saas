package middleware

import (
	"strings"
	"sync"
	"time"
)

// LoginFailureLimiter counts failed logins per key (e.g. tenant + email) inside a sliding window.
// Unlike the IP limiter it cannot be bypassed by changing IP address: after maxFailures wrong
// passwords the account is locked for the rest of the window, whoever is trying.
type LoginFailureLimiter struct {
	mu          sync.Mutex
	failures    map[string][]time.Time
	maxFailures int
	window      time.Duration
}

// NewLoginFailureLimiter creates a limiter allowing maxFailures failed logins per key per window.
func NewLoginFailureLimiter(maxFailures int, window time.Duration) *LoginFailureLimiter {
	l := &LoginFailureLimiter{failures: make(map[string][]time.Time), maxFailures: maxFailures, window: window}
	go func() {
		ticker := time.NewTicker(window)
		for range ticker.C {
			l.mu.Lock()
			now := time.Now()
			for k := range l.failures {
				if l.pruneLocked(k, now) == 0 {
					delete(l.failures, k)
				}
			}
			l.mu.Unlock()
		}
	}()
	return l
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

// Blocked reports whether the key has used up its failed attempts in the current window.
func (l *LoginFailureLimiter) Blocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.pruneLocked(key, time.Now()) >= l.maxFailures
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
