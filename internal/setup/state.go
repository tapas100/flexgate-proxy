// Package setup owns the FlexGate setup state engine.
//
// It is the single source of truth for whether setup has been completed,
// which mode was chosen, which optional stack components were selected, and
// whether the initial dependency scan has been run.
//
// Storage strategy
// ─────────────────
// State is persisted as a single JSON file called "flexgate-setup-state.json"
// (controlled by DefaultStateFileName) in the directory supplied at
// construction time (defaults to the process working directory).
//
// The legacy zero-byte sentinel file ".flexgate-setup-complete" is still
// checked at load time so that existing deployments that only ran the old
// POST /api/setup/complete are not forced through the wizard again.
//
// Concurrency
// ────────────
// Store is safe for concurrent use from multiple goroutines; it uses a single
// sync.RWMutex.  All exported methods acquire/release the lock themselves.
package setup

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ── constants ─────────────────────────────────────────────────────────────────

// DefaultStateFileName is the JSON file name written by Store.
const DefaultStateFileName = "flexgate-setup-state.json"

// legacySentinelFile is the zero-byte file written by the old setup handler.
// We check for it on load so existing deployments aren't broken.
const legacySentinelFile = ".flexgate-setup-complete"

// ── types ─────────────────────────────────────────────────────────────────────

// Mode describes which installation profile the operator chose.
type Mode string

const (
	// ModeUnset means the operator has not yet chosen a mode.
	ModeUnset Mode = ""
	// ModeBenchmark is the lightweight profile — only the benchmark stack,
	// no Nginx / HAProxy required.
	ModeBenchmark Mode = "benchmark"
	// ModeFull is the production profile — full platform with reverse-proxy,
	// optional Redis, optional Postgres, etc.
	ModeFull Mode = "full"
)

// SetupState is the canonical setup state document persisted to disk.
type SetupState struct {
	// IsSetupComplete is true once the operator has finished the wizard.
	IsSetupComplete bool `json:"isSetupComplete"`

	// Mode is the installation profile chosen by the operator.
	// Empty string means the wizard has not been completed yet.
	Mode Mode `json:"mode"`

	// DependenciesChecked is true once the backend has executed at least one
	// dependency scan (even if not all dependencies are present).
	DependenciesChecked bool `json:"dependenciesChecked"`

	// SelectedStack lists the optional stack components that the operator
	// opted into (e.g. "nginx", "haproxy", "redis", "postgres").
	// Nil and empty slice are equivalent — no components selected.
	SelectedStack []string `json:"selectedStack"`

	// CreatedAt is the wall-clock time the state document was first written.
	// Subsequent saves preserve the original value.
	CreatedAt time.Time `json:"createdAt"`

	// UpdatedAt is the wall-clock time the state document was last saved.
	UpdatedAt time.Time `json:"updatedAt"`
}

// ── Store ─────────────────────────────────────────────────────────────────────

// Store manages read/write access to the persisted SetupState.
type Store struct {
	mu       sync.RWMutex
	stateDir string
	cached   *SetupState // in-memory copy; nil means not yet loaded
}

// NewStore creates a Store that persists state in stateDir.
// If stateDir is empty the process working directory is used.
func NewStore(stateDir string) *Store {
	dir := stateDir
	if dir == "" {
		if wd, err := os.Getwd(); err == nil {
			dir = wd
		} else {
			dir = "."
		}
	}
	return &Store{stateDir: dir}
}

// ── public API ────────────────────────────────────────────────────────────────

// Load reads the persisted state from disk and caches it in memory.
// Subsequent calls to Get will return the cached value without hitting disk.
// Calling Load again re-reads the file (useful after an external mutation).
func (s *Store) Load() (*SetupState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.load()
}

// Get returns the current state.
// If the state has not been loaded yet it loads it automatically (read-through).
// It never returns nil — a zero-value default is returned when no state exists.
func (s *Store) Get() (*SetupState, error) {
	s.mu.RLock()
	if s.cached != nil {
		cp := *s.cached
		s.mu.RUnlock()
		return &cp, nil
	}
	s.mu.RUnlock()

	// Upgrade to write lock and load.
	s.mu.Lock()
	defer s.mu.Unlock()
	// Double-check after acquiring write lock.
	if s.cached != nil {
		cp := *s.cached
		return &cp, nil
	}
	return s.load()
}

