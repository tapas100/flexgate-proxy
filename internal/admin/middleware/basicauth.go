package middleware

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
)

// BasicAuth returns a middleware that enforces HTTP Basic Authentication.
//
// username and password are the expected credentials. When either is empty
// the middleware is bypassed (auth disabled — useful for local development).
//
// Uses constant-time comparison to prevent timing attacks.
func BasicAuth(username, password string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		// Both empty → auth disabled.
		if username == "" && password == "" {
			return next
		}

		// Pre-hash expected credentials to ensure constant-time comparison
		// independent of string length.
		expectedUser := sha256.Sum256([]byte(username))
		expectedPass := sha256.Sum256([]byte(password))

		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, p, ok := r.BasicAuth()
			if !ok {
				unauthorized(w)
				return
			}

			gotUser := sha256.Sum256([]byte(u))
			gotPass := sha256.Sum256([]byte(p))

			userMatch := subtle.ConstantTimeCompare(gotUser[:], expectedUser[:]) == 1
			passMatch := subtle.ConstantTimeCompare(gotPass[:], expectedPass[:]) == 1

			if !userMatch || !passMatch {
				unauthorized(w)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", `Basic realm="flexgate-admin"`)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
}
