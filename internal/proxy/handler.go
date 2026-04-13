package proxy

import (
	"context"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/intelligence"
	"github.com/flexgate/proxy/internal/metrics"
	"github.com/flexgate/proxy/internal/proxy/middleware"
	"github.com/flexgate/proxy/internal/security"
)

// defaultUpstreamTimeout is used when a route has no per-route timeout set
// and the request context carries no deadline.
const defaultUpstreamTimeout = 30 * time.Second

// Pre-built JSON error bodies — allocated once at startup, never modified.
// Avoids encoding/json + buffer allocation on every error response.
var (
	errBodyNoRoute    = []byte(`{"error":"no upstream found for this route"}`)
	errBodyRateLimit  = []byte(`{"error":"rate limit exceeded"}`)
	errBodyForbidden  = []byte(`{"error":"forbidden"}`)
	errBodySSRF       = []byte(`{"error":"upstream blocked by SSRF policy"}`)
	errBodyBadGateway = []byte(`{"error":"upstream error"}`)
	errBodyTimeout    = []byte(`{"error":"upstream timeout"}`)
	errBodyInvalidURL = []byte(`{"error":"invalid upstream URL"}`)
)

// Handler is the core reverse proxy handler.
//
// It resolves an upstream from the RouteCache on every request (zero DB hits
// on the hot path), builds an httputil.ReverseProxy with per-request Director
// and ErrorHandler closures, and forwards the request.
//
// If no route matches and a fallbackUpstream is configured, the request is
// forwarded there. If no fallback is configured, 502 is returned.
type Handler struct {
	cache            *RouteCache
	fallbackUpstream string // optional, from config
	transport        http.RoundTripper
	bufPool          *ProxyBufferPool // reused copy buffers for ReverseProxy
	intel            intelligence.Client
	sec              security.Client // SSRF validation sidecar; never nil (NoopClient when disabled)
	log              zerolog.Logger
}

// NewHandler creates a Handler. fallbackUpstream may be empty.
// intel must not be nil; use intelligence.New() which returns a NoopClient
// when no intelligence URL is configured.
// sec must not be nil; use security.NewClient("") for a NoopClient when the
// Rust sidecar is not configured.
func NewHandler(cache *RouteCache, fallbackUpstream string, intel intelligence.Client, sec security.Client, log zerolog.Logger) *Handler {
	return &Handler{
		cache:            cache,
		fallbackUpstream: fallbackUpstream,
		transport:        buildTransport(),
		bufPool:          NewProxyBufferPool(),
		intel:            intel,
		sec:              sec,
		log:              log,
	}
}

