package middleware

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

// RequestID is a standalone middleware that ensures every request carries a
// unique X-Request-ID. It should be placed AFTER the HAProxy middleware in the
// chain so that HAProxy-injected IDs are preferred; RequestID then acts as a
// safety net for requests that arrive without one (direct calls, tests, etc.).
//
// When used together with the HAProxy middleware the effective behaviour is:
//
//	HAProxy injects X-Request-ID      → HAProxy middleware stores it in ctx
//	No X-Request-ID (direct call)     → HAProxy middleware generates UUID,
//	                                    RequestID middleware is a no-op
//
// The middleware can also be used standalone (without the HAProxy middleware)
// in unit tests or when HAProxy is bypassed.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		// Re-use the ID already stored by the HAProxy middleware if present.
		if RequestIDFromCtx(ctx) != "" {
			next.ServeHTTP(w, r)
			return
		}

		// Fallback: generate a new UUID and store it.
		id := r.Header.Get(headerRequestID)
		if id == "" {
			id = uuid.New().String()
		}
		w.Header().Set(headerRequestID, id)
		ctx = context.WithValue(ctx, ctxKeyRequestID{}, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
