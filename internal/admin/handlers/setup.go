// Package handlers — setup endpoints.
//
// Endpoints (all unauthenticated — required before credentials exist):
//
//	GET  /api/setup/status       → full SetupState document
//	POST /api/setup/mode         → persist chosen setup mode (benchmark|full)
//	POST /api/setup/dependencies → persist dependency selections
//	POST /api/setup/benchmarks   → persist benchmark scenario selections
//	POST /api/setup/complete     → set isSetupComplete=true; mode-aware (Stage 8)
//	POST /api/setup/reset        → (dev/test only) wipe state back to defaults
package handlers

import (
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/setup"
)

// ── SetupHandler ──────────────────────────────────────────────────────────────

// SetupHandler handles the unauthenticated setup lifecycle endpoints.
// It delegates all state persistence to a *setup.Store.
type SetupHandler struct {
	log   zerolog.Logger
	store *setup.Store
}

// NewSetupHandler creates a SetupHandler backed by a setup.Store rooted at
// stateDir.  If stateDir is empty the process working directory is used.
func NewSetupHandler(stateDir string, log zerolog.Logger) *SetupHandler {
	return &SetupHandler{
		log:   log,
		store: setup.NewStore(stateDir),
	}
}

// ── GET /api/setup/status ─────────────────────────────────────────────────────

// statusResponse is the wire format for GET /api/setup/status.
// It mirrors SetupState exactly so the CLI and UI can rely on a stable schema.
type statusResponse struct {
	IsSetupComplete     bool     `json:"isSetupComplete"`
	Mode                string   `json:"mode"`                // "" | "benchmark" | "full"
	DependenciesChecked bool     `json:"dependenciesChecked"`
	SelectedStack       []string `json:"selectedStack"`
	CreatedAt           *string  `json:"createdAt,omitempty"` // RFC-3339; omitted when zero
	UpdatedAt           *string  `json:"updatedAt,omitempty"` // RFC-3339; omitted when zero
}

// Status handles GET /api/setup/status.
//
// Returns 200 with the full setup state.  When no state has been persisted yet
// (fresh install) all fields are at their zero/default values:
//
//	{
//	  "isSetupComplete": false,
//	  "mode": "",
//	  "dependenciesChecked": false,
//	  "selectedStack": []
//	}
func (h *SetupHandler) Status(w http.ResponseWriter, r *http.Request) {
	st, err := h.store.Get()
	if err != nil {
		h.log.Error().Err(err).Msg("setup: failed to read state")
		Error(w, http.StatusInternalServerError, "failed to read setup state")
		return
	}

	JSON(w, http.StatusOK, toStatusResponse(st))
}

// ── POST /api/setup/mode ──────────────────────────────────────────────────────

// modeRequest is the body expected by POST /api/setup/mode.
type modeRequest struct {
	// Mode must be "benchmark" or "full".
	Mode string `json:"mode"`
}

// modeResponse is the wire format for a successful POST /api/setup/mode.
type modeResponse struct {
	Success bool   `json:"success"`
	Mode    string `json:"mode"`
}

// Mode handles POST /api/setup/mode.
//
// Persists the operator's chosen installation profile without marking setup
// complete.  This allows the UI to store the choice at step 2 of the wizard
// and use it for subsequent steps (e.g. showing relevant stack options).
//
// Idempotent — calling again with the same (or a different) mode overwrites
// the previous value.
func (h *SetupHandler) Mode(w http.ResponseWriter, r *http.Request) {
	var req modeRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	mode := setup.Mode(req.Mode)
	if mode != setup.ModeBenchmark && mode != setup.ModeFull {
		Error(w, http.StatusBadRequest, `mode must be "benchmark" or "full"`)
		return
	}

	// Load current state, update only the mode field, save.
	st, err := h.store.Get()
	if err != nil {
		h.log.Error().Err(err).Msg("setup/mode: failed to read state")
		Error(w, http.StatusInternalServerError, "failed to read setup state")
		return
	}
	st.Mode = mode
	if err := h.store.Save(st); err != nil {
		h.log.Error().Err(err).Str("mode", req.Mode).Msg("setup/mode: failed to persist")
		Error(w, http.StatusInternalServerError, "failed to persist setup mode")
		return
	}

	h.log.Info().Str("mode", req.Mode).Msg("setup: mode selected")
	JSON(w, http.StatusOK, modeResponse{Success: true, Mode: req.Mode})
}

