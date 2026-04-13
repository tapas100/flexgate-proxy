package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"runtime/debug"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/flexgate/proxy/internal/admin"
	"github.com/flexgate/proxy/internal/config"
	"github.com/flexgate/proxy/internal/intelligence"
	"github.com/flexgate/proxy/internal/metrics"
	"github.com/flexgate/proxy/internal/proxy"
	proxyMiddleware "github.com/flexgate/proxy/internal/proxy/middleware"
	"github.com/flexgate/proxy/internal/security"
	"github.com/flexgate/proxy/internal/shutdown"
	"github.com/flexgate/proxy/internal/store"
)

// version is injected at build time via -ldflags="-X main.version=<TAG>".
var version = "dev"

func main() {
	// ── parse flags ───────────────────────────────────────────────────────────
	cfgFile := ""
	for i, arg := range os.Args[1:] {
		switch arg {
		case "--config", "-config":
			if i+1 < len(os.Args[1:]) {
				cfgFile = os.Args[i+2]
			}
		case "--version", "-version", "version":
			fmt.Printf("flexgate-proxy %s\n", version)
			os.Exit(0)
		case "--help", "-help", "help":
			printHelp()
			os.Exit(0)
		}
	}

	// ── load config ───────────────────────────────────────────────────────────
	cfg, err := config.Load(cfgFile)
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
		os.Exit(1)
	}

	// ── configure zerolog ─────────────────────────────────────────────────────
	logger, logCloser := buildLogger(cfg.Logging)
	defer func() { _ = logCloser.Close() }()
	log.Logger = logger

	// ── runtime tuning ────────────────────────────────────────────────────────
	// Apply GOGC and GOMEMLIMIT before any significant allocation occurs.
	// Both settings are visible to the Prometheus runtime/GC metrics
	// (go_gc_* family), so operators can correlate config changes with heap
	// behaviour in Grafana.
	applyRuntimeTuning(cfg.Tuning, logger)

	logger.Info().
		Str("version", version).
		Str("config_file", cfgFile).
		Int("proxy_port", cfg.Proxy.Port).
		Int("admin_port", cfg.Proxy.AdminPort).
		Str("log_level", cfg.Logging.Level).
		Str("log_format", cfg.Logging.Format).
		Msg("flexgate-proxy starting")

	// ── observability bootstrap ───────────────────────────────────────────────
	metrics.BuildInfo.WithLabelValues(version, runtime.Version()).Set(1)

	if haC := metrics.NewHAProxyCollector(
		cfg.HAProxy.Socket,
		cfg.HAProxy.StatsURL,
		logger,
	); haC != nil {
		logger.Info().
			Str("socket", cfg.HAProxy.Socket).
			Str("stats_url", cfg.HAProxy.StatsURL).
			Msg("haproxy metrics collector registered")
	}

	// ── background context — cancelled during ordered shutdown ────────────────
	rootCtx, rootCancel := context.WithCancel(context.Background())
	defer rootCancel()

	// ── initialise stores ─────────────────────────────────────────────────────
	stores, err := store.NewClients(rootCtx, cfg.Store, logger)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to initialise stores")
	}

	// ── route cache ───────────────────────────────────────────────────────────
	var pgPool proxy.PgPool
	if stores.Postgres != nil {
		pgPool = stores.Postgres.Pool()
	}

	routeCache := proxy.NewRouteCache(pgPool, logger)
	if err := routeCache.Start(rootCtx); err != nil {
		logger.Fatal().Err(err).Msg("failed to start route cache")
	}

	// ── proxy handler + router ────────────────────────────────────────────────
	intel := intelligence.New(cfg.Intelligence, logger)
	sec := security.NewClient(cfg.Security.SidecarURL)
	if cfg.Security.SidecarURL != "" {
		logger.Info().
			Str("sidecar_url", cfg.Security.SidecarURL).
			Msg("ssrf: Rust security sidecar enabled")
	} else {
		logger.Info().Msg("ssrf: no sidecar_url configured — SSRF validation disabled (fail-open)")
	}
	proxyHandler := proxy.NewHandler(routeCache, "", intel, sec, logger)
	proxyRouter := proxy.NewRouter(proxyHandler, cfg.Security, logger)

	// ── admin router ──────────────────────────────────────────────────────────
	var adminPgPool *pgxpool.Pool
	var adminRDB *redis.Client
	if stores.Postgres != nil {
		adminPgPool = stores.Postgres.Pool()
	}
	if stores.Redis != nil {
		adminRDB = stores.Redis.Client()
	}

	adminRouter := admin.NewRouter(admin.RouterConfig{
		Cfg:     cfg,
		PgPool:  adminPgPool,
		RDB:     adminRDB,
		Version: version,
		Log:     logger,
	})

	// ── HTTP servers ──────────────────────────────────────────────────────────
	proxySrv := &http.Server{
		Addr:           fmt.Sprintf(":%d", cfg.Proxy.Port),
		Handler:        proxyRouter,
		ReadTimeout:    time.Duration(cfg.Proxy.ReadTimeoutSec) * time.Second,
		WriteTimeout:   time.Duration(cfg.Proxy.WriteTimeoutSec) * time.Second,
		IdleTimeout:    time.Duration(cfg.Proxy.IdleTimeoutSec) * time.Second,
		MaxHeaderBytes: cfg.Proxy.MaxHeaderBytes,
	}
	adminSrv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Proxy.AdminPort),
		Handler:      adminRouter,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	serverErr := make(chan error, 2)

	go func() {
		logger.Info().Msgf("proxy listening on :%d", cfg.Proxy.Port)
		if err := proxySrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErr <- fmt.Errorf("proxy server: %w", err)
		}
	}()
	go func() {
		logger.Info().Msgf("admin listening on :%d", cfg.Proxy.AdminPort)
		if err := adminSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErr <- fmt.Errorf("admin server: %w", err)
		}
	}()

	// ── wait for signal or fatal server error ─────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)

	select {
	case sig := <-quit:
		logger.Info().Str("signal", sig.String()).Msg("shutdown signal received")
	case err := <-serverErr:
		logger.Fatal().Err(err).Msg("server error")
	}

	// ── ordered graceful shutdown ─────────────────────────────────────────────
	shutOrch := shutdown.New(
		shutdown.Config{
			HAProxySocket:    cfg.HAProxy.Socket,
			DrainGracePeriod: time.Duration(cfg.Shutdown.DrainGracePeriodSec) * time.Second,
			ShutdownTimeout:  time.Duration(cfg.Shutdown.TimeoutSec) * time.Second,
		},
		proxySrv,
		adminSrv,
		rootCancel,
		stores.Close,
		logger,
	)
	shutOrch.Run()
}

