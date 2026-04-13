package middleware

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/security"
)

// SSRFValidation returns a middleware that calls the Rust security sidecar to
// validate the upstream URL before the proxy forwards any request.
//
// Behaviour:
//   - allowed  → call next handler unchanged
//   - blocked  → respond 403 with a structured JSON body; request is not forwarded
//   - sidecar unreachable / timeout → fail-open (allow)
//
// The upstream URL to validate is read from the "X-Flexgate-Upstream" header,
// which the proxy handler sets immediately after route resolution.  If the
// header is absent (e.g. during a health check) the middleware passes through.
//
// The middleware itself never blocks the caller for more than the 2 ms timeout
// baked into the security.HTTPClient.
func SSRFValidation(client security.Client, log zerolog.Logger) func(http.Handler) http.Handler {
	if client == nil {
		return func(next http.Handler) http.Handler { return next }
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			upstream := r.Header.Get("X-Flexgate-Upstream-Validate")
			if upstream == "" {
				// No upstream to validate (e.g. admin plane, health probes).
				next.ServeHTTP(w, r)
				return
			}
			// Remove the internal routing header before the request is forwarded.
			r.Header.Del("X-Flexgate-Upstream-Validate")

			requestID := RequestIDFromCtx(r.Context())
			clientIP := extractClientIP(r)

			result, err := client.Validate(r.Context(), upstream, clientIP)
			if err != nil {
				// Fail-open: log at debug and continue.
				log.Debug().
					Err(err).
					Str("request_id", requestID).
					Str("upstream", upstream).
					Msg("ssrf: sidecar unreachable — fail-open")
				next.ServeHTTP(w, r)
				return
			}

			log.Debug().
				Str("request_id", requestID).
				Str("upstream", upstream).
				Bool("allowed", result.Allowed).
				Str("reason", result.Reason).
				Strs("resolved_ips", result.ResolvedIPs).
				Msg("ssrf: validation result")

			if !result.Allowed {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error":      "upstream blocked by SSRF policy",
					"reason":     result.Reason,
					"request_id": requestID,
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// extractClientIP is a local copy of the realIP logic so the middleware
// package does not import the proxy package (avoid import cycle).
func extractClientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		for i := 0; i < len(ip); i++ {
			if ip[i] == ',' {
				return strings.TrimSpace(ip[:i])
			}
		}
		return strings.TrimSpace(ip)
	}
	return r.RemoteAddr
}
