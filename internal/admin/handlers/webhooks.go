package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"
)

// WebhooksHandler serves CRUD endpoints under /api/webhooks.
//
// These stubs keep the frontend from receiving 404s while a real webhook
// persistence layer is not yet implemented.  All mutating operations succeed
// silently; list/get operations return empty data.
type WebhooksHandler struct {
	log zerolog.Logger
}

// NewWebhooksHandler constructs a WebhooksHandler.
func NewWebhooksHandler(log zerolog.Logger) *WebhooksHandler {
	return &WebhooksHandler{log: log}
}

// List handles GET /api/webhooks.
func (h *WebhooksHandler) List(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"success":  true,
		"webhooks": []interface{}{},
		"total":    0,
	})
}

// Create handles POST /api/webhooks.
func (h *WebhooksHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	_ = json.NewDecoder(r.Body).Decode(&body)

	now := time.Now().UTC().Format(time.RFC3339)
	id := "wh-stub-" + strconv.FormatInt(time.Now().UnixMilli(), 36)

	w.WriteHeader(http.StatusCreated)
	writeJSON(w, map[string]interface{}{
		"success": true,
		"webhook": mergeMap(map[string]interface{}{
			"id":        id,
			"createdAt": now,
			"updatedAt": now,
			"enabled":   true,
			"secret":    "",
		}, body),
	})
}

// Get handles GET /api/webhooks/{id}.
func (h *WebhooksHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	http.Error(w, `{"success":false,"error":"webhook not found"}`, http.StatusNotFound)
	h.log.Debug().Str("id", id).Msg("webhooks/get: stub not found")
}

// Update handles PUT /api/webhooks/{id}.
func (h *WebhooksHandler) Update(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	_ = json.NewDecoder(r.Body).Decode(&body)
	body["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
	writeJSON(w, map[string]interface{}{"success": true, "webhook": body})
}

// Delete handles DELETE /api/webhooks/{id}.
func (h *WebhooksHandler) Delete(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{"success": true})
}

// Logs handles GET /api/webhooks/{id}/logs.
func (h *WebhooksHandler) Logs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"success": true,
		"logs":    []interface{}{},
		"total":   0,
	})
}

// Stats handles GET /api/webhooks/{id}/stats.
func (h *WebhooksHandler) Stats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"success": true,
		"stats": map[string]interface{}{
			"totalDeliveries":      0,
			"successfulDeliveries": 0,
			"failedDeliveries":     0,
			"successRate":          0,
			"avgResponseTime":      0,
		},
	})
}

// Test handles POST /api/webhooks/{id}/test.
func (h *WebhooksHandler) Test(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "Test delivery queued (stub)",
	})
}

// mergeMap returns dst overwritten by src keys.
func mergeMap(dst, src map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(dst)+len(src))
	for k, v := range dst {
		out[k] = v
	}
	for k, v := range src {
		out[k] = v
	}
	return out
}
