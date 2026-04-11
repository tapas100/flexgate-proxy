-- Migration: 010_go_routes_schema.sql
-- Adds columns required by the Go proxy's RouteCache that were absent from the
-- original Node.js schema.
--
-- Safe to run against an existing database:
--   - All ALTER TABLE … ADD COLUMN IF NOT EXISTS (idempotent)
--   - The NOTIFY trigger is created or replaced (idempotent)
--   - The example routes upsert uses ON CONFLICT DO NOTHING

-- ── 1. Columns added for the Go proxy ────────────────────────────────────────

-- Per-route additional request headers forwarded to the upstream.
-- Stored as JSONB: {"X-My-Header": "value", "X-Tenant-ID": "acme"}
ALTER TABLE routes ADD COLUMN IF NOT EXISTS
    add_headers JSONB DEFAULT '{}'::jsonb;

-- Strip this prefix from the incoming path before forwarding.
-- e.g. strip_path = '/api/v1' on a route matching '/api/v1/*'
--      → request /api/v1/users becomes /users on the upstream
ALTER TABLE routes ADD COLUMN IF NOT EXISTS
    strip_path VARCHAR(500) DEFAULT '';

-- Per-route upstream timeout in milliseconds.
-- 0 = use the global proxy default (30s).
ALTER TABLE routes ADD COLUMN IF NOT EXISTS
    timeout_ms INTEGER DEFAULT 0;

-- ── 2. NOTIFY trigger ────────────────────────────────────────────────────────
-- Every INSERT / UPDATE / DELETE on the routes table fires a NOTIFY on the
-- 'flexgate_routes_changed' channel. All proxy workers listen on this channel
-- and reload their in-memory caches instantly.

CREATE OR REPLACE FUNCTION notify_routes_changed()
RETURNS TRIGGER AS $$
BEGIN
    -- Payload carries the operation so workers can log it clearly.
    PERFORM pg_notify(
        'flexgate_routes_changed',
        json_build_object(
            'op',         TG_OP,
            'route_id',   COALESCE(NEW.id::text, OLD.id::text),
            'path',       COALESCE(NEW.path, OLD.path)
        )::text
    );
    RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if it exists under a different name, then recreate.
DROP TRIGGER IF EXISTS trg_routes_notify ON routes;

CREATE TRIGGER trg_routes_notify
    AFTER INSERT OR UPDATE OR DELETE ON routes
    FOR EACH ROW EXECUTE FUNCTION notify_routes_changed();

-- ── 3. Example routes ────────────────────────────────────────────────────────
-- These seed routes let you verify the proxy works immediately after migration.
-- Path convention: trailing '/*' is stripped by the Go RouteCache at load time.

INSERT INTO routes (
    route_id, path, upstream, methods,
    strip_path, add_headers, timeout_ms,
    enabled, description, created_at, updated_at
) VALUES
    -- Route 1: httpbin — useful for verifying header/method forwarding
    (
        'demo-httpbin',
        '/httpbin/*',
        'https://httpbin.org',
        ARRAY['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
        '/httpbin',
        '{"X-Proxy-Name": "flexgate", "X-Route-ID": "demo-httpbin"}'::jsonb,
        10000,
        true,
        'Demo: forward /httpbin/* → https://httpbin.org with path strip',
        NOW(), NOW()
    ),
    -- Route 2: JSONPlaceholder — read-only REST API testing
    (
        'demo-jsonplaceholder',
        '/placeholder/*',
        'https://jsonplaceholder.typicode.com',
        ARRAY['GET'],
        '/placeholder',
        '{"X-Proxy-Name": "flexgate"}'::jsonb,
        5000,
        true,
        'Demo: forward /placeholder/* → https://jsonplaceholder.typicode.com',
        NOW(), NOW()
    ),
    -- Route 3: local echo — useful for local end-to-end testing
    (
        'demo-echo',
        '/echo/*',
        'http://localhost:9999',
        ARRAY['GET','POST'],
        '/echo',
        '{}'::jsonb,
        3000,
        false,
        'Demo: local echo server (disabled by default, enable for local testing)',
        NOW(), NOW()
    )
ON CONFLICT (route_id) DO NOTHING;

-- ── 4. Comments ──────────────────────────────────────────────────────────────
COMMENT ON COLUMN routes.add_headers IS
    'JSONB map of header name → value injected into every upstream request on this route';
COMMENT ON COLUMN routes.strip_path  IS
    'URL prefix stripped from the incoming path before forwarding to upstream';
COMMENT ON COLUMN routes.timeout_ms  IS
    'Per-route upstream timeout in milliseconds; 0 = use global proxy default';
COMMENT ON FUNCTION notify_routes_changed() IS
    'Fires pg_notify(''flexgate_routes_changed'') on every routes INSERT/UPDATE/DELETE so all proxy workers reload their in-memory caches instantly';