// ── POST /api/setup/complete ──────────────────────────────────────────────────

// completeRequest is the body expected by POST /api/setup/complete.
type completeRequest struct {
	// Mode must be "benchmark" or "full".
	Mode string `json:"mode"`
	// SelectedStack lists optional stack components the operator chose
	// (e.g. ["nginx","redis"]).  May be omitted or empty.
	SelectedStack []string `json:"selectedStack,omitempty"`
	// InstanceName and AdminEmail are informational — logged but not persisted
	// in the state file (they live in the main config).
	InstanceName string `json:"instanceName,omitempty"`
	AdminEmail   string `json:"adminEmail,omitempty"`
	// RouteID is the first route created during setup.  Informational only.
	RouteID string `json:"routeId,omitempty"`
}

// completeResponse is the wire format for a successful POST /api/setup/complete.
type completeResponse struct {
	Success     bool   `json:"success"`
	CompletedAt string `json:"completedAt"` // RFC-3339
	Mode        string `json:"mode"`        // "benchmark" | "full" — for client-side redirect
	// RedirectTo is the suggested UI destination:
	//   benchmark → /benchmarks
	//   full      → /dashboard
	RedirectTo string `json:"redirectTo"`
}

// Complete handles POST /api/setup/complete.
// Idempotent — calling when already complete is a no-op returning 200.
func (h *SetupHandler) Complete(w http.ResponseWriter, r *http.Request) {
	var req completeRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	mode := setup.Mode(req.Mode)
	if mode != setup.ModeBenchmark && mode != setup.ModeFull && req.Mode != "" {
		Error(w, http.StatusBadRequest, `mode must be "benchmark" or "full"`)
		return
	}

	if err := h.store.MarkComplete(mode, req.SelectedStack); err != nil {
		h.log.Error().Err(err).Msg("setup: failed to persist state")
		Error(w, http.StatusInternalServerError, "failed to persist setup state")
		return
	}

	h.log.Info().
		Str("mode", string(mode)).
		Strs("selectedStack", req.SelectedStack).
		Str("instanceName", req.InstanceName).
		Str("adminEmail", req.AdminEmail).
		Str("routeId", req.RouteID).
		Msg("setup: marked complete")

	redirectTo := "/dashboard"
	if mode == setup.ModeBenchmark {
		redirectTo = "/benchmarks"
	}

	JSON(w, http.StatusOK, completeResponse{
		Success:     true,
		CompletedAt: time.Now().UTC().Format(time.RFC3339),
		Mode:        string(mode),
		RedirectTo:  redirectTo,
	})
}

// ── POST /api/setup/benchmarks ────────────────────────────────────────────────

// benchmarksRequest is the body expected by POST /api/setup/benchmarks.
type benchmarksRequest struct {
	// Scenarios lists the benchmark scenario IDs the operator chose to run
	// (e.g. ["baseline","haproxy","flexgate-inline"]).  May be empty.
	Scenarios []string `json:"scenarios"`
}

// benchmarksResponse is the wire format for a successful POST /api/setup/benchmarks.
type benchmarksResponse struct {
	Success   bool     `json:"success"`
	Scenarios []string `json:"scenarios"`
}

// Benchmarks handles POST /api/setup/benchmarks.
//
// Persists the operator's chosen benchmark scenarios.  The list is stored in
// SetupState.SelectedStack under the "benchmarks:" namespace (prefixed entries)
// so it does not conflict with dependency selections.
//
// Idempotent — calling again with a new list overwrites the previous value.
func (h *SetupHandler) Benchmarks(w http.ResponseWriter, r *http.Request) {
	var req benchmarksRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Scenarios == nil {
		req.Scenarios = []string{}
	}

	st, err := h.store.Get()
	if err != nil {
		h.log.Error().Err(err).Msg("setup/benchmarks: failed to read state")
		Error(w, http.StatusInternalServerError, "failed to read setup state")
		return
	}

	// Merge: retain non-benchmark entries, replace benchmark entries.
	filtered := make([]string, 0, len(st.SelectedStack))
	for _, s := range st.SelectedStack {
		if len(s) < 11 || s[:11] != "benchmark:" {
			filtered = append(filtered, s)
		}
	}
	for _, sc := range req.Scenarios {
		filtered = append(filtered, "benchmark:"+sc)
	}
	st.SelectedStack = filtered

	if err := h.store.Save(st); err != nil {
		h.log.Error().Err(err).Strs("scenarios", req.Scenarios).Msg("setup/benchmarks: failed to persist")
		Error(w, http.StatusInternalServerError, "failed to persist benchmark scenarios")
		return
	}

	h.log.Info().Strs("scenarios", req.Scenarios).Msg("setup: benchmark scenarios selected")
	JSON(w, http.StatusOK, benchmarksResponse{Success: true, Scenarios: req.Scenarios})
}