// ServeHTTP implements http.Handler.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requestID := middleware.RequestIDFromCtx(ctx)
	start := time.Now()

	// ── route resolution ──────────────────────────────────────────────────────
	route := h.cache.Resolve(r.Method, r.URL.Path)

	var (
		upstream    string
		stripPrefix string
		addHeaders  map[string]string
		timeout     = defaultUpstreamTimeout
		routeID     string
	)

	if route != nil {
		upstream = route.Upstream
		stripPrefix = route.StripPrefix
		addHeaders = route.AddHeaders
		routeID = route.ID
		if route.Timeout > 0 {
			timeout = route.Timeout
		}

		h.log.Debug().
			Str("request_id", requestID).
			Str("route_id", route.ID).
			Str("upstream", upstream).
			Str("path", r.URL.Path).
			Msg("proxy: route matched")
	} else if h.fallbackUpstream != "" {
		upstream = h.fallbackUpstream
		h.log.Debug().
			Str("request_id", requestID).
			Str("upstream", upstream).
			Str("path", r.URL.Path).
			Msg("proxy: no route matched, using fallback upstream")
	} else {
		h.log.Warn().
			Str("request_id", requestID).
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Msg("proxy: no route matched")

		writeJSON(w, http.StatusBadGateway, errBodyNoRoute)
		return
	}

	clientIP := realIP(r)

	// ── intelligence: rate-limit check ────────────────────────────────────────
	rlResult := h.intel.RateLimit(ctx, intelligence.RateLimitRequest{
		ClientIP: clientIP,
		RouteID:  routeID,
		Method:   r.Method,
		Path:     r.URL.Path,
	})
	if !rlResult.Allowed {
		h.log.Warn().
			Str("request_id", requestID).
			Str("client_ip", clientIP).
			Str("route_id", routeID).
			Int("retry_after_ms", rlResult.RetryAfterMs).
			Msg("proxy: rate limit exceeded")

		metrics.IntelligenceRateLimitDenied.Inc()

		w.Header().Set("Content-Type", "application/json")
		if rlResult.RetryAfterMs > 0 {
			// Format inline — avoids fmt.Sprintf allocation.
			ms := rlResult.RetryAfterMs
			buf := AcquireBuffer()
			writeDecimal(buf, ms)
			w.Header().Set("Retry-After", buf.String())
			ReleaseBuffer(buf)
		}
		writeJSON(w, http.StatusTooManyRequests, errBodyRateLimit)
		return
	}

	// ── intelligence: auth check ──────────────────────────────────────────────
	token := extractBearerToken(r)
	if token != "" {
		authResult := h.intel.Auth(ctx, intelligence.AuthRequest{
			Token:    token,
			RouteID:  routeID,
			ClientIP: clientIP,
		})
		if !authResult.Valid {
			h.log.Warn().
				Str("request_id", requestID).
				Str("client_ip", clientIP).
				Str("route_id", routeID).
				Msg("proxy: auth rejected")

			metrics.IntelligenceAuthDenied.Inc()

			writeJSON(w, http.StatusForbidden, errBodyForbidden)
			return
		}
		if authResult.Subject != "" {
			r.Header.Set("X-Auth-Subject", authResult.Subject)
		}
	}

	// ── parse upstream URL ────────────────────────────────────────────────────
	targetURL, err := url.Parse(upstream)
	if err != nil {
		h.log.Error().Err(err).Str("upstream", upstream).Msg("proxy: invalid upstream URL")
		writeJSON(w, http.StatusInternalServerError, errBodyInvalidURL)
		return
	}

	// ── SSRF validation ───────────────────────────────────────────────────────
	// Call the Rust security sidecar with a 2 ms hard budget.  The client is
	// fail-open: a timeout or unreachable sidecar returns allowed=true so the
	// proxy never stalls.  A blocked result stops the request here with 403.
	{
		valCtx, valCancel := context.WithTimeout(ctx, 2*time.Millisecond)
		result, valErr := h.sec.Validate(valCtx, upstream, clientIP)
		valCancel()

		if valErr != nil {
			// Fail-open — log at debug so operators can detect sidecar outages
			// without impacting proxy SLA.
			h.log.Debug().
				Err(valErr).
				Str("request_id", requestID).
				Str("upstream", upstream).
				Msg("proxy: ssrf sidecar unreachable — fail-open")
		} else {
			h.log.Debug().
				Str("request_id", requestID).
				Str("upstream", upstream).
				Bool("allowed", result.Allowed).
				Str("reason", result.Reason).
				Strs("resolved_ips", result.ResolvedIPs).
				Msg("proxy: ssrf validation")

			if !result.Allowed {
				h.log.Warn().
					Str("request_id", requestID).
					Str("upstream", upstream).
					Str("client_ip", clientIP).
					Str("reason", result.Reason).
					Msg("proxy: upstream blocked by SSRF policy")

				writeJSON(w, http.StatusForbidden, errBodySSRF)
				return
			}
		}
	}

	// ── per-route timeout ─────────────────────────────────────────────────────
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	r = r.WithContext(timeoutCtx)

	// ── inject observability headers ─────────────────────────────────────────
	// Written to the *response* header map so that ProxyInstrumentation and
	// Logging middleware (which wrap this handler) can read them back. They are
	// stripped from the downstream response in ModifyResponse and in
	// ProxyInstrumentation before any byte is sent to the client.
	w.Header().Set("X-Flexgate-Route-ID", routeID)
	w.Header().Set("X-Flexgate-Upstream", upstream)

	// ── build reverse proxy ───────────────────────────────────────────────────
	rp := &httputil.ReverseProxy{
		Director:       h.buildDirector(targetURL, stripPrefix, addHeaders, requestID),
		Transport:      h.transport,
		BufferPool:     h.bufPool, // reuse 32 KiB copy buffers — eliminates per-request heap alloc
		ErrorHandler:   h.buildErrorHandler(requestID, upstream),
		ModifyResponse: h.buildModifyResponse(),
	}

	// Borrow a ResponseWriter from the pool to avoid a heap allocation.
	rw := AcquireResponseWriter(w)
	rp.ServeHTTP(rw, r)

	// ── intelligence: record request (fire-and-forget) ────────────────────────
	h.intel.RecordRequest(intelligence.RequestEvent{
		RequestID: requestID,
		Method:    r.Method,
		Path:      r.URL.Path,
		Status:    rw.Status,
		LatencyMs: time.Since(start).Milliseconds(),
		ClientIP:  clientIP,
		Upstream:  upstream,
		RouteID:   routeID,
		Timestamp: start,
		BytesOut:  rw.Written,
	})

	ReleaseResponseWriter(rw)
}

