package middleware_test

import (
	"net/http/httptest"
	"testing"

	"klikumroh/internal/middleware"
)

// ClientIP must not be forgeable: entries the visitor sends in X-Forwarded-For sit on the left, our local
// proxies (Caddy, Next.js) add theirs on the right, so the address is read from the right and only
// loopback hops are skipped. A request that did not come through a local proxy ignores the header.
func TestClientIP_NotForgeable(t *testing.T) {
	// Documentation-range IPs (RFC 5737), never real visitors.
	const visitor = "198.51.100.20"
	const forged = "203.0.113.66"

	cases := []struct {
		name       string
		remoteAddr string
		xff        []string // each element is one X-Forwarded-For header line
		want       string
	}{
		{"proxy wrote the visitor (Caddy replaces the header)", "127.0.0.1:51000", []string{visitor}, visitor},
		{"forged entry on the left is ignored (proxy appends)", "127.0.0.1:51000", []string{forged + ", " + visitor}, visitor},
		{"local hops on the right are skipped (Next.js appended itself)", "127.0.0.1:51000", []string{forged + ", " + visitor + ", 127.0.0.1"}, visitor},
		{"several header lines are read as one list", "127.0.0.1:51000", []string{forged, visitor}, visitor},
		{"forged private address on the left does not win", "127.0.0.1:51000", []string{"10.0.0.5, " + visitor}, visitor},
		{"IPv6 visitor", "[::1]:51000", []string{"2001:db8::1"}, "2001:db8::1"},
		{"no header: the connection address", "127.0.0.1:51000", nil, "127.0.0.1"},
		{"only local hops: the connection address", "127.0.0.1:51000", []string{"127.0.0.1, ::1"}, "127.0.0.1"},
		{"garbage on the right stops the walk", "127.0.0.1:51000", []string{forged + ", not-an-ip"}, "127.0.0.1"},
		{"not from a local proxy: header ignored", visitor + ":51000", []string{forged}, visitor},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = c.remoteAddr
			for _, v := range c.xff {
				req.Header.Add("X-Forwarded-For", v)
			}
			if got := middleware.ClientIP(req); got != c.want {
				t.Fatalf("ClientIP = %q, want %q", got, c.want)
			}
		})
	}
}
