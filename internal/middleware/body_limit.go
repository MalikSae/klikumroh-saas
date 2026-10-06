package middleware

import (
	"net/http"
	"strings"
)

// MaxJSONBodyBytes caps every non-multipart request body (JSON, form-urlencoded, anything else).
const MaxJSONBodyBytes int64 = 1 << 20 // 1 MB

// MaxMultipartBodyBytes is a global ceiling for multipart uploads. Each upload handler applies its own,
// smaller limit (5-10 MB plus envelope); this only stops a route that forgot to.
const MaxMultipartBodyBytes int64 = 16 << 20 // 16 MB

// BodySizeLimit wraps every request body with http.MaxBytesReader (bug hunt putaran 5): without it a
// json.NewDecoder(r.Body) on any endpoint, including unauthenticated ones such as login and signup, would
// buffer a body of any size and could exhaust the memory of the single API serving every travel. A body
// over the limit makes the decoder fail, so the handler answers its usual 400 for an invalid body.
func BodySizeLimit(jsonLimit, multipartLimit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil && r.Body != http.NoBody {
				limit := jsonLimit
				if strings.HasPrefix(strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))), "multipart/") {
					limit = multipartLimit
				}
				if r.ContentLength > limit {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusRequestEntityTooLarge)
					_, _ = w.Write([]byte(`{"error":"Ukuran data terlalu besar."}`))
					return
				}
				r.Body = http.MaxBytesReader(w, r.Body, limit)
			}
			next.ServeHTTP(w, r)
		})
	}
}
