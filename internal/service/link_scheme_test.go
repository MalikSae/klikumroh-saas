package service

import "testing"

// Agent referral links point to the travel website: http only on a local development host.
func TestLinkScheme(t *testing.T) {
	cases := map[string]string{
		"localhost:3000":         "http://",
		"127.0.0.1:3000":         "http://",
		"ibrahim.localhost:3000": "http://",
		"IBRAHIM.LOCALHOST":      "http://",
		"ibrahim.klikumroh.id":   "https://",
		"www.namatravel.com":     "https://",
		"localhost.evil.com":     "https://",
	}
	for host, want := range cases {
		if got := linkScheme(host); got != want {
			t.Errorf("linkScheme(%q) = %q, want %q", host, got, want)
		}
	}
}
