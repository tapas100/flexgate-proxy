package metrics

import (
	"net/http"
	"time"
)

// ProxyInstrumentation returns an http.Handler middleware that records
// Prometheus metrics for every request passing through the proxy.
//
// Metrics recorded:
//   - flexgate_proxy_active_requests          (gauge, incremented/decremented)
//   - flexgate_proxy_requests_total           (counter, by method/route_id/status_class/upstream_host)
//   - flexgate_proxy_request_duration_seconds (histogram, by method/route_id/status_class)
//   - flexgate_proxy_upstream_response_status_total (counter, by upstream_host/status_class)
//
// The upstream and route_id are read from response headers that the proxy
// Handler injects before calling ServeHTTP:
//
//	X-Flexgate-Route-ID    – matched route ID (empty for fallback)
//	X-Flexgate-Upstream    – full upstream URL
//
// Those headers are stripped from the response before it reaches the client.
func ProxyInstrumentation(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ActiveRequests.Inc()

		// Wrap the ResponseWriter to capture status + upstream info.
		rw := &instrumentedWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)

		ActiveRequests.Dec()
		dur := time.Since(start).Seconds()

		routeID := rw.Header().Get("X-Flexgate-Route-ID")
		upstream := rw.Header().Get("X-Flexgate-Upstream")

		// Strip internal headers — they must not reach the client.
		rw.ResponseWriter.Header().Del("X-Flexgate-Route-ID")
		rw.ResponseWriter.Header().Del("X-Flexgate-Upstream")

		sc := StatusClass(rw.status)
		upHost := UpstreamHost(upstream)

		RequestsTotal.WithLabelValues(r.Method, routeID, sc, upHost).Inc()
		RequestDuration.WithLabelValues(r.Method, routeID, sc).Observe(dur)
		UpstreamResponseStatus.WithLabelValues(upHost, sc).Inc()
	})
}

// instrumentedWriter wraps http.ResponseWriter to capture the written status
// code and to pass through the internal X-Flexgate-* headers set by the
// handler before WriteHeader is called.
type instrumentedWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (w *instrumentedWriter) WriteHeader(code int) {
	if !w.wroteHeader {
		w.status = code
		w.wroteHeader = true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *instrumentedWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}