func buildLogger(cfg config.LoggingConfig) (zerolog.Logger, io.Closer) {
	switch cfg.Level {
	case "debug":
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	case "warn":
		zerolog.SetGlobalLevel(zerolog.WarnLevel)
	case "error":
		zerolog.SetGlobalLevel(zerolog.ErrorLevel)
	default:
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}
	if cfg.Format == "pretty" {
		// Pretty mode is only used in development — no async writer needed.
		l := zerolog.New(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}).
			With().Timestamp().Logger()
		return l, io.NopCloser(nil)
	}
	// Production JSON mode: wrap stdout in an async writer so that log writes
	// are off the hot request path (see middleware/async_writer.go).
	asyncOut := proxyMiddleware.NewAsyncWriter(os.Stdout)
	return zerolog.New(asyncOut).With().Timestamp().Logger(), asyncOut
}

// applyRuntimeTuning sets GOGC and GOMEMLIMIT from config before any
// significant allocation occurs. Both values are logged so they appear in
// startup logs and can be correlated with GC behaviour in Grafana.
//
// GOMEMLIMIT reference:
//   - Set to ~90% of the container's memory limit to give the GC a target
//     before the OOM killer fires.
//   - e.g. container limit = 512 MiB → set gomemlimit_mib = 460
//
// GOGC reference:
//   - Default is 100 (GC runs when live heap doubles).
//   - Lowering to 50 halves peak heap at the cost of ~2× CPU for GC.
//   - Raising to 200 reduces GC CPU overhead but increases peak heap.
//   - For latency-sensitive proxies, pairing GOMEMLIMIT with GOGC=200
//     gives the best trade-off: the GC is lazy until it must act.
func applyRuntimeTuning(cfg config.TuningConfig, log zerolog.Logger) {
	// ── GOMEMLIMIT ────────────────────────────────────────────────────────────
	if cfg.GOMEMLIMITMiB > 0 {
		limitBytes := int64(cfg.GOMEMLIMITMiB) * 1024 * 1024
		debug.SetMemoryLimit(limitBytes)
		log.Info().
			Int("gomemlimit_mib", cfg.GOMEMLIMITMiB).
			Int64("gomemlimit_bytes", limitBytes).
			Msg("tuning: GOMEMLIMIT applied")
	} else {
		// Explicitly set to math.MaxInt64 (the Go default) so that any
		// previously inherited environment value is overridden.
		debug.SetMemoryLimit(int64(^uint64(0) >> 1)) // math.MaxInt64 without the import
		log.Debug().Msg("tuning: GOMEMLIMIT not set — using Go default (unlimited)")
	}

	// ── GOGC ──────────────────────────────────────────────────────────────────
	// Default: 200 (lazy GC — run when heap is 3× live set).
	// Rationale: paired with GOMEMLIMIT, GOGC=200 lets the heap grow freely
	// until the memory limit forces a collection.  This halves GC CPU overhead
	// at the cost of higher peak heap — ideal for a latency-sensitive proxy
	// where GC pauses are the primary concern.
	// Operators can override with a lower value (e.g. 100) if they are
	// constrained by container memory limits.
	gcPercent := cfg.GOGCPercent
	if gcPercent == 0 {
		gcPercent = 200 // production default
	}
	prev := debug.SetGCPercent(gcPercent)
	log.Info().
		Int("gogc_percent", gcPercent).
		Int("gogc_prev", prev).
		Msg("tuning: GOGC applied")

	// Log effective Go runtime settings at INFO for operator visibility.
	log.Info().
		Int("gomaxprocs", runtime.GOMAXPROCS(0)).
		Int("num_cpu", runtime.NumCPU()).
		Str("go_version", runtime.Version()).
		Msg("tuning: runtime info")
}

func printHelp() {
	fmt.Printf(`flexgate-proxy %s

Usage:
  flexgate-proxy [flags]

Flags:
  --config <path>   Path to flexgate.yaml (default: ./flexgate.yaml)
  --version         Print version and exit
  --help            Print this help and exit

Environment variable overrides (FLEXGATE_ prefix):
  FLEXGATE_PROXY_PORT=8080
  FLEXGATE_PROXY_ADMIN_PORT=9090
  FLEXGATE_STORE_POSTGRES_URL=postgres://user:pass@localhost:5432/flexgate
  FLEXGATE_STORE_REDIS_URL=redis://localhost:6379
  FLEXGATE_LOGGING_LEVEL=info
  FLEXGATE_LOGGING_FORMAT=json
  FLEXGATE_INTELLIGENCE_URL=https://intelligence.flexgate.io
  FLEXGATE_INTELLIGENCE_LICENCE_KEY=fg_live_xxx

Config file search order:
  1. --config flag
  2. ./flexgate.yaml
  3. ./config/flexgate.yaml
  4. /etc/flexgate/flexgate.yaml
`, version)
}