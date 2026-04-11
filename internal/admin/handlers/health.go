package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// componentStatus captures one dependency's health check result.
type componentStatus struct {
	Status  string `json:"status"`           // "ok" | "degraded" | "down"
	Message string `json:"message,omitempty"` // error detail when not ok
	Latency string `json:"latency_ms,omitempty"`
}

// healthResponse is the full /api/health payload.
type healthResponse struct {
	Status     string                     `json:"status"` // "ok" | "degraded" | "down"
	Version    string                     `json:"version"`
	Components map[string]componentStatus `json:"components"`
}

// HealthHandler handles GET /api/health.
type HealthHandler struct {
	pgPool  *pgxpool.Pool   // nil when Postgres not configured
	rdb     *redis.Client   // nil when Redis not configured
	version string
	log     zerolog.Logger
}

// NewHealthHandler creates a HealthHandler.
// pgPool and rdb may be nil when the corresponding stores are not configured.
func NewHealthHandler(pgPool *pgxpool.Pool, rdb *redis.Client, version string, log zerolog.Logger) *HealthHandler {
	return &HealthHandler{pgPool: pgPool, rdb: rdb, version: version, log: log}
}

// ServeHTTP handles GET /api/health
func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	timeout := 3 * time.Second
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	components := make(map[string]componentStatus)
	overall := "ok"

	// ── Postgres ──────────────────────────────────────────────────────────────
	if h.pgPool != nil {
		start := time.Now()
		pgErr := h.pgPool.Ping(ctx)
		latency := time.Since(start)
		if pgErr != nil {
			components["postgres"] = componentStatus{
				Status:  "down",
				Message: pgErr.Error(),
				Latency: latency.String(),
			}
			overall = "degraded"
		} else {
			components["postgres"] = componentStatus{
				Status:  "ok",
				Latency: fmt.Sprintf("%.2f", float64(latency.Microseconds())/1000.0),
			}
		}
	} else {
		components["postgres"] = componentStatus{Status: "not_configured"}
	}

	// ── Redis ─────────────────────────────────────────────────────────────────
	if h.rdb != nil {
		start := time.Now()
		redisErr := h.rdb.Ping(ctx).Err()
		latency := time.Since(start)
		if redisErr != nil {
			components["redis"] = componentStatus{
				Status:  "down",
				Message: redisErr.Error(),
				Latency: latency.String(),
			}
			if overall == "ok" {
				overall = "degraded"
			}
		} else {
			components["redis"] = componentStatus{
				Status:  "ok",
				Latency: fmt.Sprintf("%.2f", float64(latency.Microseconds())/1000.0),
			}
		}
	} else {
		components["redis"] = componentStatus{Status: "not_configured"}
	}

	// ── NATS — placeholder (Phase 1 store wiring adds this) ───────────────────
	components["nats"] = componentStatus{Status: "not_configured"}

	status := http.StatusOK
	if overall == "down" {
		status = http.StatusServiceUnavailable
	}

	JSON(w, status, healthResponse{
		Status:     overall,
		Version:    h.version,
		Components: components,
	})
}
