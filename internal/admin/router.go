package admin

import (
	"net/http"
	"strings"

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
	Cfg        *config.Config
	PgPool     *pgxpool.Pool           // may be nil
	RDB        *redis.Client           // may be nil
	RouteCache handlers.RouteInjector  // may be nil; used for no-DB route injection
	Version    string
	Log        zerolog.Logger
}

// NewRouter builds and returns the fully wired admin HTTP router.
//
// Route map:
//
//	GET    /health                        → health check (unauthenticated)
//	GET    /metrics                       → Prometheus metrics scrape (unauthenticated)
//	GET    /api/setup/status              → full setup state (unauthenticated)
//	POST   /api/setup/mode                → persist chosen mode (unauthenticated)
//	POST   /api/setup/complete            → mark setup complete (unauthenticated)
//	POST   /api/setup/reset               → reset setup state (unauthenticated, dev only)
//	POST   /api/setup/dependencies        → persist dependency selections (unauthenticated)
//	POST   /api/setup/benchmarks          → persist benchmark scenario selections (unauthenticated)
//	POST   /api/setup/run                 → start setup execution engine (unauthenticated)
//	GET    /api/setup/run/stream          → SSE stream of execution events (unauthenticated)
//	GET    /api/setup/detect              → environment dependency detection (unauthenticated)
//	GET    /api/setup/probe               → server-side HTTP probe (avoids browser CORS) (unauthenticated)
//	POST   /api/setup/install             → stream-install a dependency via brew/apt/podman (unauthenticated)
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
//	GET    /api/benchmarks                → all stored data-points (by scenario)
//	GET    /api/benchmarks/latest         → latest data-point per scenario
//	GET    /api/benchmarks/status         → run lifecycle status
//	POST   /api/benchmarks/ingest         → ingest one live DataPoint (from runner)
//	POST   /api/benchmarks/ingest/batch   → ingest multiple DataPoints
//	POST   /api/benchmarks/start          → signal run start (resets store)
//	POST   /api/benchmarks/progress       → scenario status update
//	POST   /api/benchmarks/summary        → record final per-scenario aggregate
//	POST   /api/benchmarks/complete       → signal run finished
//	GET    /api/stream/benchmarks         → SSE live benchmark event stream
func NewRouter(rc RouterConfig) http.Handler {
	r := chi.NewRouter()

	// ── global middleware ─────────────────────────────────────────────────────
	r.Use(proxyMiddleware.Recovery(rc.Log))
	r.Use(proxyMiddleware.Security(rc.Cfg.Security))
	r.Use(proxyMiddleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(proxyMiddleware.Logging(rc.Log))
	// CORS — must come after Security so CORS headers are added after the
	// security headers, and before auth so OPTIONS preflights are answered
	// without triggering a 401.
	r.Use(devCORS)

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

	// Setup endpoints are unauthenticated so the setup wizard and CLI can
	// reach them before any admin credentials have been configured.
	//
	//   GET  /api/setup/status    → full SetupState (isSetupComplete, mode, dependenciesChecked, selectedStack)
	//   POST /api/setup/mode      → { "success": true, "mode": "benchmark"|"full" }
	//   POST /api/setup/complete  → { "success": true, "completedAt": "…" }
	//   POST /api/setup/reset     → { "reset": true }  (dev/test only)
	//   POST /api/setup/dependencies → { "success": true, "stack": […] }
	//   POST /api/setup/benchmarks   → { "success": true, "scenarios": […] }
	//   POST /api/setup/run          → { "started": true }  (202 Accepted)
	//   GET  /api/setup/run/stream   → SSE execution event stream
	//   GET  /api/setup/detect    → environment dependency report (nginx, haproxy, docker, podman, ports)
	setupH := handlers.NewSetupHandler("" /* use cwd */, rc.Log)
	r.Get("/api/setup/status", setupH.Status)
	r.Post("/api/setup/mode", setupH.Mode)
	r.Post("/api/setup/complete", setupH.Complete)
	r.Post("/api/setup/reset", setupH.Reset)
	r.Post("/api/setup/dependencies", setupH.Dependencies)
	r.Post("/api/setup/benchmarks", setupH.Benchmarks)

	runH := handlers.NewSetupRunHandler(setupH.Store(), rc.Log)
	r.Post("/api/setup/run", runH.Run)
	r.Get("/api/setup/run/stream", runH.Stream)

	detectH := handlers.NewDetectHandler(handlers.DefaultDetectOptions(), rc.Log)
	r.Get("/api/setup/detect", detectH.Detect)

	probeH := handlers.NewProbeHandler(rc.Log)
	r.Get("/api/setup/probe", probeH.Probe)

	installH := handlers.NewInstallHandler(rc.Log)
	r.Post("/api/setup/install", installH.Install)

	// ── SSE streaming — unauthenticated ───────────────────────────────────────
	// EventSource (browser native API) cannot send an Authorization header, so
	// the benchmark stream endpoint lives outside the Basic Auth wall.
	// It only exposes aggregated benchmark metrics — no sensitive config.
	streamH := handlers.NewBenchmarkStreamHandler(rc.Log)
	r.Options("/api/stream/benchmarks", streamH.CORSPreflight)
	r.Get("/api/stream/benchmarks", streamH.Stream)

	// Live proxy metrics SSE stream — consumed by useLiveMetrics.ts Dashboard/Metrics pages.
	metricsStreamH := handlers.NewMetricsStreamHandler(rc.Log)
	r.Get("/api/stream/metrics", metricsStreamH.Stream)

	// AI incidents — full in-memory CRUD.
	aiH := handlers.NewAIIncidentsHandler(rc.Log)
	// analytics routes must be registered before /{id} to avoid being swallowed
	r.Get("/api/ai-incidents/analytics/summary", aiH.AnalyticsSummary)
	r.Get("/api/ai-incidents/analytics/action-success-rates", aiH.ActionSuccessRates)
	r.Get("/api/ai-incidents", aiH.ListIncidents)
	r.Post("/api/ai-incidents", aiH.CreateIncident)
	r.Get("/api/ai-incidents/{id}", aiH.GetIncident)
	r.Patch("/api/ai-incidents/{id}", aiH.UpdateIncident)
	r.Post("/api/ai-incidents/{id}/recommendations", aiH.AddRecommendations)
	r.Post("/api/ai-incidents/{id}/recommendations/{rid}/decision", aiH.RecordDecision)
	r.Post("/api/ai-incidents/{id}/outcomes", aiH.RecordOutcome)
	r.Post("/api/ai-incidents/{id}/analyze", aiH.Analyze)
	r.Get("/api/ai-incidents/{id}/prompt", aiH.GetPrompt)

	// Logs stub endpoints.
	logsH := handlers.NewLogsHandler(rc.Log)
	r.Get("/api/logs/stats/summary", logsH.StatsSummary) // must be before /{id}
	r.Get("/api/logs", logsH.List)
	r.Get("/api/logs/{id}", logsH.Get)

	// Webhooks stub endpoints.
	webhooksH := handlers.NewWebhooksHandler(rc.Log)
	r.Get("/api/webhooks", webhooksH.List)
	r.Post("/api/webhooks", webhooksH.Create)
	r.Get("/api/webhooks/{id}", webhooksH.Get)
	r.Put("/api/webhooks/{id}", webhooksH.Update)
	r.Delete("/api/webhooks/{id}", webhooksH.Delete)
	r.Get("/api/webhooks/{id}/logs", webhooksH.Logs)
	r.Get("/api/webhooks/{id}/stats", webhooksH.Stats)
	r.Post("/api/webhooks/{id}/test", webhooksH.Test)

	// Troubleshooting page endpoints (/api/troubleshooting/* — note the "ing"
	// suffix, distinct from the existing /api/troubleshoot/* diagnostic routes).
	tspH := handlers.NewTroubleshootingPageHandler(rc.Log)
	r.Post("/api/troubleshooting/health-check", tspH.HealthCheck)
	r.Post("/api/troubleshooting/check-requirements", tspH.CheckRequirements)
	r.Post("/api/troubleshooting/auto-recover", tspH.AutoRecover)
	r.Post("/api/troubleshooting/verify-admin", tspH.VerifyAdmin)
	r.Post("/api/troubleshooting/start-progress-server", tspH.StartProgressServer)
	r.Post("/api/troubleshooting/nuclear-reset", tspH.NuclearReset)

	// AI settings endpoints — in-memory config, no auth required for dev.
	aiSettingsH := handlers.NewAISettingsHandler(rc.Log)
	r.Get("/api/settings/ai", aiSettingsH.Get)
	r.Post("/api/settings/ai", aiSettingsH.Save)
	r.Post("/api/settings/ai/test", aiSettingsH.TestKey)
	r.Delete("/api/settings/ai/key", aiSettingsH.DeleteKey)

	// AI testing page endpoints.
	aiTestingH := handlers.NewAITestingHandler(rc.Log)
	r.Get("/api/ai/events/sample", aiTestingH.SampleEvent)
	r.Post("/api/ai/prompts/build", aiTestingH.BuildPrompt)

	// Notification settings endpoints — in-memory, no auth required for dev.
	notifH := handlers.NewNotificationsHandler(rc.Log)
	r.Get("/api/settings/notifications", notifH.Get)
	r.Put("/api/settings/notifications", notifH.Save)
	r.Post("/api/settings/notifications/test-email", notifH.TestEmail)
	r.Post("/api/settings/notifications/recipients", notifH.AddRecipient)
	r.Delete("/api/settings/notifications/recipients/{id}", notifH.DeleteRecipient)
	r.Post("/api/settings/notifications/webhooks", notifH.AddWebhook)
	r.Delete("/api/settings/notifications/webhooks/{id}", notifH.DeleteWebhook)
	r.Post("/api/settings/notifications/webhooks/{id}/test", notifH.TestWebhook)

	// ── authenticated API ─────────────────────────────────────────────────────
	adminUser := rc.Cfg.Admin.Username
	adminPass := rc.Cfg.Admin.Password

	r.Group(func(r chi.Router) {
		r.Use(adminMiddleware.BasicAuth(adminUser, adminPass))

		// Build handlers.
		routesH := handlers.NewRoutesHandler(rc.PgPool, rc.Log).WithCache(rc.RouteCache)
		settingsH := handlers.NewSettingsHandler(rc.PgPool, rc.Log)
		uiSettingsH := handlers.NewUISettingsHandler(settingsH, rc.Log)
		healthH := handlers.NewHealthHandler(rc.PgPool, rc.RDB, rc.Version, rc.Log)
		metricsH := handlers.NewMetricsHandler(rc.Log)
		troubleshootH := handlers.NewTroubleshootingHandler(
			rc.Cfg.HAProxy.Socket,
			rc.Cfg.HAProxy.StatsURL,
			rc.RDB,
			rc.Log,
		)
		benchmarkH := handlers.NewBenchmarkHandler(rc.Log)

		// Routes CRUD
		r.Get("/api/routes", routesH.List)
		r.Post("/api/routes", routesH.Create)
		r.Put("/api/routes/{id}", routesH.Update)
		r.Delete("/api/routes/{id}", routesH.Delete)

		// Settings
		r.Get("/api/settings", settingsH.Get)
		r.Put("/api/settings", settingsH.Update)
		r.Get("/api/settings/ui", uiSettingsH.Get)
		r.Put("/api/settings/ui", uiSettingsH.Save)

		// Full health (authenticated so it can include sensitive diagnostics)
		r.Get("/api/health", healthH.ServeHTTP)

		// Metrics summary (authenticated — may expose internal topology detail)
		r.Get("/api/metrics/summary", metricsH.Summary)

		// Troubleshooting
		r.Get("/api/troubleshoot/haproxy", troubleshootH.HAProxy)
		r.Get("/api/troubleshoot/upstream", troubleshootH.Upstream)
		r.Get("/api/troubleshoot/redis", troubleshootH.Redis)

		// ── Benchmark collector ───────────────────────────────────────────────
		// Read endpoints
		r.Get("/api/benchmarks",        benchmarkH.List)
		r.Get("/api/benchmarks/latest", benchmarkH.Latest)
		r.Get("/api/benchmarks/status", benchmarkH.Status)

		// Write endpoints (called by benchmarks/run.js via HTTP)
		r.Post("/api/benchmarks/ingest",        benchmarkH.Ingest)
		r.Post("/api/benchmarks/ingest/batch",  benchmarkH.IngestBatch)
		r.Post("/api/benchmarks/start",         benchmarkH.Start)
		r.Post("/api/benchmarks/progress",      benchmarkH.Progress)
		r.Post("/api/benchmarks/summary",       benchmarkH.Summary)
		r.Post("/api/benchmarks/complete",      benchmarkH.Complete)
	})

	return r
}

// devCORS is a middleware that adds permissive CORS headers for local
// development.  It allows the React dev server (default :3000) to call the
// admin API (:9090) directly, and handles OPTIONS preflight requests so the
// browser doesn't block them.
//
// This middleware is always active; in production deployments the admin API
// should be placed behind a reverse-proxy that limits allowed origins.
func devCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}

		h := w.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Access-Control-Allow-Credentials", "true")
		h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
		h.Set("Access-Control-Allow-Headers",
			"Authorization, Content-Type, Accept, X-Request-Id")
		h.Set("Access-Control-Max-Age", "86400")

		// Respond to preflight immediately without forwarding to the handler.
		if r.Method == http.MethodOptions &&
			r.Header.Get("Access-Control-Request-Method") != "" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Vary header ensures proxies don't serve cached responses from one
		// origin to a different origin.
		h.Add("Vary", "Origin")

		next.ServeHTTP(w, r)
	})
}

// allowedOrigin returns true if the given Origin header value is a localhost
// variant (any port).  Used to gate devCORS to local traffic only when needed.
func allowedOrigin(origin string) bool {
	return strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") ||
		strings.HasPrefix(origin, "https://localhost:")
}
