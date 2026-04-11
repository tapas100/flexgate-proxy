package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// RouteRecord is the JSON representation of a route as stored in Postgres.
// It is used for both reads and writes.
type RouteRecord struct {
	ID          string            `json:"id,omitempty"`
	RouteID     string            `json:"route_id"`
	Path        string            `json:"path"`
	Upstream    string            `json:"upstream"`
	Methods     []string          `json:"methods"`
	StripPath   string            `json:"strip_path,omitempty"`
	AddHeaders  map[string]string `json:"add_headers,omitempty"`
	TimeoutMs   int               `json:"timeout_ms,omitempty"`
	Enabled     bool              `json:"enabled"`
	Description string            `json:"description,omitempty"`
	Tags        []string          `json:"tags,omitempty"`
	CreatedAt   time.Time         `json:"created_at,omitempty"`
	UpdatedAt   time.Time         `json:"updated_at,omitempty"`
}

// RoutesHandler handles all /api/routes endpoints.
type RoutesHandler struct {
	pool *pgxpool.Pool
	log  zerolog.Logger
}

// NewRoutesHandler creates a RoutesHandler.
func NewRoutesHandler(pool *pgxpool.Pool, log zerolog.Logger) *RoutesHandler {
	return &RoutesHandler{pool: pool, log: log}
}

// List handles GET /api/routes
func (h *RoutesHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.pool.Query(ctx, `
		SELECT id, route_id, path, upstream,
		       COALESCE(methods, '{}'),
		       COALESCE(strip_path, ''),
		       COALESCE(add_headers, '{}'::jsonb),
		       COALESCE(timeout_ms, 0),
		       enabled,
		       COALESCE(description, ''),
		       COALESCE(tags, '{}'),
		       created_at, updated_at
		FROM routes
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		h.log.Error().Err(err).Msg("routes: list query failed")
		Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	routes, err := scanRoutes(rows)
	if err != nil {
		h.log.Error().Err(err).Msg("routes: scan failed")
		Error(w, http.StatusInternalServerError, "database error")
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"routes": routes,
		"total":  len(routes),
	})
}

// Create handles POST /api/routes
func (h *RoutesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req RouteRecord
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := validateRoute(&req); err != nil {
		Error(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	addHeadersJSON, _ := json.Marshal(req.AddHeaders)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var rec RouteRecord
	err := h.pool.QueryRow(ctx, `
		INSERT INTO routes (route_id, path, upstream, methods, strip_path,
		                    add_headers, timeout_ms, enabled, description, tags)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id, route_id, path, upstream,
		          COALESCE(methods,'{}'),
		          COALESCE(strip_path,''),
		          COALESCE(add_headers,'{}'::jsonb),
		          COALESCE(timeout_ms,0),
		          enabled,
		          COALESCE(description,''),
		          COALESCE(tags,'{}'),
		          created_at, updated_at
	`,
		req.RouteID, req.Path, req.Upstream, req.Methods,
		req.StripPath, addHeadersJSON, req.TimeoutMs,
		req.Enabled, req.Description, req.Tags,
	).Scan(
		&rec.ID, &rec.RouteID, &rec.Path, &rec.Upstream,
		&rec.Methods, &rec.StripPath, &addHeadersJSON,
		&rec.TimeoutMs, &rec.Enabled, &rec.Description, &rec.Tags,
		&rec.CreatedAt, &rec.UpdatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "route_id already exists")
			return
		}
		h.log.Error().Err(err).Msg("routes: insert failed")
		Error(w, http.StatusInternalServerError, "database error")
		return
	}

	_ = json.Unmarshal(addHeadersJSON, &rec.AddHeaders)
	// NOTIFY is fired by the DB trigger — no manual call needed.
	JSON(w, http.StatusCreated, rec)
}

// Update handles PUT /api/routes/:id
func (h *RoutesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req RouteRecord
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := validateRoute(&req); err != nil {
		Error(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	addHeadersJSON, _ := json.Marshal(req.AddHeaders)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var rec RouteRecord
	err := h.pool.QueryRow(ctx, `
		UPDATE routes
		SET path=$1, upstream=$2, methods=$3, strip_path=$4,
		    add_headers=$5, timeout_ms=$6, enabled=$7,
		    description=$8, tags=$9, updated_at=NOW()
		WHERE id=$10 AND deleted_at IS NULL
		RETURNING id, route_id, path, upstream,
		          COALESCE(methods,'{}'),
		          COALESCE(strip_path,''),
		          COALESCE(add_headers,'{}'::jsonb),
		          COALESCE(timeout_ms,0),
		          enabled,
		          COALESCE(description,''),
		          COALESCE(tags,'{}'),
		          created_at, updated_at
	`,
		req.Path, req.Upstream, req.Methods, req.StripPath,
		addHeadersJSON, req.TimeoutMs, req.Enabled,
		req.Description, req.Tags, id,
	).Scan(
		&rec.ID, &rec.RouteID, &rec.Path, &rec.Upstream,
		&rec.Methods, &rec.StripPath, &addHeadersJSON,
		&rec.TimeoutMs, &rec.Enabled, &rec.Description, &rec.Tags,
		&rec.CreatedAt, &rec.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		h.log.Error().Err(err).Str("id", id).Msg("routes: update failed")
		Error(w, http.StatusInternalServerError, "database error")
		return
	}

	_ = json.Unmarshal(addHeadersJSON, &rec.AddHeaders)
	JSON(w, http.StatusOK, rec)
}

// Delete handles DELETE /api/routes/:id  (soft delete)
func (h *RoutesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	tag, err := h.pool.Exec(ctx, `
		UPDATE routes SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL
	`, id)
	if err != nil {
		h.log.Error().Err(err).Str("id", id).Msg("routes: delete failed")
		Error(w, http.StatusInternalServerError, "database error")
		return
	}
	if tag.RowsAffected() == 0 {
		Error(w, http.StatusNotFound, "route not found")
		return
	}

	// Soft delete fires the UPDATE path of the NOTIFY trigger automatically.
	w.WriteHeader(http.StatusNoContent)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func scanRoutes(rows pgx.Rows) ([]RouteRecord, error) {
	var out []RouteRecord
	for rows.Next() {
		var rec RouteRecord
		var addHeadersJSON json.RawMessage
		if err := rows.Scan(
			&rec.ID, &rec.RouteID, &rec.Path, &rec.Upstream,
			&rec.Methods, &rec.StripPath, &addHeadersJSON,
			&rec.TimeoutMs, &rec.Enabled, &rec.Description, &rec.Tags,
			&rec.CreatedAt, &rec.UpdatedAt,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(addHeadersJSON, &rec.AddHeaders)
		out = append(out, rec)
	}
	return out, rows.Err()
}

func validateRoute(r *RouteRecord) error {
	var errs []string
	if strings.TrimSpace(r.RouteID) == "" {
		errs = append(errs, "route_id is required")
	}
	if strings.TrimSpace(r.Path) == "" {
		errs = append(errs, "path is required")
	}
	if strings.TrimSpace(r.Upstream) == "" {
		errs = append(errs, "upstream is required")
	}
	if len(errs) > 0 {
		return fmt.Errorf("%s", strings.Join(errs, "; "))
	}
	return nil
}

func isUniqueViolation(err error) bool {
	// pgx wraps pg errors; check the SQLSTATE code 23505.
	if pgErr, ok := err.(*pgconn.PgError); ok {
		return pgErr.Code == "23505"
	}
	return false
}
