package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/config"
)

// pgDefaults are used when the PoolConfig field is zero.
const (
	pgDefaultMaxConns          = 20
	pgDefaultMinConns          = 4
	pgDefaultMaxConnLifetime   = 30 * time.Minute
	pgDefaultMaxConnIdleTime   = 5 * time.Minute
	pgDefaultHealthCheckPeriod = 30 * time.Second
	pgDefaultConnectTimeout    = 10 * time.Second
	pgStartupRetries           = 10
	pgRetryDelay               = 3 * time.Second
)

// PostgresPool wraps pgxpool.Pool and adds application-level helpers.
type PostgresPool struct {
	pool *pgxpool.Pool
	log  zerolog.Logger
}

// NewPostgresPool creates a connection pool and blocks until Postgres is
// reachable or the retry budget is exhausted. The DB may start after the proxy
// (e.g. in Docker Compose), so we retry with a fixed backoff.
//
// Pool sizing comes from cfg.Pool; sane defaults are used for any zero value.
func NewPostgresPool(ctx context.Context, dsn string, pool config.PoolConfig, log zerolog.Logger) (*PostgresPool, error) {
	pgCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("postgres: parse dsn: %w", err)
	}

	// Apply pool sizing — prefer config values over defaults.
	maxConns := int32(pgDefaultMaxConns)
	if pool.MaxConns > 0 {
		maxConns = int32(pool.MaxConns)
	}
	minConns := int32(pgDefaultMinConns)
	if pool.MinConns > 0 {
		minConns = int32(pool.MinConns)
	}
	maxLifetime := pgDefaultMaxConnLifetime
	if pool.MaxConnLifetimeSec > 0 {
		maxLifetime = time.Duration(pool.MaxConnLifetimeSec) * time.Second
	}
	maxIdleTime := pgDefaultMaxConnIdleTime
	if pool.MaxConnIdleTimeSec > 0 {
		maxIdleTime = time.Duration(pool.MaxConnIdleTimeSec) * time.Second
	}

	pgCfg.MaxConns = maxConns
	pgCfg.MinConns = minConns
	pgCfg.MaxConnLifetime = maxLifetime
	pgCfg.MaxConnIdleTime = maxIdleTime
	pgCfg.HealthCheckPeriod = pgDefaultHealthCheckPeriod
	pgCfg.ConnConfig.ConnectTimeout = pgDefaultConnectTimeout

	var pgPool *pgxpool.Pool

	for attempt := 1; attempt <= pgStartupRetries; attempt++ {
		pgPool, err = pgxpool.NewWithConfig(ctx, pgCfg)
		if err != nil {
			log.Warn().Err(err).Int("attempt", attempt).Msg("postgres: pool creation failed, retrying")
			time.Sleep(pgRetryDelay)
			continue
		}

		pingCtx, cancel := context.WithTimeout(ctx, pgDefaultConnectTimeout)
		err = pgPool.Ping(pingCtx)
		cancel()

		if err == nil {
			break
		}

		pgPool.Close()
		pgPool = nil
		log.Warn().Err(err).Int("attempt", attempt).Msg("postgres: ping failed, retrying")
		time.Sleep(pgRetryDelay)
	}

	if pgPool == nil {
		return nil, fmt.Errorf("postgres: could not connect after %d attempts: %w", pgStartupRetries, err)
	}

	log.Info().
		Int32("max_conns", maxConns).
		Int32("min_conns", minConns).
		Dur("max_conn_lifetime", maxLifetime).
		Dur("max_conn_idle_time", maxIdleTime).
		Msg("postgres: connected")

	return &PostgresPool{pool: pgPool, log: log}, nil
}

// Pool returns the underlying pgxpool.Pool for direct use by repositories.
func (p *PostgresPool) Pool() *pgxpool.Pool { return p.pool }

// Ping checks the Postgres connection is alive.
func (p *PostgresPool) Ping(ctx context.Context) error {
	return p.pool.Ping(ctx)
}

// Close releases all connections.
func (p *PostgresPool) Close() {
	p.pool.Close()
	p.log.Info().Msg("postgres: pool closed")
}

// Stats returns current pool statistics for the health endpoint.
func (p *PostgresPool) Stats() *pgxpool.Stat {
	return p.pool.Stat()
}