// buildDirector returns a Director function that rewrites the outbound request.
//
// Director responsibilities:
//  1. Set Scheme + Host from the upstream URL
//  2. Strip path prefix if configured
//  3. Merge upstream base path with the (optionally stripped) request path
//  4. Inject additional headers from the route config
//  5. Set X-Forwarded-* headers
//  6. Set X-Request-ID so upstream can correlate
func (h *Handler) buildDirector(
	target *url.URL,
	stripPrefix string,
	addHeaders map[string]string,
	requestID string,
) func(*http.Request) {
	return func(req *http.Request) {
		// Preserve the original scheme and host for X-Forwarded-* headers
		// before overwriting them.
		if req.Header.Get("X-Forwarded-Host") == "" {
			req.Header.Set("X-Forwarded-Host", req.Host)
		}
		if req.Header.Get("X-Forwarded-Proto") == "" {
			scheme := "http"
			if req.TLS != nil {
				scheme = "https"
			}
			req.Header.Set("X-Forwarded-Proto", scheme)
		}

		// ── upstream host ─────────────────────────────────────────────────────
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		req.Host = target.Host

		// ── path rewrite ──────────────────────────────────────────────────────
		requestPath := req.URL.Path
		if stripPrefix != "" && strings.HasPrefix(requestPath, stripPrefix) {
			requestPath = requestPath[len(stripPrefix):]
			if requestPath == "" {
				requestPath = "/"
			}
		}

		// Merge upstream base path with (stripped) request path.
		// e.g. upstream = "https://svc.internal/v2", path = "/users/1"
		//      → https://svc.internal/v2/users/1
		if target.Path != "" {
			requestPath = strings.TrimRight(target.Path, "/") + "/" + strings.TrimLeft(requestPath, "/")
		}
		req.URL.Path = requestPath
		req.URL.RawPath = "" // let net/url re-encode

		// ── inject request ID ─────────────────────────────────────────────────
		req.Header.Set("X-Request-ID", requestID)

		// ── inject route-level headers ────────────────────────────────────────
		for k, v := range addHeaders {
			req.Header.Set(k, v)
		}
	}
}

// buildErrorHandler returns an ErrorHandler that logs upstream errors and
// returns a structured JSON 502/504.
func (h *Handler) buildErrorHandler(requestID, upstream string) func(http.ResponseWriter, *http.Request, error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		status := http.StatusBadGateway
		body := errBodyBadGateway

		// Distinguish timeout from connection refused.
		if isTimeout(err) {
			status = http.StatusGatewayTimeout
			body = errBodyTimeout
		}

		h.log.Error().
			Err(err).
			Str("request_id", requestID).
			Str("upstream", upstream).
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Int("status", status).
			Msg("proxy: upstream error")

		writeJSON(w, status, body)
	}
}

