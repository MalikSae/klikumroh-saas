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

func getClientIP(r *http.Request) string {
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}
