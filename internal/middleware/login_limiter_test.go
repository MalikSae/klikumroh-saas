package middleware

import (
	"testing"
	"time"
)

// A5: failed logins lock the account key after the limit, independent of IP; success resets it.
func TestLoginFailureLimiter(t *testing.T) {
	l := NewLoginFailureLimiter(5, time.Minute)
	key := LoginKey("4692", " Agen@Example.test ")
	if key != LoginKey("4692", "agen@example.test") {
		t.Fatalf("key must be case-insensitive and trimmed, got %q", key)
	}
	for i := 0; i < 5; i++ {
		if l.Blocked(key) {
			t.Fatalf("blocked after only %d failures", i)
		}
		l.Fail(key)
	}
	if !l.Blocked(key) {
		t.Fatal("expected key blocked after 5 failures")
	}
	if l.Blocked(LoginKey("4693", "agen@example.test")) {
		t.Fatal("another travel's account must not be blocked")
	}
	l.Reset(key)
	if l.Blocked(key) {
		t.Fatal("expected key unblocked after reset")
	}

	short := NewLoginFailureLimiter(1, 50*time.Millisecond)
	short.Fail("k")
	if !short.Blocked("k") {
		t.Fatal("expected blocked inside the window")
	}
	time.Sleep(80 * time.Millisecond)
	if short.Blocked("k") {
		t.Fatal("expected unblocked after the window")
	}
}
