package proxy

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PgPool is the subset of *pgxpool.Pool that RouteCache depends on.
// Defined as an interface so tests can inject a lightweight mock without
// spinning up a real Postgres instance.
type PgPool interface {
	// Query executes a SQL query and returns the rows.
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	// Acquire acquires a connection from the pool for LISTEN/NOTIFY.
	Acquire(ctx context.Context) (*pgxpool.Conn, error)
	// Ping verifies the pool is still healthy.
	Ping(ctx context.Context) error
}
