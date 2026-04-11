// Package middleware provides HTTP middleware for the FlexGate proxy server.
package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/flexgate/proxy/internal/config"
)

// Security returns an HTTP middleware that:
//
//  1. Sets defensive response headers on every reply (HSTS, X-Frame-Options,
//     X-Content-Type-Options, Referrer-Policy, Permissions-Policy,
//     Content-Security-Policy, X-XSS-Protection).
//
//  2. Validates the incoming request:
//     - Rejects oversized request bodies (413).
//     - Rejects disallowed HTTP methods (405) when AllowedMethods is set.
//     - Blocks requests whose User-Agent contains a forbidden substring (403).
//
// If SecurityConfig.Enabled is false the middleware is a no-op pass-through,
// which is useful during local development.
func Security(cfg config.SecurityConfig) func(http.Handler) http.Handler {
	if !cfg.Enabled {
		return func(next http.Handler) http.Handler { return next }
	}

	// Pre-build the HSTS header value once at construction time.
	hstsValue := ""
	if cfg.HSTSMaxAgeSec > 0 {
		hstsValue = fmt.Sprintf("max-age=%d", cfg.HSTSMaxAgeSec)
		if cfg.HSTSIncludeSubDomains {
			hstsValue += "; includeSubDomains"
		}
		hstsValue += "; preload"
	}

	// Pre-build a fast lookup set for allowed methods.
	allowedMethods := make(map[string]struct{}, len(cfg.AllowedMethods))
	for _, m := range cfg.AllowedMethods {
		allowedMethods[strings.ToUpper(m)] = struct{}{}
	}

	// Lower-case all blocked user-agent fragments for case-insensitive matching.
	blockedUAs := make([]string, len(cfg.BlockUserAgents))
	for i, ua := range cfg.BlockUserAgents {
		blockedUAs[i] = strings.ToLower(ua)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

			// ── request validation ────────────────────────────────────────────

			// Block forbidden user-agents (scanners, bots, crawlers).
			if len(blockedUAs) > 0 {
				uaLower := strings.ToLower(r.Header.Get("User-Agent"))
				for _, blocked := range blockedUAs {
					if strings.Contains(uaLower, blocked) {
						http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
						return
					}
				}
			}

			// Reject disallowed HTTP methods.
			if len(allowedMethods) > 0 {
				if _, ok := allowedMethods[r.Method]; !ok {
					w.Header().Set("Allow", buildAllow(cfg.AllowedMethods))
					http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
					return
				}
			}

			// Clamp request body to prevent memory exhaustion attacks.
			// r.ContentLength == -1 means unknown length; we still wrap the
			// body reader so that the total bytes consumed is bounded.
			if cfg.MaxRequestBodyBytes > 0 && r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, cfg.MaxRequestBodyBytes)
			}

			// ── security response headers ─────────────────────────────────────
			// These are set now (before next.ServeHTTP) so that even error
			// responses from downstream handlers carry the security headers.

			h := w.Header()

			// HSTS — only meaningful over HTTPS; omit header when max-age is 0.
			if hstsValue != "" {
				h.Set("Strict-Transport-Security", hstsValue)
			}

			// Prevent clickjacking.
			h.Set("X-Frame-Options", "DENY")

			// Prevent MIME-type sniffing.
			h.Set("X-Content-Type-Options", "nosniff")

			// Limit referrer leakage.
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")

			// Disable legacy XSS filter (modern browsers ignore it; old browsers
			// could be exploited by it).
			h.Set("X-XSS-Protection", "0")

			// Restrictive CSP for API gateway responses (no HTML, no scripts).
			h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")

			// Permissions policy — disable all browser features.
			h.Set("Permissions-Policy",
				"accelerometer=(), camera=(), geolocation=(), gyroscope=(), "+
					"magnetometer=(), microphone=(), payment=(), usb=()")

			// Remove fingerprinting headers added by upstream servers.
			h.Del("X-Powered-By")
			h.Del("Server")

			next.ServeHTTP(w, r)
		})
	}
}

// buildAllow returns a comma-separated Allow header value from a list of methods.
func buildAllow(methods []string) string {
	upper := make([]string, len(methods))
	for i, m := range methods {
		upper[i] = strings.ToUpper(m)
	}
	return strings.Join(upper, ", ")
}