// ── POST /api/setup/dependencies ─────────────────────────────────────────────

// dependenciesRequest is the body expected by POST /api/setup/dependencies.
type dependenciesRequest struct {
	// SelectedStack lists the dependency names the operator chose to use
	// (e.g. ["nginx","haproxy"]).  Items that are installed but not listed
	// are treated as "skip".  May be empty.
	SelectedStack []string `json:"selectedStack"`
}

// dependenciesResponse is the wire format for a successful POST /api/setup/dependencies.
type dependenciesResponse struct {
	Success bool     `json:"success"`
	Stack   []string `json:"stack"`
}

// Dependencies handles POST /api/setup/dependencies.
//
// Persists the operator's dependency selections without marking setup complete.
// Idempotent — calling again with updated selections overwrites the previous value.
func (h *SetupHandler) Dependencies(w http.ResponseWriter, r *http.Request) {
	var req dependenciesRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.SelectedStack == nil {
		req.SelectedStack = []string{}
	}

	st, err := h.store.Get()
	if err != nil {
		h.log.Error().Err(err).Msg("setup/dependencies: failed to read state")
		Error(w, http.StatusInternalServerError, "failed to read setup state")
		return
	}

	st.DependenciesChecked = true
	st.SelectedStack = req.SelectedStack

	if err := h.store.Save(st); err != nil {
		h.log.Error().Err(err).Strs("stack", req.SelectedStack).Msg("setup/dependencies: failed to persist")
		Error(w, http.StatusInternalServerError, "failed to persist dependency selection")
		return
	}

	h.log.Info().Strs("stack", req.SelectedStack).Msg("setup: dependencies selected")
	JSON(w, http.StatusOK, dependenciesResponse{Success: true, Stack: req.SelectedStack})
}

// ── POST /api/setup/reset ─────────────────────────────────────────────────────

// Reset handles POST /api/setup/reset.
// Wipes the persisted state back to defaults so the setup wizard can restart.
// Intended for development and testing only.
func (h *SetupHandler) Reset(w http.ResponseWriter, r *http.Request) {
	blank := &setup.SetupState{
		IsSetupComplete:     false,
		Mode:                setup.ModeUnset,
		DependenciesChecked: false,
		SelectedStack:       []string{},
	}
	if err := h.store.Save(blank); err != nil {
		h.log.Error().Err(err).Msg("setup: failed to reset state")
		Error(w, http.StatusInternalServerError, "failed to reset setup state")
		return
	}
	h.log.Warn().Msg("setup: state reset to defaults")
	JSON(w, http.StatusOK, map[string]bool{"reset": true})
}

// ── Store accessor ────────────────────────────────────────────────────────────

// Store returns the underlying setup.Store so the router (or other handlers)
// can share a single store instance without constructing a second one.
func (h *SetupHandler) Store() *setup.Store {
	return h.store
}

// ── helpers ───────────────────────────────────────────────────────────────────

func toStatusResponse(st *setup.SetupState) statusResponse {
	resp := statusResponse{
		IsSetupComplete:     st.IsSetupComplete,
		Mode:                string(st.Mode),
		DependenciesChecked: st.DependenciesChecked,
		SelectedStack:       st.SelectedStack,
	}
	if resp.SelectedStack == nil {
		resp.SelectedStack = []string{}
	}
	if !st.CreatedAt.IsZero() {
		s := st.CreatedAt.UTC().Format(time.RFC3339)
		resp.CreatedAt = &s
	}
	if !st.UpdatedAt.IsZero() {
		s := st.UpdatedAt.UTC().Format(time.RFC3339)
		resp.UpdatedAt = &s
	}
	return resp
}
