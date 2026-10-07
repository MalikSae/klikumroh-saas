package service

import "testing"

// Subdomain wording rules (founder decision 6 Oct 2026).
func TestSlugProblem(t *testing.T) {
	refused := []string{
		"ab", "abcdefghijabcdefghijabcdefghijk", // 2 and 31 chars
		"1travel", "-idris", "idris-", "idris--tours", "Idris",
		"app", "cname", "demo", "www", "blog", "status", "agen",
		"klikumroh", "klikumroh-jakarta", "jakarta-klikumroh", "klik-umroh-solo",
		"official", "resmi", "kemenag", "verified",
		"umroh", "umrah", "haji", "travel", "tour", "tours", "umroh-murah", "promo",
		"travel-bangsat", "anjing-tour",
		// Look-alikes and official words as parts (security audit 7 Oct 2026).
		"kli-kumroh", "klikum-roh", "klikumr0h", "kl1kumroh", "klikkumroh", "k1ikumroh-solo",
		"kemenag-resmi", "resmi-umroh", "travel-kemenag",
	}
	for _, s := range refused {
		if slugProblem(s) == "" {
			t.Errorf("slug %q must be refused", s)
		}
	}
	allowed := []string{"idris-tours", "barakah-travel", "idris-umroh", "official-tours", "travel-idris", "abc", "al-barakah-2026", "hanatours"}
	for _, s := range allowed {
		if reason := slugProblem(s); reason != "" {
			t.Errorf("slug %q must be allowed, got %q", s, reason)
		}
	}
	if len("abcdefghijabcdefghijabcdefghij") != 30 || slugProblem("abcdefghijabcdefghijabcdefghij") != "" {
		t.Errorf("a 30-character slug must be allowed")
	}
}

// slugifyTravelName gives the same subdomain as the checkout (web/lib/checkoutForm.ts).
func TestSlugifyTravelName_MatchesCheckout(t *testing.T) {
	cases := map[string]string{
		"Al-Barakah Tour & Travel": "al-barakah-tour-travel",
		"99 Tours":                 "tours",
		"Café Umroh":               "cafe-umroh",
		"  Idris  Tours  ":         "idris-tours",
		"PT Sangat Panjang Sekali Nama Travel Umroh": "pt-sangat-panjang-sekali-nama",
		"": "",
	}
	for in, want := range cases {
		if got := slugifyTravelName(in); got != want {
			t.Errorf("slugifyTravelName(%q) = %q, want %q", in, got, want)
		}
	}
}
