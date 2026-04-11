package store

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/config"
)

// Redis default pool settings — used when PoolConfig fields are zero.
const (
	redisDefaultDialTimeout  = 5 * time.Second
	redisDefaultReadTimeout  = 3 * time.Second
	redisDefaultWriteTimeout = 3 * time.Second
	redisDefaultPoolSize     = 50
	redisDefaultMinIdleConns = 5
	redisDefaultMaxIdleTime  = 5 * time.Minute
	// redisConnMaxLifetime — connections are recycled after this duration.
	// Prevents silent staleness in long-running deployments.
	redisDefaultConnMaxLifetime = 30 * time.Minute
)

// RedisClient wraps redis.Client and adds application-level helpers.
type RedisClient struct {
	client *redis.Client
	log    zerolog.Logger
}

// NewRedisClient creates a go-redis client from a redis:// DSN, verifies
// connectivity with a PING, and returns the wrapper.
//
// Pool sizing comes from cfg.Pool; sane defaults are used for any zero value.
func NewRedisClient(ctx context.Context, dsn string, pool config.PoolConfig, log zerolog.Logger) (*RedisClient, error) {
	opts, err := redis.ParseURL(dsn)
	if err != nil {
		return nil, fmt.Errorf("redis: parse dsn: %w", err)
	}

	// Apply pool sizing — prefer config values over defaults.
	if pool.MaxConns > 0 {
		opts.PoolSize = pool.MaxConns
	} else {
		opts.PoolSize = redisDefaultPoolSize
	}
	if pool.MinConns > 0 {
		opts.MinIdleConns = pool.MinConns
	} else {
		opts.MinIdleConns = redisDefaultMinIdleConns
	}
	if pool.MaxConnIdleTimeSec > 0 {
		opts.ConnMaxIdleTime = time.Duration(pool.MaxConnIdleTimeSec) * time.Second
	} else {
		opts.ConnMaxIdleTime = redisDefaultMaxIdleTime
	}
	if pool.MaxConnLifetimeSec > 0 {
		opts.ConnMaxLifetime = time.Duration(pool.MaxConnLifetimeSec) * time.Second
	} else {
		opts.ConnMaxLifetime = redisDefaultConnMaxLifetime
	}

	opts.DialTimeout = redisDefaultDialTimeout
	opts.ReadTimeout = redisDefaultReadTimeout
	opts.WriteTimeout = redisDefaultWriteTimeout

	rdb := redis.NewClient(opts)

	pingCtx, cancel := context.WithTimeout(ctx, redisDefaultDialTimeout)
	defer cancel()

	if err := rdb.Ping(pingCtx).Err(); err != nil {
		_ = rdb.Close()
		return nil, fmt.Errorf("redis: ping: %w", err)
	}

	log.Info().
		Int("pool_size", opts.PoolSize).
		Int("min_idle_conns", opts.MinIdleConns).
		Dur("conn_max_idle_time", opts.ConnMaxIdleTime).
		Dur("conn_max_lifetime", opts.ConnMaxLifetime).
		Msg("redis: connected")

	return &RedisClient{client: rdb, log: log}, nil
}

// Client returns the underlying *redis.Client for direct use.
func (r *RedisClient) Client() *redis.Client { return r.client }

// Ping checks the Redis connection is alive.
func (r *RedisClient) Ping(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}

// Close terminates the connection pool.
func (r *RedisClient) Close() error {
	r.log.Info().Msg("redis: client closed")
	return r.client.Close()
}
