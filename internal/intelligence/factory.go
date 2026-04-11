package intelligence

import (
	"time"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/config"
	igrpc "github.com/flexgate/proxy/internal/intelligence/grpc"
)

// New constructs the appropriate Client implementation based on config.
//
// Priority order:
//  1. cfg.GRPCAddr set  → gRPC client (with connection pool + event batcher).
//     If the gRPC pool cannot be dialled, falls back to HTTP.
//  2. cfg.URL set       → HTTP client.
//  3. Neither set       → NoopClient (fully standalone mode).
func New(cfg config.IntelligenceConfig, log zerolog.Logger) Client {
	// ── 1. Try gRPC ───────────────────────────────────────────────────────────
	if cfg.GRPCAddr != "" {
		c, err := tryGRPC(cfg, log)
		if err == nil {
			return c
		}
		log.Warn().
			Err(err).
			Str("grpc_addr", cfg.GRPCAddr).
			Msg("intelligence: gRPC pool dial failed — falling back to HTTP")
		// fall through to HTTP
	}

	// ── 2. Try HTTP ───────────────────────────────────────────────────────────
	if cfg.URL != "" {
		timeoutMs := cfg.TimeoutMs
		if timeoutMs <= 0 {
			timeoutMs = 5
		}
		log.Info().
			Str("url", cfg.URL).
			Int("timeout_ms", timeoutMs).
			Bool("fail_open", cfg.FailOpen).
			Msg("intelligence: HTTP client initialised")
		return newHTTPClient(cfg.URL, cfg.LicenceKey, log)
	}

	// ── 3. Noop ───────────────────────────────────────────────────────────────
	log.Info().Msg("intelligence: no URL or gRPC address configured — running in standalone mode (noop client)")
	return &NoopClient{}
}

// tryGRPC builds and returns a gRPC client, returning an error if the
// connection pool cannot be dialled.
func tryGRPC(cfg config.IntelligenceConfig, log zerolog.Logger) (Client, error) {
	poolSize := cfg.GRPCPoolSize
	if poolSize <= 0 {
		poolSize = 4
	}
	batchSize := cfg.GRPCBatchSize
	if batchSize <= 0 {
		batchSize = 100
	}
	flushMs := cfg.GRPCFlushIntervalMs
	if flushMs <= 0 {
		flushMs = 100
	}

	grpcCfg := igrpc.ClientConfig{
		Pool: igrpc.PoolConfig{
			Target:     cfg.GRPCAddr,
			Size:       poolSize,
			LicenceKey: cfg.LicenceKey,
		},
		Batcher: igrpc.BatcherConfig{
			MaxBatchSize:  batchSize,
			FlushInterval: time.Duration(flushMs) * time.Millisecond,
			WorkerCount:   2,
		},
	}

	c, err := igrpc.NewGRPCClient(grpcCfg, log)
	if err != nil {
		return nil, err
	}

	log.Info().
		Str("grpc_addr", cfg.GRPCAddr).
		Int("pool_size", poolSize).
		Int("batch_size", batchSize).
		Int("flush_interval_ms", flushMs).
		Msg("intelligence: gRPC client initialised")

	return c, nil
}
