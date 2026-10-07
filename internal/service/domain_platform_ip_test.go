package service

import (
	"errors"
	"net"
	"testing"
	"time"
)

// countingResolver answers cname.klikumroh.id with ips (or err) and counts the lookups.
type countingResolver struct {
	ips   []net.IP
	err   error
	calls int
}

func (r *countingResolver) LookupCNAME(host string) (string, error) { return "", errors.New("unused") }
func (r *countingResolver) LookupTXT(host string) ([]string, error) { return nil, errors.New("unused") }
func (r *countingResolver) LookupIP(host string) ([]net.IP, error) {
	r.calls++
	return r.ips, r.err
}

// PlatformIPs looks the platform address up once per TTL instead of on every request (the Domain tab
// waited for DNS on each visit), and remembers a failed lookup only briefly.
func TestPlatformIPs_CachesLookup(t *testing.T) {
	t.Setenv("PLATFORM_IPS", "")
	now := time.Date(2026, 10, 6, 10, 0, 0, 0, time.UTC)

	t.Run("resolved addresses are reused for 10 minutes", func(t *testing.T) {
		res := &countingResolver{ips: []net.IP{net.ParseIP("203.0.113.10")}}
		svc := NewDomainService(nil, res).(*domainService)
		clock := now
		svc.SetClock(func() time.Time { return clock })

		for i := 0; i < 5; i++ {
			if got := svc.PlatformIPs(); len(got) != 1 || got[0] != "203.0.113.10" {
				t.Fatalf("unexpected addresses %v", got)
			}
		}
		if res.calls != 1 {
			t.Fatalf("expected 1 DNS lookup for 5 calls, got %d", res.calls)
		}

		res.ips = []net.IP{net.ParseIP("203.0.113.20")}
		clock = now.Add(10*time.Minute + time.Second)
		if got := svc.PlatformIPs(); len(got) != 1 || got[0] != "203.0.113.20" {
			t.Fatalf("after the TTL the new server address must be used, got %v", got)
		}
		if res.calls != 2 {
			t.Fatalf("expected a fresh lookup after the TTL, got %d lookups", res.calls)
		}
	})

	t.Run("a failed lookup is retried after 1 minute", func(t *testing.T) {
		res := &countingResolver{err: errors.New("no such host")}
		svc := NewDomainService(nil, res).(*domainService)
		clock := now
		svc.SetClock(func() time.Time { return clock })

		if got := svc.PlatformIPs(); got != nil {
			t.Fatalf("failed lookup must give no addresses, got %v", got)
		}
		svc.PlatformIPs()
		if res.calls != 1 {
			t.Fatalf("a failure must not be retried on every request, got %d lookups", res.calls)
		}

		res.err, res.ips = nil, []net.IP{net.ParseIP("203.0.113.10")}
		clock = now.Add(time.Minute + time.Second)
		if got := svc.PlatformIPs(); len(got) != 1 {
			t.Fatalf("after 1 minute the lookup must be retried, got %v", got)
		}
	})

	t.Run("PLATFORM_IPS skips DNS entirely", func(t *testing.T) {
		t.Setenv("PLATFORM_IPS", "198.51.100.1, 198.51.100.2")
		res := &countingResolver{}
		svc := NewDomainService(nil, res).(*domainService)
		if got := svc.PlatformIPs(); len(got) != 2 || res.calls != 0 {
			t.Fatalf("expected the two env addresses without DNS, got %v (%d lookups)", got, res.calls)
		}
	})
}
