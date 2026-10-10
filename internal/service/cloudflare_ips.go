package service

import "net"

// cloudflareRanges are Cloudflare's published edge networks (https://www.cloudflare.com/ips/). A travel
// whose domain sits on its own Cloudflare account with the record proxied (orange cloud) resolves to these
// addresses instead of to the platform server: Cloudflare terminates TLS for the travel's domain and
// forwards the request to cname.klikumroh.id. The list changes rarely; update it from the page above.
var cloudflareRanges = mustParseCIDRs(
	// IPv4
	"173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
	"108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
	"162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
	// IPv6
	"2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
	"2a06:98c0::/29", "2c0f:f248::/32",
)

func mustParseCIDRs(cidrs ...string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		_, n, err := net.ParseCIDR(c)
		if err != nil {
			panic("cloudflare range " + c + ": " + err.Error())
		}
		out = append(out, n)
	}
	return out
}

// isCloudflareIP reports whether ip belongs to a Cloudflare edge network.
func isCloudflareIP(ip net.IP) bool {
	for _, n := range cloudflareRanges {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// allCloudflare reports whether addrs is not empty and every address is a Cloudflare edge address.
func allCloudflare(addrs []net.IP) bool {
	if len(addrs) == 0 {
		return false
	}
	for _, ip := range addrs {
		if !isCloudflareIP(ip) {
			return false
		}
	}
	return true
}
