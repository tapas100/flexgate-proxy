package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

// Load reads configuration from the given YAML file path and then overlays
// any environment variables prefixed with FLEXGATE_ (e.g. FLEXGATE_PROXY_PORT).
//
// Precedence (highest → lowest):
//  1. Environment variables  (FLEXGATE_PROXY_PORT, FLEXGATE_LOGGING_LEVEL, …)
//  2. flexgate.yaml
//  3. Built-in defaults below
func Load(cfgFile string) (*Config, error) {
	v := viper.New()

	// ── proxy defaults ────────────────────────────────────────────────────────
	v.SetDefault("proxy.port", 8080)
	v.SetDefault("proxy.admin_port", 9090)
	v.SetDefault("proxy.read_timeout_sec", 30)
	v.SetDefault("proxy.write_timeout_sec", 30)
	v.SetDefault("proxy.idle_timeout_sec", 120)
	v.SetDefault("proxy.max_header_bytes", 1<<20) // 1 MiB

	// ── haproxy defaults ──────────────────────────────────────────────────────
	v.SetDefault("haproxy.socket", "/var/run/haproxy/admin.sock")
	v.SetDefault("haproxy.stats_url", "http://localhost:8404/stats")
	v.SetDefault("haproxy.backend", "flexgate/flexgate-worker")

	// ── store pool defaults ───────────────────────────────────────────────────
	v.SetDefault("store.pool.max_conns", 20)
	v.SetDefault("store.pool.min_conns", 4)
	v.SetDefault("store.pool.max_conn_lifetime_sec", 1800) // 30 m
	v.SetDefault("store.pool.max_conn_idle_time_sec", 300) // 5 m

	// ── intelligence defaults ─────────────────────────────────────────────────
	v.SetDefault("intelligence.timeout_ms", 5)
	v.SetDefault("intelligence.fail_open", true)
	v.SetDefault("intelligence.grpc_pool_size", 4)
	v.SetDefault("intelligence.grpc_batch_size", 100)
	v.SetDefault("intelligence.grpc_flush_interval_ms", 100)

	// ── logging defaults ──────────────────────────────────────────────────────
	v.SetDefault("logging.level", "info")
	v.SetDefault("logging.format", "json")

	// ── admin defaults ────────────────────────────────────────────────────────
	// Empty = disabled (dev mode). Set FLEXGATE_ADMIN_USERNAME/PASSWORD to enable.
	v.SetDefault("admin.username", "")
	v.SetDefault("admin.password", "")

	// ── security defaults ─────────────────────────────────────────────────────
	v.SetDefault("security.enabled", true)
	v.SetDefault("security.hsts_max_age_sec", 31536000) // 1 year
	v.SetDefault("security.hsts_include_subdomains", true)
	v.SetDefault("security.max_request_body_bytes", 10*1024*1024) // 10 MiB
	v.SetDefault("security.allowed_methods", []string{})
	v.SetDefault("security.block_user_agents", []string{})

	// ── shutdown defaults ─────────────────────────────────────────────────────
	v.SetDefault("shutdown.drain_grace_period_sec", 3)
	v.SetDefault("shutdown.timeout_sec", 30)

	// ── tuning defaults ───────────────────────────────────────────────────────
	// 0 = use Go's built-in defaults (no GOMEMLIMIT, GOGC=100).
	v.SetDefault("tuning.gomemlimit_mib", 0)
	v.SetDefault("tuning.gogc_percent", 0)

	// ── YAML file ─────────────────────────────────────────────────────────────
	if cfgFile != "" {
		v.SetConfigFile(cfgFile)
	} else {
		v.SetConfigName("flexgate")
		v.SetConfigType("yaml")
		v.AddConfigPath(".")
		v.AddConfigPath("./config")
		v.AddConfigPath("/etc/flexgate")
	}

	if err := v.ReadInConfig(); err != nil {
		// It is valid to run without a config file; defaults + env vars suffice.
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("config: read %q: %w", cfgFile, err)
		}
	}

	// ── environment variables ─────────────────────────────────────────────────
	// FLEXGATE_PROXY_PORT=8081 → proxy.port = 8081
	v.SetEnvPrefix("FLEXGATE")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// ── unmarshal ─────────────────────────────────────────────────────────────
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("config: unmarshal: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// Validate checks that all required fields carry valid values. It returns an
// error listing every violation so that operators see the full problem at once.
func (c *Config) Validate() error {
	var errs []string

	if c.Proxy.Port < 1 || c.Proxy.Port > 65535 {
		errs = append(errs, fmt.Sprintf("proxy.port must be 1-65535, got %d", c.Proxy.Port))
	}
	if c.Proxy.AdminPort < 1 || c.Proxy.AdminPort > 65535 {
		errs = append(errs, fmt.Sprintf("proxy.admin_port must be 1-65535, got %d", c.Proxy.AdminPort))
	}
	if c.Proxy.Port == c.Proxy.AdminPort {
		errs = append(errs, "proxy.port and proxy.admin_port must be different")
	}
	if c.Proxy.ReadTimeoutSec < 1 {
		errs = append(errs, "proxy.read_timeout_sec must be >= 1")
	}
	if c.Proxy.WriteTimeoutSec < 1 {
		errs = append(errs, "proxy.write_timeout_sec must be >= 1")
	}
	if c.Proxy.IdleTimeoutSec < 1 {
		errs = append(errs, "proxy.idle_timeout_sec must be >= 1")
	}

	switch c.Logging.Level {
	case "debug", "info", "warn", "error":
		// valid
	default:
		errs = append(errs, fmt.Sprintf("logging.level must be debug|info|warn|error, got %q", c.Logging.Level))
	}
	switch c.Logging.Format {
	case "json", "pretty":
		// valid
	default:
		errs = append(errs, fmt.Sprintf("logging.format must be json|pretty, got %q", c.Logging.Format))
	}

	if c.Intelligence.TimeoutMs < 1 {
		errs = append(errs, "intelligence.timeout_ms must be >= 1")
	}

	if c.Store.Pool.MaxConns < 1 {
		errs = append(errs, "store.pool.max_conns must be >= 1")
	}
	if c.Store.Pool.MinConns < 0 {
		errs = append(errs, "store.pool.min_conns must be >= 0")
	}
	if c.Store.Pool.MinConns > c.Store.Pool.MaxConns {
		errs = append(errs, "store.pool.min_conns must be <= store.pool.max_conns")
	}

	if c.Security.MaxRequestBodyBytes < 0 {
		errs = append(errs, "security.max_request_body_bytes must be >= 0")
	}

	if c.Shutdown.DrainGracePeriodSec < 0 {
		errs = append(errs, "shutdown.drain_grace_period_sec must be >= 0")
	}
	if c.Shutdown.TimeoutSec < 1 {
		errs = append(errs, "shutdown.timeout_sec must be >= 1")
	}

	if c.Tuning.GOMEMLIMITMiB < 0 {
		errs = append(errs, "tuning.gomemlimit_mib must be >= 0")
	}
	if c.Tuning.GOGCPercent < -1 {
		errs = append(errs, "tuning.gogc_percent must be >= -1 (use -1 to disable GC, 0 for Go default 100)")
	}

	if len(errs) > 0 {
		return fmt.Errorf("config validation failed:\n  - %s", strings.Join(errs, "\n  - "))
	}
	return nil
}
