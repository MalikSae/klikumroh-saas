package service

import (
	"errors"
	"net"
	"testing"
)

// mapResolver answers DNS from fixed tables.
type mapResolver struct {
	cname map[string]string
	ips   map[string][]net.IP
}

func (r mapResolver) LookupCNAME(h string) (string, error) {
	if c, ok := r.cname[h]; ok {
		return c, nil
	}
	return h, nil // no CNAME: the resolver returns the name itself
}
func (r mapResolver) LookupTXT(string) ([]string, error) { return nil, errors.New("unused") }
func (r mapResolver) LookupIP(h string) ([]net.IP, error) {
	if ips, ok := r.ips[h]; ok {
		return ips, nil
	}
	return nil, errors.New("no such host")
}

func ips(list ...string) []net.IP {
	out := make([]net.IP, 0, len(list))
	for _, s := range list {
		out = append(out, net.ParseIP(s))
	}
	return out
}

// A travel that proxies the record through its own Cloudflare (orange cloud) resolves to Cloudflare edge
// addresses: that counts as pointing to the platform. Anything else still has to match.
func TestCnameOK_CloudflareProxied(t *testing.T) {
	t.Setenv("PLATFORM_IPS", "203.0.113.10")
	res := mapResolver{
		cname: map[string]string{"www.direct.com": "cname.klikumroh.id."},
		ips: map[string][]net.IP{
			"www.proxied.com":   ips("104.21.5.9", "172.67.10.2", "2606:4700:3030::6815:509"),
			"www.mixed.com":     ips("104.21.5.9", "198.51.100.7"),
			"www.elsewhere.com": ips("198.51.100.7"),
			"root.platform.com": ips("203.0.113.10"),
		},
	}
	svc := NewDomainService(nil, res).(*domainService)

	cases := []struct {
		host string
		want bool
	}{
		{"www.direct.com", true},     // CNAME to cname.klikumroh.id
		{"www.proxied.com", true},    // only Cloudflare edge addresses
		{"root.platform.com", true},  // A record to the platform server
		{"www.mixed.com", false},     // Cloudflare plus a foreign address
		{"www.elsewhere.com", false}, // some other server
		{"unknown.example", false},   // does not resolve
	}
	for _, c := range cases {
		if ok, reason := svc.cnameOK(c.host); ok != c.want {
			t.Errorf("%s: ok=%v (want %v), reason %q", c.host, ok, c.want, reason)
		}
	}
}

func TestIsCloudflareIP(t *testing.T) {
	for _, in := range []string{"104.16.0.1", "172.67.1.1", "162.159.1.1", "2606:4700::1111"} {
		if !isCloudflareIP(net.ParseIP(in)) {
			t.Errorf("%s must be a Cloudflare address", in)
		}
	}
	for _, in := range []string{"8.8.8.8", "203.0.113.10", "2001:db8::1"} {
		if isCloudflareIP(net.ParseIP(in)) {
			t.Errorf("%s must not be a Cloudflare address", in)
		}
	}
	if allCloudflare(nil) {
		t.Error("an empty list is not Cloudflare")
	}
}
