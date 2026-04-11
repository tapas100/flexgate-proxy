package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// Settings is the full settings record persisted to Postgres.
// All fields are nullable in the DB; Go uses zero values for unset fields.
type Settings struct {
	// Proxy timeouts
	ProxyReadTimeoutSec  int `json:"proxy_read_timeout_sec"`
	ProxyWriteTimeoutSec int `json:"proxy_write_timeout_sec"`
	ProxyIdleTimeoutSec  int `json:"proxy_idle_timeout_sec"`

	// CORS
	CORSEnabled      bool     `json:"cors_enabled"`
	CORSAllowOrigins []string `json:"cors_allow_origins"`

	// Logging
	LogLevel  string `json:"log_level"`
	LogFormat string `json:"log_format"`

	// HAProxy
	HAProxySocket   string `json:"haproxy_socket"`
	HAProxyStatsURL string `json:"haproxy_stats_url"`

	// Admin security
	AdminAuthEnabled bool   `json:"admin_auth_enabled"`
	AdminUsername    string `json:"admin_username"`
	// AdminPassword is write-only — never returned in GET responses.
	AdminPassword string `json:"admin_password,omitempty"`

	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// SettingsHandler handles GET /api/settings and PUT /api/settings.
type SettingsHandler struct {
	pool *pgxpool.Pool
	log  zerolog.Logger
}

// NewSettingsHandler creates a SettingsHandler.
func NewSettingsHandler(pool *pgxpool.Pool, log zerolog.Logger) *SettingsHandler {
	return &SettingsHandler{pool: pool, log: log}
}

// Get handles GET /api/settings
func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	s, err := h.load(ctx)
	if err != nil {
		h.log.Error().Err(err).Msg("settings: load failed")
		Error(w, http.StatusInternalServerError, "database error")
		return
	}

	// Never expose the password on reads.
	s.AdminPassword = ""
	JSON(w, http.StatusOK, s)
}

// Update handles PUT /api/settings
func (h *SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req Settings
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := validateSettings(&req); err != nil {
		Error(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	originsJSON, _ := json.Marshal(req.CORSAllowOrigins)

	_, err := h.pool.Exec(ctx, `
		INSERT INTO proxy_settings (
			id,
			proxy_read_timeout_sec, proxy_write_timeout_sec, proxy_idle_timeout_sec,
			cors_enabled, cors_allow_origins,
			log_level, log_format,
			haproxy_socket, haproxy_stats_url,
			admin_auth_enabled, admin_username, admin_password,
			updated_at
		) VALUES (1, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
		ON CONFLICT (id) DO UPDATE SET
			proxy_read_timeout_sec  = EXCLUDED.proxy_read_timeout_sec,
			proxy_write_timeout_sec = EXCLUDED.proxy_write_timeout_sec,
			proxy_idle_timeout_sec  = EXCLUDED.proxy_idle_timeout_sec,
			cors_enabled            = EXCLUDED.cors_enabled,
			cors_allow_origins      = EXCLUDED.cors_allow_origins,
			log_level               = EXCLUDED.log_level,
			log_format              = EXCLUDED.log_format,
			haproxy_socket          = EXCLUDED.haproxy_socket,
			haproxy_stats_url       = EXCLUDED.haproxy_stats_url,
			admin_auth_enabled      = EXCLUDED.admin_auth_enabled,
			admin_username          = EXCLUDED.admin_username,
			admin_password          = CASE
				WHEN EXCLUDED.admin_password = '' THEN proxy_settings.admin_password
				ELSE EXCLUDED.admin_password
			END,
			updated_at              = NOW()
	`,
		req.ProxyReadTimeoutSec, req.ProxyWriteTimeoutSec, req.ProxyIdleTimeoutSec,
		req.CORSEnabled, originsJSON,
		req.LogLevel, req.LogFormat,
		req.HAProxySocket, req.HAProxyStatsURL,
		req.AdminAuthEnabled, req.AdminUsername, req.AdminPassword,
	)
	if err != nil {
		h.log.Error().Err(err).Msg("settings: upsert failed")
		Error(w, http.StatusInternalServerError, "database error")
		return
	}

	updated, err := h.load(ctx)
	if err != nil {
		h.log.Error().Err(err).Msg("settings: reload after update failed")
		Error(w, http.StatusInternalServerError, "database error")
		return
	}
	updated.AdminPassword = ""
	JSON(w, http.StatusOK, updated)
}

// load reads the single settings row (id=1).
// If no row exists, returns a struct of safe defaults.
func (h *SettingsHandler) load(ctx context.Context) (*Settings, error) {
	var s Settings
	var originsJSON json.RawMessage

	err := h.pool.QueryRow(ctx, `
		SELECT
			COALESCE(proxy_read_timeout_sec,  30),
			COALESCE(proxy_write_timeout_sec, 30),
			COALESCE(proxy_idle_timeout_sec,  120),
			COALESCE(cors_enabled, false),
			COALESCE(cors_allow_origins, '["*"]'::jsonb),
			COALESCE(log_level,  'info'),
			COALESCE(log_format, 'json'),
			COALESCE(haproxy_socket,    '/var/run/haproxy/admin.sock'),
			COALESCE(haproxy_stats_url, 'http://localhost:8404/stats'),
			COALESCE(admin_auth_enabled, false),
			COALESCE(admin_username, 'admin'),
			updated_at
		FROM proxy_settings
		WHERE id = 1
	`).Scan(
		&s.ProxyReadTimeoutSec, &s.ProxyWriteTimeoutSec, &s.ProxyIdleTimeoutSec,
		&s.CORSEnabled, &originsJSON,
		&s.LogLevel, &s.LogFormat,
		&s.HAProxySocket, &s.HAProxyStatsURL,
		&s.AdminAuthEnabled, &s.AdminUsername,
		&s.UpdatedAt,
	)
	if err != nil {
		// No row yet — return defaults.
		return &Settings{
			ProxyReadTimeoutSec:  30,
			ProxyWriteTimeoutSec: 30,
			ProxyIdleTimeoutSec:  120,
			CORSEnabled:          true,
			CORSAllowOrigins:     []string{"*"},
			LogLevel:             "info",
			LogFormat:            "json",
			HAProxySocket:        "/var/run/haproxy/admin.sock",
			HAProxyStatsURL:      "http://localhost:8404/stats",
			AdminAuthEnabled:     false,
			AdminUsername:        "admin",
		}, nil
	}

	_ = json.Unmarshal(originsJSON, &s.CORSAllowOrigins)
	return &s, nil
}

func validateSettings(s *Settings) error {
	var errs []string
	if s.ProxyReadTimeoutSec < 1 {
		errs = append(errs, "proxy_read_timeout_sec must be >= 1")
	}
	if s.ProxyWriteTimeoutSec < 1 {
		errs = append(errs, "proxy_write_timeout_sec must be >= 1")
	}
	if s.ProxyIdleTimeoutSec < 1 {
		errs = append(errs, "proxy_idle_timeout_sec must be >= 1")
	}
	switch s.LogLevel {
	case "debug", "info", "warn", "error", "":
	default:
		errs = append(errs, "log_level must be debug|info|warn|error")
	}
	switch s.LogFormat {
	case "json", "pretty", "":
	default:
		errs = append(errs, "log_format must be json|pretty")
	}
	if len(errs) > 0 {
		return fmt.Errorf("%s", strings.Join(errs, "; "))
	}
	return nil
}
