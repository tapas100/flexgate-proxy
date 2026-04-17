package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"
)

const (
	// cacheRefreshInterval is the background reload cadence.
	// LISTEN/NOTIFY provides instant invalidation; this is a safety net.
	cacheRefreshInterval = 30 * time.Second

	// notifyChannel is the Postgres NOTIFY channel name.
	// Admin route writes send NOTIFY on this channel after every change.
	notifyChannel = "flexgate_routes_changed"

	// listenReconnectDelay is how long to wait before re-establishing a
	// dropped LISTEN connection.
	listenReconnectDelay = 2 * time.Second
)

// RouteCache is a thread-safe in-memory cache of Route objects.
//
// All hot-path reads use sync.Map (zero lock contention under read-heavy
// workloads). Writes happen only during background reloads and on
// LISTEN/NOTIFY invalidation.
//
// Route resolution is O(n) prefix scan, which is acceptable for up to ~10,000
// routes. If you exceed that, replace with a radix tree.
type RouteCache struct {
	// routes stores *Route values keyed by the normalised route path.
	routes sync.Map

	// size tracks the number of routes currently in the cache.
	size atomic.Int64

	// hits / misses for observability (Phase 5).
	hits   atomic.Int64
	misses atomic.Int64

	pool PgPool
	log  zerolog.Logger
}

// NewRouteCache creates a RouteCache. If pool is nil the cache starts empty and
// never loads from Postgres (useful in tests or when no DB is configured).
func NewRouteCache(pool PgPool, log zerolog.Logger) *RouteCache {
	return &RouteCache{pool: pool, log: log}
}

// InjectRoute stores a route directly into the cache without touching
// Postgres. Intended for use in benchmarks and integration tests only.
func (c *RouteCache) InjectRoute(r *Route) {
	path := strings.TrimSuffix(r.Path, "/*")
	c.routes.Store(path, r)
	c.size.Add(1)
}

// InjectRouteParams is the admin-handler–friendly variant of InjectRoute that
// satisfies the handlers.RouteInjector interface without importing proxy types
// into the admin package.
func (c *RouteCache) InjectRouteParams(path, upstream, stripPrefix string, methods []string, enabled bool) {
	path = strings.TrimSuffix(path, "/*")
	c.routes.Store(path, &Route{
		Path:        path,
		Upstream:    upstream,
		StripPrefix: stripPrefix,
		Methods:     methods,
		Enabled:     enabled,
	})
	c.size.Add(1)
}

// Start loads routes once synchronously (blocking startup if Postgres is
// unavailable) then launches:
//   - a background goroutine that reloads every 30 s
//   - a background goroutine that listens for NOTIFY and reloads instantly
//
// The caller must cancel ctx to stop both goroutines.
func (c *RouteCache) Start(ctx context.Context) error {
	if c.pool == nil {
		c.log.Warn().Msg("route cache: no postgres pool — cache will remain empty")
		return nil
	}

	// Initial synchronous load so the proxy is ready before accepting traffic.
	if err := c.reload(ctx); err != nil {
		return fmt.Errorf("route cache: initial load: %w", err)
	}

	// Background refresh (safety net).
	go c.backgroundRefresh(ctx)

	// LISTEN/NOTIFY for instant invalidation on route CRUD.
	go c.listenForInvalidation(ctx)

	return nil
}

// Resolve finds the best-matching Route for the given method and path.
//
// Matching rules (first match wins, ordered by specificity):
//  1. Exact path match
//  2. Longest prefix match
//
// Returns nil when no enabled route matches.
func (c *RouteCache) Resolve(method, path string) *Route {
	var best *Route
	bestLen := -1

	c.routes.Range(func(_, value any) bool {
		r := value.(*Route)
		if !r.Enabled {
			return true // continue
		}
		if !methodAllowed(r.Methods, method) {
			return true
		}

		routePath := r.Path
		// Exact match.
		if routePath == path {
			best = r
			bestLen = len(routePath)
			return false // stop — can't do better than exact
		}
		// Prefix match: route path must be a prefix of the request path,
		// and the next character in the request path must be "/" or nothing.
		if strings.HasPrefix(path, routePath) {
			suffix := path[len(routePath):]
			if suffix == "" || suffix[0] == '/' {
				if len(routePath) > bestLen {
					best = r
					bestLen = len(routePath)
				}
			}
		}
		return true
	})

	if best != nil {
		c.hits.Add(1)
	} else {
		c.misses.Add(1)
	}
	return best
}

