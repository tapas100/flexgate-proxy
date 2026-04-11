package admin

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/admin/handlers"
	adminMiddleware "github.com/flexgate/proxy/internal/admin/middleware"
	"github.com/flexgate/proxy/internal/config"
	"github.com/flexgate/proxy/internal/metrics"
	proxyMiddleware "github.com/flexgate/proxy/internal/proxy/middleware"
)

// RouterConfig bundles everything the admin router needs at construction time.
type RouterConfig struct {
	Cfg     *config.Config
	PgPool  *pgxpool.Pool  // may be nil
	RDB     *redis.Client  // may be nil
	Version string
	Log     zerolog.Logger
}

// NewRouter builds and returns the fully wired admin HTTP router.
//
// Route map:
//
//	GET    /health                        → health check (unauthenticated)
//	GET    /metrics                       → Prometheus metrics scrape (unauthenticated)
//	GET    /api/routes                    → list routes
//	POST   /api/routes                    → create route
//	PUT    /api/routes/{id}               → update route
//	DELETE /api/routes/{id}               → delete route
//	GET    /api/settings                  → get settings
//	PUT    /api/settings                  → update settings
//	GET    /api/health                    → full system health
//	GET    /api/metrics/summary           → P50/P95/P99 latency + error rate
//	GET    /api/troubleshoot/haproxy      → HAProxy stats
//	GET    /api/troubleshoot/upstream     → upstream connectivity test
//	GET    /api/troubleshoot/redis        → Redis status
func NewRouter(rc RouterConfig) http.Handler {
	r := chi.NewRouter()

	// ── global middleware ─────────────────────────────────────────────────────
	r.Use(proxyMiddleware.Recovery(rc.Log))
	r.Use(proxyMiddleware.Security(rc.Cfg.Security))
	r.Use(proxyMiddleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(proxyMiddleware.Logging(rc.Log))

	// ── unauthenticated ───────────────────────────────────────────────────────
	// /health and /metrics are intentionally outside the auth wall so HAProxy,
	// monitoring systems, and Prometheus can reach them without credentials.
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Prometheus scrape endpoint — exposes all FlexGate metrics.
	r.Get("/metrics", metrics.Handler().ServeHTTP)

	// ── authenticated API ─────────────────────────────────────────────────────
	adminUser := rc.Cfg.Admin.Username
	adminPass := rc.Cfg.Admin.Password

	r.Group(func(r chi.Router) {
		r.Use(adminMiddleware.BasicAuth(adminUser, adminPass))

		// Build handlers.
		routesH := handlers.NewRoutesHandler(rc.PgPool, rc.Log)
		settingsH := handlers.NewSettingsHandler(rc.PgPool, rc.Log)
		healthH := handlers.NewHealthHandler(rc.PgPool, rc.RDB, rc.Version, rc.Log)
		metricsH := handlers.NewMetricsHandler(rc.Log)
		troubleshootH := handlers.NewTroubleshootingHandler(
			rc.Cfg.HAProxy.Socket,
			rc.Cfg.HAProxy.StatsURL,
			rc.RDB,
			rc.Log,
		)

		// Routes CRUD
		r.Get("/api/routes", routesH.List)
		r.Post("/api/routes", routesH.Create)
		r.Put("/api/routes/{id}", routesH.Update)
		r.Delete("/api/routes/{id}", routesH.Delete)

		// Settings
		r.Get("/api/settings", settingsH.Get)
		r.Put("/api/settings", settingsH.Update)

		// Full health (authenticated so it can include sensitive diagnostics)
		r.Get("/api/health", healthH.ServeHTTP)

		// Metrics summary (authenticated — may expose internal topology detail)
		r.Get("/api/metrics/summary", metricsH.Summary)

		// Troubleshooting
		r.Get("/api/troubleshoot/haproxy", troubleshootH.HAProxy)
		r.Get("/api/troubleshoot/upstream", troubleshootH.Upstream)
		r.Get("/api/troubleshoot/redis", troubleshootH.Redis)
	})

	return r
}
