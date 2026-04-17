// Package runner implements the FlexGate setup execution engine.
//
// Each setup run is modelled as an ordered list of Tasks.  Run() walks them
// sequentially and streams SSE-compatible Event values on a channel.
//
// Design goals:
//   - No goroutine leaks — Run() respects context cancellation.
//   - Idempotent tasks — each Run function checks state before acting.
//   - Streaming-first — events are emitted mid-run, not batched.
//   - No forced installs — tasks for optional deps skip gracefully.
//
// Task list (mode-aware):
//
//	BOTH MODES
//	  1. validate-state      — mode + stack must be set
//	  2. check-ports         — FlexGate proxy (8080) + admin (9090) ports
//	  3. init-dirs           — create logs/ and config/ dirs
//	  4. verify-binary       — locate the running executable
//	  5. write-config        — persist DependenciesChecked=true
//
//	FULL MODE (appended after common tasks)
//	  6.  check-container-runtime — docker or podman must be present
//	  7.  check-postgres          — TCP 5432 reachable (if "postgres" in stack)
//	  8.  check-redis             — redis-cli ping / TCP 6379 (if "redis")
//	  9.  check-nats             — TCP 4222 reachable (if "nats" in stack)
//	  10. check-nginx             — nginx -v (if "nginx" in stack)
//	  11. check-haproxy           — haproxy -v (if "haproxy" in stack)
//	  12. run-migrations          — goose / migrate up (if "postgres" in stack)
//
//	BENCHMARK MODE (appended after common tasks)
//	  6. check-benchmark-ports — confirm port 8081 is available
package runner

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/setup"
)

// ── Event ─────────────────────────────────────────────────────────────────────

type EventType string

const (
	EventStarted   EventType = "started"
	EventTaskBegin EventType = "task_begin"
	EventTaskDone  EventType = "task_done"
	EventTaskSkip  EventType = "task_skip"
	EventTaskFail  EventType = "task_fail"
	EventLog       EventType = "log"
	EventProgress  EventType = "progress"
	EventDone      EventType = "done"
	EventError     EventType = "error"
)

type TaskStatus string

const (
	StatusPending TaskStatus = "pending"
	StatusRunning TaskStatus = "running"
	StatusDone    TaskStatus = "done"
	StatusSkipped TaskStatus = "skipped"
	StatusFailed  TaskStatus = "failed"
)

// Event is a single progress update streamed to SSE clients.
type Event struct {
	Type      EventType  `json:"type"`
	TaskID    string     `json:"taskId,omitempty"`
	TaskName  string     `json:"taskName,omitempty"`
	Status    TaskStatus `json:"status,omitempty"`
	Message   string     `json:"message,omitempty"`
	Progress  int        `json:"progress,omitempty"` // 0-100
	Fatal     bool       `json:"fatal,omitempty"`
	Timestamp string     `json:"timestamp"`
}

func newEvent(typ EventType) Event {
	return Event{Type: typ, Timestamp: time.Now().UTC().Format(time.RFC3339)}
}

// ── Task ──────────────────────────────────────────────────────────────────────

// Task is one step in the setup sequence.
type Task struct {
	ID       string
	Name     string
	Optional bool // if true, failure is non-fatal
	// Run does the work. Call emit() to stream log lines.
	// Return (skipped=true, nil) to signal intentional skip.
	Run func(ctx context.Context, emit func(msg string)) (skipped bool, err error)
}

// ── Runner ────────────────────────────────────────────────────────────────────

// Runner executes an ordered list of Tasks and streams Events.
type Runner struct {
	mu      sync.Mutex
	tasks   []Task
	store   *setup.Store
	log     zerolog.Logger
	running bool
}

// New creates a Runner backed by store, with the default task list.
func New(store *setup.Store, log zerolog.Logger) *Runner {
	return &Runner{
		store: store,
		log:   log,
		tasks: defaultTasks(store),
	}
}

// IsRunning reports whether a run is currently in progress.
func (r *Runner) IsRunning() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.running
}