// Size returns the number of routes currently in the cache.
func (c *RouteCache) Size() int64 { return c.size.Load() }

// Hits returns the total number of successful cache resolutions.
func (c *RouteCache) Hits() int64 { return c.hits.Load() }

// Misses returns the total number of failed cache resolutions.
func (c *RouteCache) Misses() int64 { return c.misses.Load() }

// ──────────────────────────────────────────────────────────────────────────────
// internal helpers
// ──────────────────────────────────────────────────────────────────────────────

func (c *RouteCache) backgroundRefresh(ctx context.Context) {
	ticker := time.NewTicker(cacheRefreshInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.reload(ctx); err != nil {
				c.log.Error().Err(err).Msg("route cache: background refresh failed")
			}
		}
	}
}

// listenForInvalidation opens a dedicated Postgres connection (not from the
// pool) and listens for NOTIFY on notifyChannel. On each notification it
// triggers an immediate reload.
//
// It reconnects automatically if the connection is lost.
func (c *RouteCache) listenForInvalidation(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		if err := c.runListener(ctx); err != nil {
			c.log.Warn().Err(err).
				Dur("reconnect_in", listenReconnectDelay).
				Msg("route cache: listener disconnected, reconnecting")
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(listenReconnectDelay):
		}
	}
}

func (c *RouteCache) runListener(ctx context.Context) error {
	conn, err := c.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "LISTEN "+notifyChannel); err != nil {
		return fmt.Errorf("LISTEN: %w", err)
	}

	c.log.Debug().Str("channel", notifyChannel).Msg("route cache: listening for invalidation")

	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return fmt.Errorf("WaitForNotification: %w", err)
		}

		c.log.Info().
			Str("channel", notification.Channel).
			Str("payload", notification.Payload).
			Msg("route cache: invalidation received, reloading")

		if reloadErr := c.reload(ctx); reloadErr != nil {
			c.log.Error().Err(reloadErr).Msg("route cache: reload after notify failed")
		}
	}
}

// reload fetches all enabled routes from Postgres and atomically replaces the
// in-memory cache.
func (c *RouteCache) reload(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	rows, err := c.pool.Query(ctx, `
		SELECT
			id,
			path,
			upstream,
			COALESCE(strip_path, '')     AS strip_prefix,
			COALESCE(methods, '{}')      AS methods,
			COALESCE(add_headers, '{}')  AS add_headers,
			COALESCE(timeout_ms, 0)      AS timeout_ms,
			enabled
		FROM routes
		WHERE deleted_at IS NULL
		ORDER BY LENGTH(path) DESC, path ASC
	`)
	if err != nil {
		return fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	// Build a fresh map; swap atomically at the end.
	fresh := make(map[string]*Route)

	for rows.Next() {
		var (
			r          Route
			addHeaders json.RawMessage
			timeoutMs  int64
		)

		if err := rows.Scan(
			&r.ID,
			&r.Path,
			&r.Upstream,
			&r.StripPrefix,
			&r.Methods,
			&addHeaders,
			&timeoutMs,
			&r.Enabled,
		); err != nil {
			return fmt.Errorf("scan: %w", err)
		}

		if timeoutMs > 0 {
			r.Timeout = time.Duration(timeoutMs) * time.Millisecond
		}

		if len(addHeaders) > 0 {
			if err := json.Unmarshal(addHeaders, &r.AddHeaders); err != nil {
				c.log.Warn().Str("route_id", r.ID).Err(err).Msg("route cache: invalid add_headers JSON, skipping headers")
			}
		}

		// Normalise trailing wildcard used in the DB (e.g. "/api/*" → "/api").
		r.Path = strings.TrimSuffix(r.Path, "/*")
		r.Path = strings.TrimSuffix(r.Path, "/")

		fresh[r.Path] = &r
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("rows: %w", err)
	}

	// Atomic swap: delete old keys, store new ones.
	c.routes.Range(func(k, _ any) bool {
		c.routes.Delete(k)
		return true
	})
	for path, r := range fresh {
		c.routes.Store(path, r)
	}
	c.size.Store(int64(len(fresh)))

	c.log.Info().Int("routes", len(fresh)).Msg("route cache: reloaded")
	return nil
}

// methodAllowed returns true if the request method is in the allowed list, or
// if the list is empty (meaning all methods are allowed).
func methodAllowed(allowed []string, method string) bool {
	if len(allowed) == 0 {
		return true
	}
	for _, m := range allowed {
		if strings.EqualFold(m, method) {
			return true
		}
	}
	return false
}
