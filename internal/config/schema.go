package config

// Config is the root configuration struct. It mirrors flexgate.yaml exactly.
// All fields are validated by Loader.Validate() before the server starts.
type Config struct {
	Proxy        ProxyConfig        `mapstructure:"proxy"`
	HAProxy      HAProxyConfig      `mapstructure:"haproxy"`
	Store        StoreConfig        `mapstructure:"store"`
	Intelligence IntelligenceConfig `mapstructure:"intelligence"`
	Logging      LoggingConfig      `mapstructure:"logging"`
	Admin        AdminConfig        `mapstructure:"admin"`
	Security     SecurityConfig     `mapstructure:"security"`
	Shutdown     ShutdownConfig     `mapstructure:"shutdown"`
	Tuning       TuningConfig       `mapstructure:"tuning"`
}

// ProxyConfig controls the HTTP server behaviour.
type ProxyConfig struct {
	// Port is the HAProxy backend port this worker listens on.
	Port int `mapstructure:"port"`
	// AdminPort is the separate admin API port.
	AdminPort int `mapstructure:"admin_port"`
	// ReadTimeoutSec is the maximum duration for reading the entire request.
	ReadTimeoutSec int `mapstructure:"read_timeout_sec"`
	// WriteTimeoutSec is the maximum duration for writing the response.
	WriteTimeoutSec int `mapstructure:"write_timeout_sec"`
	// IdleTimeoutSec is the maximum time to wait for the next request.
	IdleTimeoutSec int `mapstructure:"idle_timeout_sec"`
	// MaxHeaderBytes is the maximum number of bytes the server will read
	// parsing the request header. Default: 1 MiB.
	MaxHeaderBytes int `mapstructure:"max_header_bytes"`
}

// HAProxyConfig holds connectivity parameters for the HAProxy runtime API.
type HAProxyConfig struct {
	// Socket is the path to the HAProxy UNIX admin socket.
	Socket string `mapstructure:"socket"`
	// StatsURL is the HAProxy stats page URL used by the troubleshooting API.
	StatsURL string `mapstructure:"stats_url"`
	// Backend is the HAProxy backend name used during graceful drain.
	// Format: "<backend>/<server>" e.g. "flexgate/worker-1".
	// Default: "flexgate/flexgate-worker".
	Backend string `mapstructure:"backend"`
}

// PoolConfig carries shared connection-pool tuning for Postgres and Redis.
// It is embedded inside StoreConfig so both backends share the same knobs.
type PoolConfig struct {
	// MaxConns is the maximum number of connections in the pool.
	// Postgres default: 20. Redis default: 50.
	MaxConns int `mapstructure:"max_conns"`
	// MinConns is the minimum number of idle connections to keep open.
	// Postgres default: 4. Redis default: 5.
	MinConns int `mapstructure:"min_conns"`
	// MaxConnLifetimeSec — connections older than this are replaced.
	// Postgres default: 1800 (30 m). Redis: not applicable.
	MaxConnLifetimeSec int `mapstructure:"max_conn_lifetime_sec"`
	// MaxConnIdleTimeSec — idle connections older than this are closed.
	// Postgres default: 300 (5 m). Redis default: 300.
	MaxConnIdleTimeSec int `mapstructure:"max_conn_idle_time_sec"`
}

// StoreConfig holds DSNs for all external storage backends.
// All fields are optional; each store initialises lazily and only when its
// DSN is non-empty.
type StoreConfig struct {
	RedisURL    string     `mapstructure:"redis_url"`
	PostgresURL string     `mapstructure:"postgres_url"`
	NatsURL     string     `mapstructure:"nats_url"`
	Pool        PoolConfig `mapstructure:"pool"`
}