// Run executes all tasks, sending Events to the returned channel.
// The channel is closed when the run finishes (or ctx is cancelled).
// Only one concurrent run is allowed.
func (r *Runner) Run(ctx context.Context) <-chan Event {
	out := make(chan Event, 64)

	r.mu.Lock()
	if r.running {
		r.mu.Unlock()
		go func() {
			defer close(out)
			e := newEvent(EventError)
			e.Message = "setup run already in progress"
			e.Fatal = true
			out <- e
		}()
		return out
	}
	r.running = true
	r.mu.Unlock()

	go func() {
		defer close(out)
		defer func() {
			r.mu.Lock()
			r.running = false
			r.mu.Unlock()
		}()

		send := func(e Event) {
			select {
			case out <- e:
			case <-ctx.Done():
			}
		}

		started := newEvent(EventStarted)
		started.Message = fmt.Sprintf("Starting setup — %d tasks", len(r.tasks))
		send(started)

		total := len(r.tasks)
		completed := 0

		for _, task := range r.tasks {
			if ctx.Err() != nil {
				e := newEvent(EventError)
				e.Message = "setup cancelled"
				e.Fatal = true
				send(e)
				return
			}

			begin := newEvent(EventTaskBegin)
			begin.TaskID = task.ID
			begin.TaskName = task.Name
			begin.Status = StatusRunning
			send(begin)

			emit := func(msg string) {
				e := newEvent(EventLog)
				e.TaskID = task.ID
				e.Message = msg
				send(e)
			}

			skipped, err := task.Run(ctx, emit)
			completed++
			pct := (completed * 100) / total

			prog := newEvent(EventProgress)
			prog.Progress = pct
			send(prog)

			switch {
			case skipped:
				e := newEvent(EventTaskSkip)
				e.TaskID, e.TaskName = task.ID, task.Name
				e.Status = StatusSkipped
				e.Message = "skipped — dependency not selected"
				send(e)

			case err != nil && !task.Optional:
				e := newEvent(EventTaskFail)
				e.TaskID, e.TaskName = task.ID, task.Name
				e.Status = StatusFailed
				e.Message = err.Error()
				e.Fatal = true
				send(e)

				fatal := newEvent(EventError)
				fatal.Message = fmt.Sprintf("task %q failed: %s", task.ID, err)
				fatal.Fatal = true
				send(fatal)
				return

			case err != nil && task.Optional:
				e := newEvent(EventTaskFail)
				e.TaskID, e.TaskName = task.ID, task.Name
				e.Status = StatusFailed
				e.Message = err.Error()
				send(e)

			default:
				e := newEvent(EventTaskDone)
				e.TaskID, e.TaskName = task.ID, task.Name
				e.Status = StatusDone
				send(e)
			}
		}

		final := newEvent(EventDone)
		final.Progress = 100
		final.Message = "Setup complete"
		send(final)
	}()

	return out
}

// ── Default task list ─────────────────────────────────────────────────────────

// defaultTasks builds a mode-aware ordered task list.
// Common tasks run for every mode; mode-specific tasks are appended.
// This is called once at Runner construction time — the mode must already
// be set before New() is called (wizard posts /api/setup/mode first).
func defaultTasks(store *setup.Store) []Task {
	common := commonTasks(store)
	st, _ := store.Get()
	switch st.Mode {
	case setup.ModeFull:
		return append(common, fullModeTasks(store)...)
	case setup.ModeBenchmark:
		return append(common, benchmarkModeTasks()...)
	default:
		// ModeUnset — validate-state will catch this and fail fast.
		return common
	}
}

// ── Common tasks (both modes) ─────────────────────────────────────────────────