// buildModifyResponse strips headers that should not be forwarded downstream.
func (h *Handler) buildModifyResponse() func(*http.Response) error {
	return func(resp *http.Response) error {
		// Never let the upstream dictate CORS; the proxy owns that (Phase 1 cors.go).
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		resp.Header.Del("Access-Control-Allow-Credentials")

		// Internal observability headers must not leak to downstream clients.
		// ProxyInstrumentation reads them from the upstream writer's Header()
		// map (set before rp.ServeHTTP) and then strips them independently;
		// we also strip from the upstream response for defence-in-depth.
		resp.Header.Del("X-Flexgate-Route-ID")
		resp.Header.Del("X-Flexgate-Upstream")
		return nil
	}
}

// buildTransport returns a tuned http.Transport for a high-throughput
// reverse proxy.
//
// Tuning rationale:
//   - MaxIdleConns 2000 / MaxIdleConnsPerHost 256 — large enough to saturate
//     ~10 upstream hosts at 40 K RPS without waiting for new TCP handshakes.
//     The previous 100/host caused head-of-line blocking at high concurrency.
//   - MaxConnsPerHost 512 — caps per-host concurrency to prevent upstream
//     overload while still allowing burst absorption.
//   - IdleConnTimeout 90s — keep idle connections warm; upstream load
//     balancers typically close after 120 s so this stays safe.
//   - TLSHandshakeTimeout 5s / DialTimeout 5s — unchanged; aggressive but
//     acceptable for a same-DC deployment.
//   - DisableCompression true — proxy should not decompress; pass-through as-is.
//   - ForceAttemptHTTP2 true — negotiate H/2 with upstreams that support it;
//     reduces TCP connection count at the cost of a small per-stream overhead.
func buildTransport() http.RoundTripper {
	return &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		MaxIdleConns:          2000,
		MaxIdleConnsPerHost:   256,
		MaxConnsPerHost:       512,
		IdleConnTimeout:       90 * time.Second,
		DisableCompression:    true,
		ForceAttemptHTTP2:     true,
	}
}

// writeJSON writes a pre-built JSON body with the given status code.
// It sets Content-Type and avoids any encoder allocation.
func writeJSON(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// writeDecimal appends the decimal representation of n (milliseconds)
// as a "seconds.millis" string to buf — avoids fmt.Sprintf.
func writeDecimal(buf interface{ WriteByte(byte) error; WriteString(string) (int, error) }, ms int) {
	sec := ms / 1000
	frac := ms % 1000
	// Write integer seconds.
	if sec == 0 {
		_ = buf.WriteByte('0')
	} else {
		writeInt(buf, sec)
	}
	_ = buf.WriteByte('.')
	// Always three decimal places.
	if frac < 100 {
		_ = buf.WriteByte('0')
	}
	if frac < 10 {
		_ = buf.WriteByte('0')
	}
	writeInt(buf, frac)
}

func writeInt(buf interface{ WriteByte(byte) error }, n int) {
	if n == 0 {
		_ = buf.WriteByte('0')
		return
	}
	var tmp [10]byte
	i := len(tmp)
	for n > 0 {
		i--
		tmp[i] = byte('0' + n%10)
		n /= 10
	}
	for ; i < len(tmp); i++ {
		_ = buf.WriteByte(tmp[i])
	}
}

// isTimeout returns true if err is a context deadline / timeout error.
func isTimeout(err error) bool {
	if err == nil {
		return false
	}
	if err == context.DeadlineExceeded {
		return true
	}
	netErr, ok := err.(net.Error)
	return ok && netErr.Timeout()
}

// realIP extracts the client IP from the request. It prefers X-Real-IP (set
// by HAProxy) and falls back to RemoteAddr.
func realIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		// X-Forwarded-For may be a comma-separated list; take the first entry.
		if idx := strings.IndexByte(ip, ','); idx >= 0 {
			return strings.TrimSpace(ip[:idx])
		}
		return strings.TrimSpace(ip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// extractBearerToken returns the token from an "Authorization: Bearer <token>"
// header, or an empty string if the header is absent or malformed.
func extractBearerToken(r *http.Request) string {
	const prefix = "Bearer "
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, prefix) {
		return auth[len(prefix):]
	}
	return ""
}
