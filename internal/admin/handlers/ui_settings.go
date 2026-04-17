package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/rs/zerolog"
)

// UISettingsHandler handles GET/PUT /api/settings/ui.
//
// It stores the full GeneralSettings blob (all 6 tabs) as a single JSON value
// in Postgres alongside the operational settings.  The table column is added
// lazily via an INSERT … ON CONFLICT so no migration is required up-front.
//
// For the operational fields that the core also cares about (log_level,
// log_format, cors_enabled, cors_allow_origins) the handler syncs them to the
// main proxy_settings row so the proxy picks them up immediately.
type UISettingsHandler struct {
	settingsH *SettingsHandler // reuse pool + log
	log       zerolog.Logger
	// in-memory fallback when Postgres is unavailable
	mem map[string]interface{}
}

// NewUISettingsHandler constructs a UISettingsHandler.
func NewUISettingsHandler(settingsH *SettingsHandler, log zerolog.Logger) *UISettingsHandler {
	return &UISettingsHandler{settingsH: settingsH, log: log}
}

// Get handles GET /api/settings/ui.
// Returns the full blob that was last saved via PUT, or the default values
// derived from the operational settings row if nothing has been saved yet.
func (h *UISettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	blob, err := h.loadBlob(ctx)
	if err != nil || blob == nil {
		// Fall back to in-memory if DB unavailable or returned nothing.
		if h.mem != nil {
			writeJSON(w, map[string]interface{}{"success": true, "data": h.mem})
			return
		}
		if err != nil {
			h.log.Warn().Err(err).Msg("ui-settings: load failed, using defaults")
		}
		writeJSON(w, map[string]interface{}{"success": true, "data": h.defaults(ctx)})
		return
	}

	writeJSON(w, map[string]interface{}{"success": true, "data": blob})
}

// Save handles PUT /api/settings/ui.
// Persists the full blob and syncs known operational fields.
func (h *UISettingsHandler) Save(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"success":false,"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Always keep an in-memory copy as fallback.
	h.mem = body

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Persist as JSON blob (only when DB is available).
	if h.hasDB() {
		raw, _ := json.Marshal(body)
		_, err := h.settingsH.pool.Exec(ctx, `
			ALTER TABLE proxy_settings ADD COLUMN IF NOT EXISTS ui_settings jsonb;
			INSERT INTO proxy_settings (id, ui_settings, updated_at)
			VALUES (1, $1, NOW())
			ON CONFLICT (id) DO UPDATE
			  SET ui_settings = EXCLUDED.ui_settings,
			      updated_at  = NOW()
		`, string(raw))
		if err != nil {
			h.log.Warn().Err(err).Msg("ui-settings: db save failed, retained in-memory")
		}

		// Sync operational fields so the proxy picks them up.
		h.syncOperational(ctx, body)
	}

	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "Settings saved",
	})
}

// hasDB reports whether a Postgres pool is available.
func (h *UISettingsHandler) hasDB() bool {
	return h.settingsH != nil && h.settingsH.pool != nil
}

// loadBlob fetches the ui_settings JSON column.
func (h *UISettingsHandler) loadBlob(ctx context.Context) (map[string]interface{}, error) {
	if !h.hasDB() {
		return nil, nil
	}
	var raw string
	err := h.settingsH.pool.QueryRow(ctx, `
		SELECT COALESCE(ui_settings::text, '{}')
		FROM proxy_settings
		WHERE id = 1
	`).Scan(&raw)
	if err != nil || raw == "{}" || raw == "" {
		return nil, err
	}
	var out map[string]interface{}
	if err2 := json.Unmarshal([]byte(raw), &out); err2 != nil {
		return nil, err2
	}
	return out, nil
}

// defaults builds a default blob from the operational settings row.
func (h *UISettingsHandler) defaults(ctx context.Context) map[string]interface{} {
	if !h.hasDB() {
		return map[string]interface{}{}
	}
	ops, err := h.settingsH.load(ctx)
	if err != nil || ops == nil {
		return map[string]interface{}{}
	}
	origins := ops.CORSAllowOrigins
	if origins == nil {
		origins = []string{"*"}
	}
	return map[string]interface{}{
		"logging": map[string]interface{}{
			"level":  ops.LogLevel,
			"format": ops.LogFormat,
		},
		"security": map[string]interface{}{
			"cors": map[string]interface{}{
				"enabled": ops.CORSEnabled,
				"origins": origins,
			},
		},
	}
}

// syncOperational writes the UI fields that overlap with proxy_settings columns
// so the proxy picks them up without a restart.
func (h *UISettingsHandler) syncOperational(ctx context.Context, body map[string]interface{}) {
	if !h.hasDB() {
		return
	}
	logLevel := nestedString(body, "info", "logging", "level")
	logFormat := nestedString(body, "json", "logging", "format")
	corsEnabled := nestedBool(body, true, "security", "cors", "enabled")

	var origins []string
	if raw, ok := nestedValue(body, "security", "cors", "origins"); ok {
		if arr, ok2 := raw.([]interface{}); ok2 {
			for _, v := range arr {
				if s, ok3 := v.(string); ok3 {
					origins = append(origins, s)
				}
			}
		}
	}
	if len(origins) == 0 {
		origins = []string{"*"}
	}
	originsJSON, _ := json.Marshal(origins)

	_, err := h.settingsH.pool.Exec(ctx, `
		INSERT INTO proxy_settings (id, log_level, log_format, cors_enabled, cors_allow_origins, updated_at)
		VALUES (1, $1, $2, $3, $4, NOW())
		ON CONFLICT (id) DO UPDATE
		  SET log_level          = EXCLUDED.log_level,
		      log_format         = EXCLUDED.log_format,
		      cors_enabled       = EXCLUDED.cors_enabled,
		      cors_allow_origins = EXCLUDED.cors_allow_origins,
		      updated_at         = NOW()
	`, logLevel, logFormat, corsEnabled, string(originsJSON))
	if err != nil {
		h.log.Warn().Err(err).Msg("ui-settings: operational sync failed")
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func nestedValue(m map[string]interface{}, keys ...string) (interface{}, bool) {
	var cur interface{} = m
	for _, k := range keys {
		mm, ok := cur.(map[string]interface{})
		if !ok {
			return nil, false
		}
		cur, ok = mm[k]
		if !ok {
			return nil, false
		}
	}
	return cur, true
}

func nestedString(m map[string]interface{}, def string, keys ...string) string {
	v, ok := nestedValue(m, keys...)
	if !ok {
		return def
	}
	s, ok := v.(string)
	if !ok || s == "" {
		return def
	}
	return s
}

func nestedBool(m map[string]interface{}, def bool, keys ...string) bool {
	v, ok := nestedValue(m, keys...)
	if !ok {
		return def
	}
	b, ok := v.(bool)
	if !ok {
		return def
	}
	return b
}
