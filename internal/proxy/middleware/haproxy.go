// Package middleware provides HTTP middleware for the FlexGate proxy server.
package middleware

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

// ctxKeyRequestID is an unexported context key to avoid collisions.
type ctxKeyRequestID struct{}

// ctxKeyClientIP is an unexported context key for the real client IP.
type ctxKeyClientIP struct{}

// ctxKeyHAProxyFrontend is an unexported context key for the HAProxy frontend name.
type ctxKeyHAProxyFrontend struct{}

// ctxKeyHAProxyBackend is an unexported context key for the HAProxy backend name.
type ctxKeyHAProxyBackend struct{}

const (
	headerRequestID       = "X-Request-ID"
	headerClientIP        = "X-Client-IP"
	headerHAProxyFrontend = "X-HAProxy-Frontend"
	headerHAProxyBackend  = "X-HAProxy-Backend"
)

// HAProxy is a middleware that reads the headers HAProxy injects on every
// request and stores them in the request context for downstream handlers.
//
// Headers consumed:
//
//	X-Request-ID       – unique request identifier (generated here if absent)
//	X-Client-IP        – real client IP after TLS termination
//	X-HAProxy-Frontend – name of the HAProxy frontend that accepted the connection
//	X-HAProxy-Backend  – name of the HAProxy backend this worker belongs to
//
// If X-Request-ID is absent (direct connection bypassing HAProxy, or test
// traffic) a new UUID v4 is generated and added to both the context and the
// outgoing response headers.
func HAProxy(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		// ── X-Request-ID ──────────────────────────────────────────────────────
		requestID := r.Header.Get(headerRequestID)
		if requestID == "" {
			requestID = uuid.New().String()
		}
		// Propagate to the response so clients can correlate.
		w.Header().Set(headerRequestID, requestID)
		ctx = context.WithValue(ctx, ctxKeyRequestID{}, requestID)

		// ── X-Client-IP ───────────────────────────────────────────────────────
		clientIP := r.Header.Get(headerClientIP)
		if clientIP == "" {
			// Fall back to RemoteAddr when the request does not come through HAProxy.
			clientIP = r.RemoteAddr
		}
		ctx = context.WithValue(ctx, ctxKeyClientIP{}, clientIP)

		// ── X-HAProxy-Frontend ────────────────────────────────────────────────
		ctx = context.WithValue(ctx, ctxKeyHAProxyFrontend{}, r.Header.Get(headerHAProxyFrontend))

		// ── X-HAProxy-Backend ─────────────────────────────────────────────────
		ctx = context.WithValue(ctx, ctxKeyHAProxyBackend{}, r.Header.Get(headerHAProxyBackend))

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequestIDFromCtx returns the request ID stored in the context.
// Returns an empty string if none was set.
func RequestIDFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(ctxKeyRequestID{}).(string)
	return v
}

// ClientIPFromCtx returns the real client IP stored in the context.
func ClientIPFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(ctxKeyClientIP{}).(string)
	return v
}

// HAProxyFrontendFromCtx returns the HAProxy frontend name stored in the context.
func HAProxyFrontendFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(ctxKeyHAProxyFrontend{}).(string)
	return v
}

// HAProxyBackendFromCtx returns the HAProxy backend name stored in the context.
func HAProxyBackendFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(ctxKeyHAProxyBackend{}).(string)
	return v
}