// Save persists state to disk and updates the in-memory cache.
// CreatedAt is preserved from the previously saved state (or set to now on
// first save).  UpdatedAt is always set to the current wall-clock time.
func (s *Store) Save(st *SetupState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.save(st)
}

// MarkComplete is a convenience wrapper: it loads the current state, sets
// IsSetupComplete = true, applies the supplied updates, and saves.
func (s *Store) MarkComplete(mode Mode, selectedStack []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	st, err := s.load()
	if err != nil {
		return err
	}
	st.IsSetupComplete = true
	if mode != ModeUnset {
		st.Mode = mode
	}
	if selectedStack != nil {
		st.SelectedStack = selectedStack
	}
	return s.save(st)
}

// MarkDependenciesChecked sets DependenciesChecked = true on the stored state.
func (s *Store) MarkDependenciesChecked() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	st, err := s.load()
	if err != nil {
		return err
	}
	st.DependenciesChecked = true
	return s.save(st)
}

// StateFilePath returns the absolute path of the JSON state file.
func (s *Store) StateFilePath() string {
	return filepath.Join(s.stateDir, DefaultStateFileName)
}

// ── internal helpers ──────────────────────────────────────────────────────────

// load reads state from disk.  Must be called with s.mu held (either lock).
// On first call it checks for the legacy sentinel file so existing deployments
// continue to see IsSetupComplete = true without having to re-run setup.
func (s *Store) load() (*SetupState, error) {
	jsonPath := s.StateFilePath()

	data, err := os.ReadFile(jsonPath)
	if err == nil {
		// Happy path — JSON state file exists.
		var st SetupState
		if jsonErr := json.Unmarshal(data, &st); jsonErr != nil {
			return nil, jsonErr
		}
		s.cached = &st
		cp := st
		return &cp, nil
	}

	if !errors.Is(err, os.ErrNotExist) {
		// Unexpected I/O error (permissions etc.).
		return nil, err
	}

	// JSON file not found.  Build a default state, migrating from the legacy
	// sentinel file if present.
	st := defaultState()
	legacyPath := filepath.Join(s.stateDir, legacySentinelFile)
	if _, legacyErr := os.Stat(legacyPath); legacyErr == nil {
		// Legacy deployment: treat as complete with unknown mode.
		st.IsSetupComplete = true
		st.Mode = ModeUnset // mode unknown for pre-existing installs
		st.CreatedAt = legacyMtime(legacyPath)
		st.UpdatedAt = st.CreatedAt
	}

	s.cached = st
	cp := *st
	return &cp, nil
}

// save writes state to the JSON file and updates s.cached.
// Must be called with s.mu.Lock held.
func (s *Store) save(st *SetupState) error {
	now := time.Now().UTC()

	// Preserve CreatedAt if this is not the first save.
	if s.cached != nil && !s.cached.CreatedAt.IsZero() {
		st.CreatedAt = s.cached.CreatedAt
	} else if st.CreatedAt.IsZero() {
		st.CreatedAt = now
	}
	st.UpdatedAt = now

	// Ensure SelectedStack is never serialised as JSON null.
	if st.SelectedStack == nil {
		st.SelectedStack = []string{}
	}

	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}

	// Write atomically: write to a temp file then rename.
	dir := s.stateDir
	if mkErr := os.MkdirAll(dir, 0o755); mkErr != nil {
		return mkErr
	}

	tmp, err := os.CreateTemp(dir, ".setup-state-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()

	if _, writeErr := tmp.Write(data); writeErr != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return writeErr
	}
	if closeErr := tmp.Close(); closeErr != nil {
		_ = os.Remove(tmpName)
		return closeErr
	}

	finalPath := s.StateFilePath()
	if renameErr := os.Rename(tmpName, finalPath); renameErr != nil {
		_ = os.Remove(tmpName)
		return renameErr
	}

	s.cached = st
	return nil
}

// defaultState returns a pointer to a freshly initialised empty SetupState.
func defaultState() *SetupState {
	return &SetupState{
		IsSetupComplete:     false,
		Mode:                ModeUnset,
		DependenciesChecked: false,
		SelectedStack:       []string{},
	}
}

// legacyMtime returns the modification time of path, falling back to time.Now
// on error.
func legacyMtime(path string) time.Time {
	if fi, err := os.Stat(path); err == nil {
		return fi.ModTime().UTC()
	}
	return time.Now().UTC()
}
