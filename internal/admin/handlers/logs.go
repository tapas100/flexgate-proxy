package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/metrics"
)

// LogsHandler serves stub endpoints under /api/logs.
//
// A real implementation would query a structured log store (e.g. the
// Postgres access_log table or a log-shipper backend).  These stubs return
// well-typed zero-value responses so the frontend renders without errors.
type LogsHandler struct {
	log zerolog.Logger
}

// NewLogsHandler constructs a LogsHandler.
func NewLogsHandler(log zerolog.Logger) *LogsHandler {
	return &LogsHandler{log: log}
}

// List handles GET /api/logs?limit=N&offset=N&level=X&search=Y.
func (h *LogsHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 100)
	offset := queryInt(r, "offset", 0)

	h.log.Debug().Int("limit", limit).Int("offset", offset).Msg("logs/list: stub")

	writeJSON(w, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"logs":  []interface{}{},
			"total": 0,
			"limit": limit,
			"offset": offset,
		},
	})
}

// Get handles GET /api/logs/{id}.
func (h *LogsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	http.Error(w, fmt.Sprintf(`{"success":false,"error":"log %s not found"}`, id), http.StatusNotFound)
}

// StatsSummary handles GET /api/logs/stats/summary.
//
// Returns a LogStats-shaped object (mirrors types/index.ts LogStats).
func (h *LogsHandler) StatsSummary(w http.ResponseWriter, r *http.Request) {
	s := metrics.GatherSummary()

	errorRate := 0.0
	if s.ErrorRate >= 0 {
		errorRate = s.ErrorRate
	}

	writeJSON(w, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"total": int(s.TotalRequests),
			"byLevel": map[string]int{
				"DEBUG": 0,
				"INFO":  int(s.TotalRequests),
				"WARN":  0,
				"ERROR": 0,
				"FATAL": 0,
			},
			"bySource": map[string]int{
				"proxy":   int(s.TotalRequests),
				"auth":    0,
				"metrics": 0,
				"admin":   0,
				"system":  0,
			},
			"errorRate":  errorRate,
			"avgLatency": s.P50,
			"generatedAt": time.Now().UTC().Format(time.RFC3339),
		},
	})
}

// queryInt reads an integer query parameter, returning defaultVal on missing/invalid.
func queryInt(r *http.Request, key string, defaultVal int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return defaultVal
	}
	return n
}

// writeJSON writes v as JSON with Content-Type application/json.
func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Can't write header at this point; log and return.
		_ = err
	}
}
