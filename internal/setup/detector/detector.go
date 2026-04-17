// Package detector probes the host environment for the dependencies that
// FlexGate can optionally use.
//
// Design goals
// ─────────────
//   - Zero external dependencies — only stdlib (os/exec, net).
//   - Every probe runs with a tight deadline (default 3 s) so the API stays
//     fast even when a binary is missing or a port check hangs.
//   - All probes run concurrently; total wall time ≈ slowest single probe.
//   - Results are purely informational — the detector never installs anything.
//
// Usage
//
//	d := detector.New(detector.DefaultOptions())
//	report, err := d.Run(ctx)
package detector

import (
	"context"
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ── result types ──────────────────────────────────────────────────────────────

// ToolResult holds the outcome of a single CLI-tool probe.
type ToolResult struct {
	// Installed is true when the binary was found and returned a zero exit code.
	Installed bool `json:"installed"`
	// Version is the extracted version string (e.g. "1.24.0").
	// Empty when Installed is false.
	Version string `json:"version,omitempty"`
	// Error contains a short human-readable error message when Installed is
	// false.  Omitted from JSON when empty.
	Error string `json:"error,omitempty"`
}

// PortStatus describes whether a TCP port is in use on the local machine.
type PortStatus string

const (
	PortFree   PortStatus = "free"
	PortInUse  PortStatus = "in_use"
	PortUnknown PortStatus = "unknown"
)

// PortResult holds the outcome of a single port probe.
type PortResult struct {
	Port   int        `json:"port"`
	Status PortStatus `json:"status"`
}

// Report is the complete detection output returned by Run.
type Report struct {
	// Tool results — keyed by the canonical tool name.
	Nginx    ToolResult `json:"nginx"`
	HAProxy  ToolResult `json:"haproxy"`
	Docker   ToolResult `json:"docker"`
	Podman   ToolResult `json:"podman"`
	Postgres ToolResult `json:"postgres"`
	Redis    ToolResult `json:"redis"`
	Nats     ToolResult `json:"nats"`

	// Port results — keyed by the port number as a string (JSON maps need
	// string keys).
	Ports map[string]PortResult `json:"ports"`

	// DetectedAt is the UTC time the detection run completed.
	DetectedAt time.Time `json:"detectedAt"`
}

// ── options ───────────────────────────────────────────────────────────────────

// Options controls detector behaviour.
type Options struct {
	// ProbeTimeout is the per-probe deadline.  Defaults to 3 s.
	ProbeTimeout time.Duration
	// Ports is the list of TCP ports to check.  Defaults to [3000, 5432, 6379].
	Ports []int
	// PortDialTimeout is the per-port TCP dial timeout.  Defaults to 500 ms.
	PortDialTimeout time.Duration
}

// DefaultOptions returns the recommended Options for production use.
func DefaultOptions() Options {
	return Options{
		ProbeTimeout:    3 * time.Second,
		// 5432=postgres, 6379=redis, 4222=nats, 8080=proxy, 9090=admin
		Ports:           []int{5432, 6379, 4222, 8080, 9090},
		PortDialTimeout: 500 * time.Millisecond,
	}
}

// ── Detector ─────────────────────────────────────────────────────────────────

// Detector runs all environment probes.
type Detector struct {
	opts Options
}

// New creates a Detector with the supplied Options.
func New(opts Options) *Detector {
	if opts.ProbeTimeout <= 0 {
		opts.ProbeTimeout = DefaultOptions().ProbeTimeout
	}
	if len(opts.Ports) == 0 {
		opts.Ports = DefaultOptions().Ports
	}
	if opts.PortDialTimeout <= 0 {
		opts.PortDialTimeout = DefaultOptions().PortDialTimeout
	}
	return &Detector{opts: opts}
}

// Run executes all probes concurrently and returns a Report.
// The provided context can be used to cancel the whole run early.
func (d *Detector) Run(ctx context.Context) (Report, error) {
	type toolJob struct {
		name string
		dest *ToolResult
		fn   func(context.Context) ToolResult
	}

	var report Report
	report.Ports = make(map[string]PortResult, len(d.opts.Ports))

	jobs := []toolJob{
		{"nginx",    &report.Nginx,    d.probeNginx},
		{"haproxy",  &report.HAProxy,  d.probeHAProxy},
		{"docker",   &report.Docker,   d.probeDocker},
		{"podman",   &report.Podman,   d.probePodman},
		{"postgres", &report.Postgres, d.probePostgres},
		{"redis",    &report.Redis,    d.probeRedis},
		{"nats",     &report.Nats,     d.probeNats},
	}

	var wg sync.WaitGroup
	var mu sync.Mutex // guards report.Ports writes

	// ── tool probes ───────────────────────────────────────────────────────────
	for _, j := range jobs {
		j := j
		wg.Add(1)
		go func() {
			defer wg.Done()
			probeCtx, cancel := context.WithTimeout(ctx, d.opts.ProbeTimeout)
			defer cancel()
			result := j.fn(probeCtx)
			*j.dest = result
		}()
	}

	// ── port probes ───────────────────────────────────────────────────────────
	for _, port := range d.opts.Ports {
		port := port
		wg.Add(1)
		go func() {
			defer wg.Done()
			pr := d.probePort(ctx, port)
			mu.Lock()
			report.Ports[fmt.Sprintf("%d", port)] = pr
			mu.Unlock()
		}()
	}

	wg.Wait()
	report.DetectedAt = time.Now().UTC()
	return report, nil
}

// ── tool probes ───────────────────────────────────────────────────────────────

// probeNginx runs `nginx -v` and parses the version from stderr.
// nginx writes its version to stderr, not stdout.
func (d *Detector) probeNginx(ctx context.Context) ToolResult {
	// nginx -v prints to stderr: "nginx version: nginx/1.24.0"
	out, err := runCombined(ctx, "nginx", "-v")
	if err != nil {
		return failResult(err)
	}
	ver := extractFirst(out,
		regexp.MustCompile(`nginx/(\S+)`),
		regexp.MustCompile(`(\d+\.\d+[\.\d]*)`),
	)
	return ToolResult{Installed: true, Version: ver}
}

// probeHAProxy runs `haproxy -v` and parses the version.
func (d *Detector) probeHAProxy(ctx context.Context) ToolResult {
	// haproxy -v: "HAProxy version 2.8.3-1ubuntu3 2023/08/11 …"
	out, err := runCombined(ctx, "haproxy", "-v")
	if err != nil {
		return failResult(err)
	}
	ver := extractFirst(out,
		regexp.MustCompile(`HAProxy version (\S+)`),
		regexp.MustCompile(`(\d+\.\d+[\.\d]*)`),
	)
	return ToolResult{Installed: true, Version: ver}
}

// probeDocker runs `docker --version` and parses the version.
func (d *Detector) probeDocker(ctx context.Context) ToolResult {
	// "Docker version 26.1.4, build 5650f9b"
	out, err := runCombined(ctx, "docker", "--version")
	if err != nil {
		return failResult(err)
	}
	ver := extractFirst(out,
		regexp.MustCompile(`Docker version ([^,\s]+)`),
		regexp.MustCompile(`(\d+\.\d+[\.\d]*)`),
	)
	return ToolResult{Installed: true, Version: ver}
}

// probePodman runs `podman --version` and parses the version.
func (d *Detector) probePodman(ctx context.Context) ToolResult {
	// "podman version 4.9.3"
	out, err := runCombined(ctx, "podman", "--version")
	if err != nil {
		return failResult(err)
	}
	ver := extractFirst(out,
		regexp.MustCompile(`podman version (\S+)`),
		regexp.MustCompile(`(\d+\.\d+[\.\d]*)`),
	)
	return ToolResult{Installed: true, Version: ver}
}

// probePostgres checks if PostgreSQL is reachable.
// It prefers pg_isready (reliable, no credentials needed), then falls back
// to a raw TCP connect on port 5432.
func (d *Detector) probePostgres(ctx context.Context) ToolResult {
	// pg_isready exits 0 when the server accepts connections.
	if out, err := runCombined(ctx, "pg_isready", "-h", "localhost", "-p", "5432"); err == nil {
		ver := extractFirst(out, regexp.MustCompile(`(\d+\.\d+[\.\d]*)`))
		return ToolResult{Installed: true, Version: ver}
	}
	// Fall back to TCP reachability.
	dialCtx, cancel := context.WithTimeout(ctx, d.opts.PortDialTimeout)
	defer cancel()
	conn, err := (&net.Dialer{}).DialContext(dialCtx, "tcp", "127.0.0.1:5432")
	if err != nil {
		return failResult(err)
	}
	_ = conn.Close()
	return ToolResult{Installed: true, Version: ""}
}

// probeRedis checks if Redis is reachable.
// It prefers redis-cli PING, then falls back to TCP connect on port 6379.
func (d *Detector) probeRedis(ctx context.Context) ToolResult {
	out, err := runCombined(ctx, "redis-cli", "-h", "localhost", "-p", "6379", "ping")
	if err == nil && strings.Contains(out, "pong") {
		// Try to get version via redis-cli --version
		ver := ""
		if vout, verr := runCombined(ctx, "redis-cli", "--version"); verr == nil {
			ver = extractFirst(vout, regexp.MustCompile(`redis-cli (\S+)`),
				regexp.MustCompile(`(\d+\.\d+[\.\d]*)`))
		}
		return ToolResult{Installed: true, Version: ver}
	}
	// Fall back to TCP.
	dialCtx, cancel := context.WithTimeout(ctx, d.opts.PortDialTimeout)
	defer cancel()
	conn, err2 := (&net.Dialer{}).DialContext(dialCtx, "tcp", "127.0.0.1:6379")
	if err2 != nil {
		return failResult(err)
	}
	_ = conn.Close()
	return ToolResult{Installed: true, Version: ""}
}

// probeNats checks if a NATS server is reachable on port 4222.
// NATS doesn't have a CLI ping so we use TCP reachability only.
func (d *Detector) probeNats(ctx context.Context) ToolResult {
	dialCtx, cancel := context.WithTimeout(ctx, d.opts.PortDialTimeout)
	defer cancel()
	conn, err := (&net.Dialer{}).DialContext(dialCtx, "tcp", "127.0.0.1:4222")
	if err != nil {
		// Also check if nats-server binary exists (not running but installed).
		if _, binErr := runCombined(ctx, "nats-server", "--version"); binErr == nil {
			return ToolResult{Installed: false, Error: "not running — start with: nats-server -p 4222"}
		}
		return failResult(err)
	}
	_ = conn.Close()
	ver := ""
	if vout, verr := runCombined(ctx, "nats-server", "--version"); verr == nil {
		ver = extractFirst(vout, regexp.MustCompile(`v(\S+)`), regexp.MustCompile(`(\d+\.\d+[\.\d]*)`))
	}
	return ToolResult{Installed: true, Version: ver}
}

// ── port probe ────────────────────────────────────────────────────────────────

// probePort attempts a TCP connection to 127.0.0.1:<port>.
// If the connection succeeds the port is "in_use"; if it is refused it is
// "free"; any other error yields "unknown".
func (d *Detector) probePort(ctx context.Context, port int) PortResult {
	dialCtx, cancel := context.WithTimeout(ctx, d.opts.PortDialTimeout)
	defer cancel()

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	conn, err := (&net.Dialer{}).DialContext(dialCtx, "tcp", addr)
	if err == nil {
		_ = conn.Close()
		return PortResult{Port: port, Status: PortInUse}
	}

	// A "connection refused" error means the port is free.
	if isConnRefused(err) {
		return PortResult{Port: port, Status: PortFree}
	}

	// Timeout, network unreachable, etc.
	return PortResult{Port: port, Status: PortUnknown}
}

// ── helpers ───────────────────────────────────────────────────────────────────

// runCombined executes name with args, merges stdout+stderr, and returns the
// combined output as a lowercase string.  It returns an error if the binary is
// not found or the process exits non-zero AND produced no output.
func runCombined(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		// Some tools (e.g. nginx -v) exit 0 but others exit 1 on version flags.
		// If we got output we treat it as success regardless of exit code.
		if text != "" {
			return strings.ToLower(text), nil
		}
		// Binary not found or execution failed with no output.
		if exitErr, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("exited %d", exitErr.ExitCode())
		}
		// exec.ErrNotFound or path error.
		return "", err
	}
	return strings.ToLower(text), nil
}

// extractFirst tries each regexp in order and returns the first capturing
// group of the first match.  Returns "" if nothing matches.
func extractFirst(text string, patterns ...*regexp.Regexp) string {
	for _, re := range patterns {
		if m := re.FindStringSubmatch(text); len(m) >= 2 {
			return m[1]
		}
	}
	return ""
}

// failResult converts a probe error into a ToolResult with Installed=false.
func failResult(err error) ToolResult {
	msg := ""
	if err != nil {
		msg = err.Error()
		// Normalise "executable file not found" noise.
		if strings.Contains(msg, "executable file not found") ||
			strings.Contains(msg, "no such file") {
			msg = "not found"
		}
	}
	return ToolResult{Installed: false, Error: msg}
}

// isConnRefused returns true when the error is a TCP connection-refused error.
func isConnRefused(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "connection refused") ||
		strings.Contains(s, "connect: connection refused")
}
