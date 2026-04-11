package proxy

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/config"
	"github.com/flexgate/proxy/internal/metrics"
	"github.com/flexgate/proxy/internal/proxy/middleware"
)

// NewRouter wires the complete chi router for the proxy plane.
//
// Middleware chain (outermost → innermost):
//
//	Recovery              – catches panics, returns 500
//	Security              – security headers + request validation
//	HAProxy               – reads X-Request-ID, X-Client-IP, X-HAProxy-* into context
//	RequestID             – generates UUID if HAProxy did not inject one
//	RealIP                – normalises RemoteAddr from proxy headers
//	ProxyInstrumentation  – records Prometheus metrics per request
//	Logging               – zerolog structured request/response log line
//
// Routes:
//
//	GET  /health    → healthHandler        (HAProxy health check, unauthenticated)
//	GET  /metrics   → Prometheus handler   (metrics scrape endpoint)
//	     /*         → proxy Handler        (all other traffic)
func NewRouter(handler *Handler, secCfg config.SecurityConfig, log zerolog.Logger) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Recovery(log))
	r.Use(middleware.Security(secCfg))
	r.Use(middleware.HAProxy)
	r.Use(middleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(metrics.ProxyInstrumentation)
	r.Use(middleware.Logging(log))

	// HAProxy health check — must never hit the proxy path.
	r.Get("/health", healthHandler)

	// Prometheus metrics scrape endpoint.
	r.Get("/metrics", metrics.Handler().ServeHTTP)

	// Wildcard — every other request goes through the reverse proxy.
	r.HandleFunc("/*", handler.ServeHTTP)

	return r
}

// healthHandler returns 200 OK. HAProxy checks this every 2 s; the worker is
// taken out of rotation the moment this stops returning 200.
func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
