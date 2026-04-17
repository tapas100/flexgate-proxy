// Package handlers — dependency installation endpoint.
//
//	POST /api/setup/install
//	Body: { "dep": "postgres" | "redis" | "nats" | "nginx" | "haproxy" | "docker" | "podman" }
//	Query: ?method=brew|apt|podman   (optional override)
//
// Streams newline-delimited JSON events (same shape as setup_run.go):
//
//	{"type":"log",     "message":"...", "timestamp":"..."}
//	{"type":"done",    "message":"Install complete", "timestamp":"..."}
//	{"type":"error",   "message":"...", "fatal":true, "timestamp":"..."}
package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

// ── Install recipes ───────────────────────────────────────────────────────────

type installMethod string

const (
	methodBrew   installMethod = "brew"
	methodApt    installMethod = "apt"
	methodPodman installMethod = "podman"
)

// recipe describes how to install one dependency.
type recipe struct {
	// brew/apt command args (nil = not supported via this method)
	brewArgs   []string
	aptArgs    []string
	// podman run one-shot container (nil = not supported via podman)
	podmanArgs []string
	// postInstall is an optional command to start the service after install.
	postInstall []string
}

var recipes = map[string]recipe{
	"postgres": {
		brewArgs:    []string{"install", "postgresql@15"},
		aptArgs:     []string{"install", "-y", "postgresql-15"},
		podmanArgs:  []string{"run", "-d", "--name", "flexgate-postgres", "-e", "POSTGRES_PASSWORD=flexgate", "-e", "POSTGRES_USER=flexgate", "-e", "POSTGRES_DB=flexgate", "-p", "5432:5432", "postgres:15-alpine"},
		postInstall: nil, // brew services start / systemctl handled separately
	},
	"redis": {
		brewArgs:    []string{"install", "redis"},
		aptArgs:     []string{"install", "-y", "redis-server"},
		podmanArgs:  []string{"run", "-d", "--name", "flexgate-redis", "-p", "6379:6379", "redis:7-alpine", "redis-server", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"},
		postInstall: nil,
	},
	"nats": {
		brewArgs:    []string{"install", "nats-server"},
		aptArgs:     nil, // no apt package; use podman or binary
		podmanArgs:  []string{"run", "-d", "--name", "flexgate-nats", "-p", "4222:4222", "-p", "8222:8222", "nats:latest", "-p", "4222"},
		postInstall: nil,
	},
	"nginx": {
		brewArgs:    []string{"install", "nginx"},
		aptArgs:     []string{"install", "-y", "nginx"},
		podmanArgs:  nil,
		postInstall: nil,
	},
	"haproxy": {
		brewArgs:    []string{"install", "haproxy"},
		aptArgs:     []string{"install", "-y", "haproxy"},
		podmanArgs:  nil,
		postInstall: nil,
	},
	"docker": {
		brewArgs:    []string{"install", "--cask", "docker"},
		aptArgs:     nil, // Docker on Linux requires the official script
		podmanArgs:  nil,
		postInstall: nil,
	},
	"podman": {
		brewArgs:    []string{"install", "podman"},
		aptArgs:     []string{"install", "-y", "podman"},
		podmanArgs:  nil,
		postInstall: nil,
	},
}

// ── Handler ───────────────────────────────────────────────────────────────────

// InstallHandler handles POST /api/setup/install.
type InstallHandler struct {
	log zerolog.Logger
}

// NewInstallHandler creates an InstallHandler.
func NewInstallHandler(log zerolog.Logger) *InstallHandler {
	return &InstallHandler{log: log}
}

// installEvent is the SSE event shape (reuses same structure as runner events).
type installEvent struct {
	Type      string `json:"type"`
	Message   string `json:"message"`
	Fatal     bool   `json:"fatal,omitempty"`
	Timestamp string `json:"timestamp"`
}

func installEvt(typ, msg string) installEvent {
	return installEvent{Type: typ, Message: msg, Timestamp: time.Now().UTC().Format(time.RFC3339)}
}

// Install handles POST /api/setup/install.
// It resolves the best install method for the current OS, runs the command,
// and streams JSON event lines until done.
func (h *InstallHandler) Install(w http.ResponseWriter, r *http.Request) {
	// ── Parse request ─────────────────────────────────────────────────────
	var body struct {
		Dep    string `json:"dep"`
		Method string `json:"method"` // optional override: brew|apt|podman
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Dep == "" {
		http.Error(w, `{"error":"missing dep field"}`, http.StatusBadRequest)
		return
	}

	rec, ok := recipes[strings.ToLower(body.Dep)]
	if !ok {
		http.Error(w, fmt.Sprintf(`{"error":"unknown dep %q"}`, body.Dep), http.StatusBadRequest)
		return
	}

	// ── Set up SSE stream ──────────────────────────────────────────────────
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	flush := func() {
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}

	send := func(evt installEvent) {
		b, _ := json.Marshal(evt)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
		flush()
	}

	ctx := r.Context()

	// ── Resolve method ─────────────────────────────────────────────────────
	method, cmdArgs, err := resolveMethod(body.Method, rec, body.Dep)
	if err != nil {
		send(installEvt("error", err.Error()))
		return
	}

	send(installEvt("log", fmt.Sprintf("Installing %s via %s…", body.Dep, method)))
	send(installEvt("log", fmt.Sprintf("$ %s %s", cmdArgs[0], strings.Join(cmdArgs[1:], " "))))

	// ── Run command with streaming output ─────────────────────────────────
	if err := streamCommand(ctx, cmdArgs, func(line string) {
		send(installEvt("log", line))
	}); err != nil {
		send(installEvt("error", fmt.Sprintf("Install failed: %s", err.Error())))
		return
	}

	// ── Post-install start (brew services / systemctl) ────────────────────
	if method == methodBrew {
		startArgs := brewServiceStart(body.Dep)
		if startArgs != nil {
			send(installEvt("log", fmt.Sprintf("Starting service: $ %s", strings.Join(startArgs, " "))))
			_ = streamCommand(ctx, startArgs, func(line string) {
				send(installEvt("log", line))
			})
		}
	}

	send(installEvt("done", fmt.Sprintf("%s installed successfully ✓", body.Dep)))
}

// ── helpers ───────────────────────────────────────────────────────────────────

func resolveMethod(override string, rec recipe, dep string) (installMethod, []string, error) {
	// If the caller explicitly requested a method, try it.
	if override != "" {
		switch installMethod(override) {
		case methodPodman:
			if rec.podmanArgs != nil {
				if bin, err := findBin("podman", "docker"); err == nil {
					return methodPodman, append([]string{bin}, rec.podmanArgs...), nil
				}
			}
			return "", nil, fmt.Errorf("podman/docker not found — cannot use container method")
		case methodBrew:
			if rec.brewArgs != nil {
				return methodBrew, append([]string{"brew"}, rec.brewArgs...), nil
			}
			return "", nil, fmt.Errorf("no brew recipe for %s", dep)
		case methodApt:
			if rec.aptArgs != nil {
				return methodApt, append([]string{"apt-get"}, rec.aptArgs...), nil
			}
			return "", nil, fmt.Errorf("no apt recipe for %s", dep)
		}
	}

	// Auto-detect best method for the current OS.
	switch runtime.GOOS {
	case "darwin":
		// macOS: prefer brew, fall back to podman.
		if _, err := exec.LookPath("brew"); err == nil && rec.brewArgs != nil {
			return methodBrew, append([]string{"brew"}, rec.brewArgs...), nil
		}
		if bin, err := findBin("podman", "docker"); err == nil && rec.podmanArgs != nil {
			return methodPodman, append([]string{bin}, rec.podmanArgs...), nil
		}
		return "", nil, fmt.Errorf(
			"neither Homebrew nor a container runtime (podman/docker) found on macOS — "+
				"install Homebrew from https://brew.sh or Podman Desktop from https://podman-desktop.io")

	case "linux":
		// Linux: prefer podman/docker (no sudo needed for podman),
		// fall back to apt-get.
		if bin, err := findBin("podman", "docker"); err == nil && rec.podmanArgs != nil {
			return methodPodman, append([]string{bin}, rec.podmanArgs...), nil
		}
		if _, err := exec.LookPath("apt-get"); err == nil && rec.aptArgs != nil {
			return methodApt, append([]string{"apt-get"}, rec.aptArgs...), nil
		}
		return "", nil, fmt.Errorf("no supported install method found for Linux (tried podman/docker, apt-get)")

	default:
		return "", nil, fmt.Errorf("unsupported OS %q — install %s manually", runtime.GOOS, dep)
	}
}

// brewServiceStart returns the `brew services start <svc>` args for deps
// that need a daemon. Returns nil if no start command is needed.
func brewServiceStart(dep string) []string {
	svcMap := map[string]string{
		"postgres": "postgresql@15",
		"redis":    "redis",
		"nats":     "nats-server",
		"nginx":    "nginx",
		"haproxy":  "haproxy",
	}
	if svc, ok := svcMap[dep]; ok {
		return []string{"brew", "services", "start", svc}
	}
	return nil
}

// findBin returns the path to the first binary found in the list.
func findBin(bins ...string) (string, error) {
	for _, b := range bins {
		if p, err := exec.LookPath(b); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("none of %v found", bins)
}

// streamCommand runs cmd, streams each output line to onLine, and returns
// any non-zero exit error.
func streamCommand(ctx context.Context, args []string, onLine func(string)) error {
	if len(args) == 0 {
		return fmt.Errorf("empty command")
	}
	cmd := exec.CommandContext(ctx, args[0], args[1:]...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout // merge stderr into stdout pipe

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if line != "" {
			onLine(line)
		}
	}

	return cmd.Wait()
}