// IntelligenceConfig controls the optional paid intelligence microservice.
// When URL is empty the proxy operates fully standalone and every intelligence
// call returns a safe no-op result.
type IntelligenceConfig struct {
	// URL is the base URL of the intelligence service (HTTP fallback).
	// Empty string → noop client used; proxy runs fully standalone.
	URL string `mapstructure:"url"`
	// LicenceKey is sent as X-Licence-Key (HTTP) or x-licence-key metadata
	// (gRPC) on every request.
	LicenceKey string `mapstructure:"licence_key"`
	// TimeoutMs is the hard timeout for every synchronous intelligence call.
	// Defaults to 5ms — intelligence can never slow the proxy hot path.
	TimeoutMs int `mapstructure:"timeout_ms"`
	// FailOpen controls behaviour when the intelligence service is unreachable.
	// true  → allow the request (default, recommended)
	// false → reject the request
	FailOpen bool `mapstructure:"fail_open"`

	// ── gRPC transport ───────────────────────────────────────────────────────

	// GRPCAddr is the target address for the gRPC transport,
	// e.g. "intelligence.svc.cluster.local:9000".
	// When set, the gRPC client is preferred over HTTP.
	// Falls back to HTTP (URL) if the gRPC connection pool cannot be dialled.
	GRPCAddr string `mapstructure:"grpc_addr"`
	// GRPCPoolSize is the number of persistent gRPC connections to maintain.
	// Default: 4.
	GRPCPoolSize int `mapstructure:"grpc_pool_size"`
	// GRPCBatchSize is the maximum number of RequestEvents per streaming batch.
	// Default: 100.
	GRPCBatchSize int `mapstructure:"grpc_batch_size"`
	// GRPCFlushIntervalMs is the maximum time (ms) an event waits before
	// the batcher flushes it, even if the batch is not full. Default: 100.
	GRPCFlushIntervalMs int `mapstructure:"grpc_flush_interval_ms"`
}

// LoggingConfig controls the zerolog logger.
type LoggingConfig struct {
	// Level is one of: debug | info | warn | error
	Level string `mapstructure:"level"`
	// Format is one of: json | pretty
	Format string `mapstructure:"format"`
	// Path is the log file path. Empty string → stdout only.
	Path string `mapstructure:"path"`
}

// AdminConfig controls admin API authentication.
// Both fields empty → Basic Auth disabled (useful for local dev).
type AdminConfig struct {
	// Username for HTTP Basic Auth on the admin API. Empty = auth disabled.
	Username string `mapstructure:"username"`
	// Password for HTTP Basic Auth on the admin API. Empty = auth disabled.
	Password string `mapstructure:"password"`
}

// SecurityConfig controls HTTP security hardening applied by the Security
// middleware on every response from both the proxy and admin planes.
type SecurityConfig struct {
	// Enabled gates the entire security middleware. Default: true.
	Enabled bool `mapstructure:"enabled"`

	// ── security headers ─────────────────────────────────────────────────────

	// HSTSMaxAgeSec sets Strict-Transport-Security max-age in seconds.
	// 0 → header is omitted. Default: 31536000 (1 year).
	HSTSMaxAgeSec int `mapstructure:"hsts_max_age_sec"`
	// HSTSIncludeSubDomains appends "; includeSubDomains". Default: true.
	HSTSIncludeSubDomains bool `mapstructure:"hsts_include_subdomains"`

	// ── request validation ────────────────────────────────────────────────────

	// MaxRequestBodyBytes is the maximum allowed Content-Length for non-GET
	// requests. 0 = unlimited. Default: 10485760 (10 MiB).
	MaxRequestBodyBytes int64 `mapstructure:"max_request_body_bytes"`
	// AllowedMethods is the set of HTTP methods that the proxy accepts.
	// Requests using any other method get a 405. Empty = all methods allowed.
	AllowedMethods []string `mapstructure:"allowed_methods"`
	// BlockUserAgents is a list of User-Agent substrings that are immediately
	// rejected with 403. Useful for blocking known scanners / bots.
	BlockUserAgents []string `mapstructure:"block_user_agents"`
}

// ShutdownConfig controls the graceful shutdown orchestrator.
type ShutdownConfig struct {
	// DrainGracePeriodSec is the time to wait after telling HAProxy to drain
	// before stopping the HTTP servers. Default: 3.
	DrainGracePeriodSec int `mapstructure:"drain_grace_period_sec"`
	// TimeoutSec is the maximum time for in-flight requests to complete.
	// Default: 30.
	TimeoutSec int `mapstructure:"timeout_sec"`
}

// TuningConfig carries Go runtime performance knobs that main() applies at
// startup via the runtime/debug package.
type TuningConfig struct {
	// GOMEMLIMITMiB sets the soft memory limit (GOMEMLIMIT) in mebibytes.
	// The GC will work harder to keep heap below this value.
	// 0 = use Go default (math.MaxInt64, i.e. no limit).
	// Recommended: set to ~90% of container memory limit.
	GOMEMLIMITMiB int `mapstructure:"gomemlimit_mib"`

	// GOGCPercent sets the garbage collection target percentage (GOGC).
	// 100 = GC runs when live heap doubles (Go default).
	// Lower = more frequent GC, lower peak heap, higher CPU.
	// Higher = less frequent GC, higher peak heap, lower CPU.
	// -1 = disable GC entirely (not recommended).
	// 0 = use Go default (100).
	GOGCPercent int `mapstructure:"gogc_percent"`
}