func commonTasks(store *setup.Store) []Task {
	return []Task{
		{
			ID:   "validate-state",
			Name: "Validate setup configuration",
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				st, err := store.Get()
				if err != nil {
					return false, fmt.Errorf("cannot read setup state: %w", err)
				}
				if st.Mode == setup.ModeUnset {
					return false, fmt.Errorf("setup mode has not been selected")
				}
				emit(fmt.Sprintf("mode=%s  stack=%v", st.Mode, st.SelectedStack))
				return false, nil
			},
		},
		{
			ID:   "check-ports",
			Name: "Check required port availability",
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				type check struct{ name, port string }
				for _, c := range []check{
					{"FlexGate proxy", "8080"},
					{"Admin API", "9090"},
				} {
					free, _ := isPortFree(c.port)
					if free {
						emit(fmt.Sprintf("✔  port %s (%s): free", c.port, c.name))
					} else {
						// In-use is expected if FlexGate is already running (self-check).
						emit(fmt.Sprintf("⚠  port %s (%s): already in use — OK if FlexGate is running", c.port, c.name))
					}
				}
				return false, nil
			},
		},
		{
			ID:   "init-dirs",
			Name: "Initialise runtime directories",
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				for _, d := range []string{"logs", "config"} {
					if err := os.MkdirAll(d, 0o755); err != nil {
						return false, fmt.Errorf("mkdir %s: %w", d, err)
					}
					emit(fmt.Sprintf("✔  %s/", d))
				}
				return false, nil
			},
		},
		{
			ID:   "verify-binary",
			Name: "Verify FlexGate proxy binary",
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				self, err := os.Executable()
				if err != nil {
					return false, fmt.Errorf("cannot locate binary: %w", err)
				}
				emit(fmt.Sprintf("✔  binary: %s", self))
				return false, nil
			},
		},
		{
			ID:   "write-config",
			Name: "Write FlexGate configuration",
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				st, err := store.Get()
				if err != nil {
					return false, err
				}
				emit(fmt.Sprintf("mode: %s", st.Mode))
				emit(fmt.Sprintf("stack: %v", st.SelectedStack))
				st.DependenciesChecked = true
				if err := store.Save(st); err != nil {
					return false, fmt.Errorf("failed to save state: %w", err)
				}
				emit("✔  configuration written")
				return false, nil
			},
		},
	}
}

// ── Full-mode tasks ───────────────────────────────────────────────────────────

func fullModeTasks(store *setup.Store) []Task {
	return []Task{
		// ── Container runtime ─────────────────────────────────────────────────
		{
			ID:       "check-container-runtime",
			Name:     "Check container runtime (Docker / Podman)",
			Optional: true,
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				if ver, err := toolVersion("docker", "--version"); err == nil {
					emit("✔  Docker: " + ver)
					return false, nil
				}
				if ver, err := toolVersion("podman", "--version"); err == nil {
					emit("✔  Podman: " + ver)
					return false, nil
				}
				// Neither found — warn but don't block; services can run natively.
				emit("⚠  neither Docker nor Podman found — services must be started manually")
				return false, nil
			},
		},

		// ── PostgreSQL ────────────────────────────────────────────────────────
		{
			ID:       "check-postgres",
			Name:     "Check PostgreSQL (port 5432)",
			Optional: true,
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				st, _ := store.Get()
				if !stackHas(st.SelectedStack, "postgres") {
					return true, nil
				}
				// pg_isready is the most reliable liveness check — no credentials needed.
				if out, err := toolVersion("pg_isready", "-h", "localhost", "-p", "5432"); err == nil {
					emit("✔  pg_isready: " + out)
					return false, nil
				}
				if err := tcpReach("localhost:5432", 3*time.Second); err != nil {
					return false, fmt.Errorf(
						"PostgreSQL not reachable on :5432 — "+
							"start with `podman-compose up -d postgres` or `brew services start postgresql@15`: %w", err)
				}
				emit("✔  PostgreSQL: port 5432 reachable")
				return false, nil
			},
		},

		// ── Redis ─────────────────────────────────────────────────────────────
		{
			ID:       "check-redis",
			Name:     "Check Redis (port 6379)",
			Optional: true,
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				st, _ := store.Get()
				if !stackHas(st.SelectedStack, "redis") {
					return true, nil
				}
				if out, err := toolVersion("redis-cli", "-h", "localhost", "-p", "6379", "ping"); err == nil {
					if strings.Contains(strings.ToLower(out), "pong") {
						emit("✔  Redis: PONG received")
						return false, nil
					}
				}
				if err := tcpReach("localhost:6379", 3*time.Second); err != nil {
					return false, fmt.Errorf(
						"Redis not reachable on :6379 — "+
							"start with `podman-compose up -d redis` or `brew services start redis`: %w", err)
				}
				emit("✔  Redis: port 6379 reachable")
				return false, nil
			},
		},

		// ── NATS ──────────────────────────────────────────────────────────────
		{
			ID:       "check-nats",
			Name:     "Check NATS server (port 4222)",
			Optional: true,
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				st, _ := store.Get()
				if !stackHas(st.SelectedStack, "nats") {
					return true, nil
				}
				if err := tcpReach("localhost:4222", 3*time.Second); err != nil {
					return false, fmt.Errorf(
						"NATS server not reachable on :4222 — "+
							"start with `nats-server -p 4222` or `podman-compose up -d nats`: %w", err)
				}
				emit("✔  NATS: port 4222 reachable")
				if ver, err := toolVersion("nats-server", "--version"); err == nil {
					emit("    version: " + ver)
				}
				return false, nil
			},
		},

		// ── Nginx ─────────────────────────────────────────────────────────────
		{
			ID:       "check-nginx",
			Name:     "Verify Nginx availability",
			Optional: true,
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				st, _ := store.Get()
				if !stackHas(st.SelectedStack, "nginx") {
					return true, nil
				}
				ver, err := toolVersion("nginx", "-v")
				if err != nil {
					return false, fmt.Errorf("nginx not found: %w", err)
				}
				emit("✔  " + ver)
				return false, nil
			},
		},

		// ── HAProxy ───────────────────────────────────────────────────────────
		{
			ID:       "check-haproxy",
			Name:     "Verify HAProxy availability",
			Optional: true,
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				st, _ := store.Get()
				if !stackHas(st.SelectedStack, "haproxy") {
					return true, nil
				}
				ver, err := toolVersion("haproxy", "-v")
				if err != nil {
					return false, fmt.Errorf("haproxy not found: %w", err)
				}
				emit("✔  " + ver)
				return false, nil
			},
		},

		// ── Database migrations ───────────────────────────────────────────────
		{
			ID:       "run-migrations",
			Name:     "Run database migrations",
			Optional: true,
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				st, _ := store.Get()
				if !stackHas(st.SelectedStack, "postgres") {
					return true, nil
				}
				// Try goose first (preferred), then golang-migrate.
				if _, err := exec.LookPath("goose"); err == nil {
					emit("running: goose up (migrations/)")
					cmd := exec.CommandContext(ctx, "goose",
						"-dir", "migrations",
						"postgres", os.Getenv("DATABASE_URL"),
						"up",
					)
					out, runErr := cmd.CombinedOutput()
					if runErr != nil {
						emit("⚠  goose failed — " + strings.TrimSpace(string(out)))
						return false, fmt.Errorf("goose up: %w", runErr)
					}
					emit("✔  migrations applied: " + strings.TrimSpace(string(out)))
					return false, nil
				}
				if _, err := exec.LookPath("migrate"); err == nil {
					emit("running: migrate up (migrations/)")
					cmd := exec.CommandContext(ctx, "migrate",
						"-path", "migrations",
						"-database", os.Getenv("DATABASE_URL"),
						"up",
					)
					out, runErr := cmd.CombinedOutput()
					if runErr != nil {
						emit("⚠  migrate failed — " + strings.TrimSpace(string(out)))
						return false, fmt.Errorf("migrate up: %w", runErr)
					}
					emit("✔  migrations applied")
					return false, nil
				}
				emit("⚠  no migration tool found (goose / migrate) — run migrations manually before starting")
				return false, nil
			},
		},
	}
}

