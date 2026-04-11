-- Migration: 011_admin_schema.sql
-- Creates the proxy_settings table for the admin API.
-- Safe to run on an existing database (all statements are idempotent).

-- ── proxy_settings ────────────────────────────────────────────────────────────
-- Single-row config table (id = 1 always).  The admin PUT /api/settings does
-- an UPSERT so the row is created on first write.
CREATE TABLE IF NOT EXISTS proxy_settings (
    id                      INTEGER PRIMARY KEY DEFAULT 1,

    -- Proxy timeouts (seconds)
    proxy_read_timeout_sec  INTEGER NOT NULL DEFAULT 30,
    proxy_write_timeout_sec INTEGER NOT NULL DEFAULT 30,
    proxy_idle_timeout_sec  INTEGER NOT NULL DEFAULT 120,

    -- CORS
    cors_enabled            BOOLEAN NOT NULL DEFAULT true,
    cors_allow_origins      JSONB   NOT NULL DEFAULT '["*"]'::jsonb,

    -- Logging
    log_level               VARCHAR(10)  NOT NULL DEFAULT 'info',
    log_format              VARCHAR(10)  NOT NULL DEFAULT 'json',

    -- HAProxy
    haproxy_socket          TEXT NOT NULL DEFAULT '/var/run/haproxy/admin.sock',
    haproxy_stats_url       TEXT NOT NULL DEFAULT 'http://localhost:8404/stats',

    -- Admin API auth
    admin_auth_enabled      BOOLEAN NOT NULL DEFAULT false,
    admin_username          VARCHAR(255) NOT NULL DEFAULT 'admin',
    admin_password          VARCHAR(255) NOT NULL DEFAULT '',

    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Enforce single-row constraint.
    CONSTRAINT proxy_settings_single_row CHECK (id = 1)
);

-- Insert default row so GET /api/settings works before the first PUT.
INSERT INTO proxy_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE proxy_settings IS
    'Single-row settings table managed by the admin API PUT /api/settings';

-- ── add route_id unique index (idempotent) ────────────────────────────────────
-- Already created by 001_initial_schema.sql but guard against clean installs
-- that start from this migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_route_id_unique ON routes(route_id)
    WHERE deleted_at IS NULL;
