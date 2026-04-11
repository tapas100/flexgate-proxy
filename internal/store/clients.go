package store

import (
	"context"
	"fmt"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/config"
)

// Clients groups all external storage clients that are available at runtime.
// Fields are nil when the corresponding DSN is empty in config.
type Clients struct {
	Postgres *PostgresPool
	Redis    *RedisClient
	NATS     *NATSConn
}

// NewClients initialises every store whose DSN is configured.
// DSNs that are empty are silently skipped; the caller must check for nil
// before using a store.
func NewClients(ctx context.Context, cfg config.StoreConfig, log zerolog.Logger) (*Clients, error) {
	c := &Clients{}

	if cfg.PostgresURL != "" {
		pg, err := NewPostgresPool(ctx, cfg.PostgresURL, cfg.Pool, log)
		if err != nil {
			return nil, fmt.Errorf("store: postgres: %w", err)
		}
		c.Postgres = pg
	} else {
		log.Warn().Msg("store: postgres DSN not set — route persistence disabled")
	}

	if cfg.RedisURL != "" {
		rdb, err := NewRedisClient(ctx, cfg.RedisURL, cfg.Pool, log)
		if err != nil {
			return nil, fmt.Errorf("store: redis: %w", err)
		}
		c.Redis = rdb
	} else {
		log.Warn().Msg("store: redis DSN not set — distributed cache disabled")
	}

	if cfg.NatsURL != "" {
		nc, err := NewNATSConn(ctx, cfg.NatsURL, log)
		if err != nil {
			return nil, fmt.Errorf("store: nats: %w", err)
		}
		c.NATS = nc
	} else {
		log.Warn().Msg("store: nats DSN not set — event streaming disabled")
	}

	return c, nil
}

// Close shuts down every initialised store gracefully.
// NATS is drained before being closed so that in-flight publish calls complete.
func (c *Clients) Close() {
	if c.NATS != nil {
		_ = c.NATS.Drain()
		c.NATS.Close()
	}
	if c.Redis != nil {
		_ = c.Redis.Close()
	}
	if c.Postgres != nil {
		c.Postgres.Close()
	}
}