// ── Benchmark-mode tasks ──────────────────────────────────────────────────────

func benchmarkModeTasks() []Task {
	return []Task{
		{
			ID:   "check-benchmark-ports",
			Name: "Check benchmark runner port (8081)",
			Run: func(ctx context.Context, emit func(string)) (bool, error) {
				free, _ := isPortFree("8081")
				if free {
					emit("✔  port 8081 (benchmark runner): free")
				} else {
					emit("⚠  port 8081 already in use — benchmark runner may conflict")
				}
				return false, nil
			},
		},
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func stackHas(stack []string, name string) bool {
	for _, s := range stack {
		key := s
		if idx := strings.Index(s, ":"); idx >= 0 {
			key = s[idx+1:]
		}
		if strings.EqualFold(key, name) {
			return true
		}
	}
	return false
}

func toolVersion(cmd string, args ...string) (string, error) {
	out, err := exec.Command(cmd, args...).CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		// Some tools (e.g. nginx -v) write to stderr and exit non-zero.
		if text != "" {
			return strings.ToLower(text), nil
		}
		return "", err
	}
	lines := strings.SplitN(text, "\n", 2)
	if len(lines) > 0 && lines[0] != "" {
		return lines[0], nil
	}
	return cmd, nil
}

func isPortFree(port string) (bool, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		return false, nil
	}
	_ = ln.Close()
	return true, nil
}

// tcpReach attempts a TCP connection to addr. Returns nil when the server is
// listening (connection accepted), error otherwise.
func tcpReach(addr string, timeout time.Duration) error {
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return err
	}
	_ = conn.Close()
	return nil
}
