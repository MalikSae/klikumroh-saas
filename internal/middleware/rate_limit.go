package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ipRateLimiter struct {
	mu      sync.Mutex
	limits  map[string][]time.Time
	maxReqs int
	window  time.Duration
}

// NewIPRateLimiter creates an in-memory IP rate limiter middleware.
func NewIPRateLimiter(maxReqs int, window time.Duration) func(http.Handler) http.Handler {
	rl := &ipRateLimiter{
		limits:  make(map[string][]time.Time),
		maxReqs: maxReqs,
		window:  window,
	}

	// Periodically clean up stale records every 2 * window
	go func() {
		ticker := time.NewTicker(window * 2)
		for range ticker.C {
			rl.mu.Lock()
			now := time.Now()
			for ip, timestamps := range rl.limits {
				var valid []time.Time
				for _, t := range timestamps {
					if now.Sub(t) <= window {
						valid = append(valid, t)
					}
				}
				if len(valid) == 0 {
					delete(rl.limits, ip)
				} else {
					rl.limits[ip] = valid
				}
			}
			rl.mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := getClientIP(r)
			rl.mu.Lock()
			now := time.Now()
			timestamps := rl.limits[ip]

			var valid []time.Time
			for _, t := range timestamps {
				if now.Sub(t) <= window {
					valid = append(valid, t)
				}
			}

			if len(valid) >= rl.maxReqs {
				rl.mu.Unlock()
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "Terlalu banyak permintaan. Silakan tunggu beberapa saat sebelum mencoba kembali.",
				})
				return
			}

			rl.limits[ip] = append(valid, now)
			rl.mu.Unlock()

			next.ServeHTTP(w, r)
		})
	}
}

// ClientIP returns the visitor IP (rate limiting, Meta CAPI, affiliator self-referral guard).
func ClientIP(r *http.Request) string {
	return getClientIP(r)
}

// getClientIP reads X-Forwarded-For only when the request came from a local proxy (Caddy or Next.js on
// this machine), and walks it from the right: each proxy appends the address it received the request
// from, so the entries on the left are whatever the visitor sent and can be forged. The first address
// from the right that is not one of our local proxies is the visitor. Without a usable entry the
// connection's own address is returned (loopback, which the self-referral guard ignores).
func getClientIP(r *http.Request) string {
	remote := remoteHost(r.RemoteAddr)
	if !isTrustedProxy(remote) {
		// Not from our proxy chain: a forwarded header here would be the client's own claim.
		return remote
	}
	values := r.Header.Values("X-Forwarded-For")
	entries := strings.Split(strings.Join(values, ","), ",")
	for i := len(entries) - 1; i >= 0; i-- {
		entry := strings.TrimSpace(entries[i])
		if entry == "" {
			continue
		}
		ip := net.ParseIP(entry)
		if ip == nil {
			// Our proxies always write plain IPs; anything else is not trusted further left either.
			break
		}
		if isTrustedProxy(entry) {
			continue
		}
		return ip.String()
	}
	return remote
}

func remoteHost(remoteAddr string) string {
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}
	return remoteAddr
}

// isTrustedProxy: only loopback. Caddy, Next.js, and the API all run on this machine (the API binds
// 127.0.0.1, AGENTS.md 3.5); private ranges are not trusted because a forged entry could use them.
func isTrustedProxy(addr string) bool {
	ip := net.ParseIP(strings.TrimSpace(addr))
	return ip != nil && ip.IsLoopback()
}
