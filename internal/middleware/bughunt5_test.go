package middleware

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Bug hunt putaran 5: concurrent login attempts cannot exceed the lockout limit. 50 parallel wrong-password
// attempts on one account (each "checking the password" for a while, like bcrypt) get at most 5 password
// checks in total; the rest answer 429 without a check.
func TestBugHunt5_LoginLimiterConcurrentAttempts(t *testing.T) {
	l := NewLoginFailureLimiter(5, time.Minute)
	key := LoginKey("admin", "korban@example.test")
	var checks, locked int64
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			attempt, ok := l.Begin(key)
			if !ok {
				atomic.AddInt64(&locked, 1)
				return
			}
			defer attempt.Done()
			atomic.AddInt64(&checks, 1)
			time.Sleep(20 * time.Millisecond) // the bcrypt check
			attempt.Fail()
		}()
	}
	close(start)
	wg.Wait()
	t.Logf("50 concurrent wrong passwords: %d password checks, %d refused with 429", checks, locked)
	if checks > 5 {
		t.Fatalf("lockout bypassed: %d password checks ran, limit is 5", checks)
	}
	if checks+locked != 50 {
		t.Fatalf("lost attempts: %d + %d", checks, locked)
	}
	if !l.Blocked(key) {
		t.Fatal("account must be locked after 5 failures")
	}
	if _, ok := l.Begin(key); ok {
		t.Fatal("a new attempt must be refused while locked")
	}
}

// A success clears the failures; a server error (Done) releases the reservation without counting; Done
// after Fail/Succeed is a no-op; a nil limiter allows everything.
func TestBugHunt5_LoginAttemptLifecycle(t *testing.T) {
	l := NewLoginFailureLimiter(2, time.Minute)
	key := "k"
	a1, _ := l.Begin(key)
	a1.Fail()
	a1.Done() // no-op
	a2, ok := l.Begin(key)
	if !ok {
		t.Fatal("one failure of two must still allow an attempt")
	}
	if _, ok := l.Begin(key); ok {
		t.Fatal("1 failure + 1 in flight must reach the limit of 2")
	}
	a2.Done() // e.g. database error: nothing recorded
	a3, ok := l.Begin(key)
	if !ok {
		t.Fatal("a released reservation must free its slot")
	}
	a3.Succeed()
	if l.Blocked(key) || len(l.failures[key]) != 0 || l.inflight[key] != 0 {
		t.Fatalf("success must clear the key: failures=%d inflight=%d", len(l.failures[key]), l.inflight[key])
	}

	var disabled *LoginFailureLimiter
	att, ok := disabled.Begin(key)
	if !ok {
		t.Fatal("nil limiter must allow")
	}
	att.Fail()
	att.Succeed()
	att.Done()
}

// Impersonation access logs keep the parameter names but never the values of search-like parameters
// (a jamaah's name or number); other parameters such as the private file path stay as sent.
func TestBugHunt5_RedactAccessLogQuery(t *testing.T) {
	cases := map[string]string{
		"search=Siti%20Aminah&status=baru&page=2":              "search=[REDACTED]&status=baru&page=2",
		"q=0812345&phone=62812&name=Budi&email=a%40b.c&page=1": "q=[REDACTED]&phone=[REDACTED]&name=[REDACTED]&email=[REDACTED]&page=1",
		"path=%2Fuploads%2F12%2Fsubscription-proofs%2Fa.webp":  "path=%2Fuploads%2F12%2Fsubscription-proofs%2Fa.webp",
		"SEARCH=x":    "SEARCH=[REDACTED]",
		"search=":     "search=",
		"status=baru": "status=baru",
		"":            "",
	}
	for in, want := range cases {
		if got := redactAccessLogQuery(in); got != want {
			t.Errorf("redactAccessLogQuery(%q) = %q, want %q", in, got, want)
		}
	}
}

// Every JSON body is capped at the limit (a decoder reading it fails instead of buffering it whole); a
// declared oversize body is answered 413 before the handler; multipart uses its own (higher) limit.
func TestBugHunt5_BodySizeLimit(t *testing.T) {
	var decodeErr error
	var readBytes int
	h := BodySizeLimit(1024, 4096)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/") {
			b, err := io.ReadAll(r.Body)
			readBytes, decodeErr = len(b), err
		} else {
			var v map[string]string
			decodeErr = json.NewDecoder(r.Body).Decode(&v)
		}
		w.WriteHeader(http.StatusOK)
	}))

	big := `{"email":"a","password":"` + strings.Repeat("x", 5000) + `"}`
	// Declared length over the limit: refused up front.
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(big)))
	t.Logf("declared 5 KB JSON body, limit 1 KB: status %d", rr.Code)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", rr.Code)
	}
	// Unknown length (chunked): the decoder hits the limit.
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", io.NopCloser(strings.NewReader(big)))
	req.ContentLength = -1
	decodeErr = nil
	h.ServeHTTP(httptest.NewRecorder(), req)
	t.Logf("chunked 5 KB JSON body: decode error %v", decodeErr)
	if decodeErr == nil {
		t.Fatal("expected the decoder to fail on a body over the limit")
	}
	// Small JSON passes.
	decodeErr = nil
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"a"}`)))
	if decodeErr != nil {
		t.Fatalf("small body must decode: %v", decodeErr)
	}
	// Multipart: 3 KB passes under its own 4 KB limit (the JSON limit does not apply).
	mp := httptest.NewRequest(http.MethodPost, "/upload", io.NopCloser(strings.NewReader(strings.Repeat("y", 3000))))
	mp.ContentLength = -1
	mp.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	h.ServeHTTP(httptest.NewRecorder(), mp)
	if decodeErr != nil || readBytes != 3000 {
		t.Fatalf("multipart under its limit must pass, read %d err %v", readBytes, decodeErr)
	}
}
