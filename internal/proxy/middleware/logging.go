package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// loggingWriterPool recycles loggingWriter instances to eliminate per-request
// heap allocations in the logging middleware.
var loggingWriterPool = sync.Pool{
	New: func() any { return &loggingWriter{} },
}

// Logging returns a zerolog structured request/response logging middleware.
//
// Every completed request produces a single JSON log line containing:
//
//request_id    – from X-Request-ID / context
//method        – HTTP method
//path          – URL path (query string excluded for log hygiene)
//status        – HTTP status code
//latency_ms    – wall-clock duration in milliseconds (float64, 3 dp)
//bytes_out     – response body bytes written
//client_ip     – real client IP (from X-Client-IP or RemoteAddr)
//haproxy_fe    – HAProxy frontend name
//haproxy_be    – HAProxy backend name
//upstream      – upstream URL the request was forwarded to (if set)
//route_id      – matched route ID (if set)
//
// The logger instance is injected so callers can share the same zerolog.Logger
// they configured at startup (level, format, output file, etc.).
func Logging(log zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			// Borrow a writer from the pool — zero heap allocation on hot path.
			rw := loggingWriterPool.Get().(*loggingWriter)
			rw.ResponseWriter = w
			rw.status = http.StatusOK
			rw.bytesOut = 0
			rw.wroteHeader = false

			next.ServeHTTP(rw, r)

			latencyMs := float64(time.Since(start).Microseconds()) / 1000.0
			ctx := r.Context()

			// Pick up upstream / route_id injected by proxy.Handler via headers.
			upstream := rw.Header().Get("X-Flexgate-Upstream")
			routeID := rw.Header().Get("X-Flexgate-Route-ID")

			evt := log.Info().
				Str("request_id", RequestIDFromCtx(ctx)).
				Str("method", r.Method).
				Str("path", r.URL.Path).
				Int("status", rw.status).
				Float64("latency_ms", latencyMs).
				Int64("bytes_out", rw.bytesOut).
				Str("client_ip", ClientIPFromCtx(ctx)).
				Str("haproxy_fe", HAProxyFrontendFromCtx(ctx)).
				Str("haproxy_be", HAProxyBackendFromCtx(ctx))

			if upstream != "" {
				evt = evt.Str("upstream", upstream)
			}
			if routeID != "" {
				evt = evt.Str("route_id", routeID)
			}
			evt.Msg("request")

			// Return to pool — clear writer reference so the underlying
			// ResponseWriter can be GC'd before the pool entry is reused.
			rw.ResponseWriter = nil
			loggingWriterPool.Put(rw)
		})
	}
}

// loggingWriter wraps http.ResponseWriter to capture the HTTP status code
// and the number of bytes written to the response body.
type loggingWriter struct {
	http.ResponseWriter
	status      int
	bytesOut    int64
	wroteHeader bool
}

func (r *loggingWriter) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status = code
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *loggingWriter) Write(b []byte) (int, error) {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytesOut += int64(n)
	return n, err
}

// Flush implements http.Flusher so that SSE / streaming endpoints work through
// this middleware wrapper.  Delegates to the underlying ResponseWriter if it
// also implements http.Flusher; no-ops otherwise.
func (r *loggingWriter) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
