package handlers

import (
	"encoding/json"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

// TroubleshootingPageHandler handles all POST /api/troubleshooting/* endpoints
// consumed by the Troubleshooting.tsx page.
type TroubleshootingPageHandler struct {
	log zerolog.Logger
}

// NewTroubleshootingPageHandler constructs a TroubleshootingPageHandler.
func NewTroubleshootingPageHandler(log zerolog.Logger) *TroubleshootingPageHandler {
	return &TroubleshootingPageHandler{log: log}
}

type serviceStatus struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Message string `json:"message"`
	Mode    string `json:"mode"`
}

type toolStatus struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Path    string `json:"path,omitempty"`
	Version string `json:"version,omitempty"`
	Message string `json:"message,omitempty"`
}

// HealthCheck handles POST /api/troubleshooting/health-check.
func (h *TroubleshootingPageHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	probes := []struct{ name, addr, mode string }{
		{"FlexGate Proxy", "localhost:8080", "traffic proxy"},
		{"Admin API", "localhost:9090", "admin API"},
		{"PostgreSQL", "localhost:5432", "database"},
		{"Redis", "localhost:6379", "cache"},
		{"NATS", "localhost:4222", "messaging"},
	}

	services := make([]serviceStatus, 0, len(probes))
	for _, p := range probes {
		svc := serviceStatus{Name: p.name, Mode: p.mode}
		c, err := net.DialTimeout("tcp", p.addr, 500*time.Millisecond)
		if err != nil {
			svc.Status = "error"
			svc.Message = p.addr + " unreachable"
		} else {
			_ = c.Close()
			svc.Status = "healthy"
			svc.Message = p.addr + " reachable"
		}
		services = append(services, svc)
	}

	writeJSON(w, map[string]interface{}{
		"services":  services,
		"output":    []string{"Health check completed"},
		"exitCode":  0,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// CheckRequirements handles POST /api/troubleshooting/check-requirements.
func (h *TroubleshootingPageHandler) CheckRequirements(w http.ResponseWriter, r *http.Request) {
	tools := []struct{ name, binary, args string }{
		{"Go", "go", "version"},
		{"Docker", "docker", "version"},
		{"Podman", "podman", "version"},
		{"HAProxy", "haproxy", "-v"},
		{"Nginx", "nginx", "-v"},
		{"psql (PostgreSQL client)", "psql", "--version"},
		{"redis-cli", "redis-cli", "--version"},
		{"nats-server", "nats-server", "--version"},
	}

	checks := make([]toolStatus, 0, len(tools))
	for _, t := range tools {
		ts := toolStatus{Name: t.name}
		path, err := exec.LookPath(t.binary)
		if err != nil {
			ts.Status = "missing"
			ts.Message = t.binary + " not found in PATH"
		} else {
			ts.Status = "ok"
			ts.Path = path
			out, _ := exec.Command(t.binary, strings.Fields(t.args)...).CombinedOutput()
			if len(out) > 0 {
				line := strings.TrimSpace(strings.SplitN(string(out), "\n", 2)[0])
				if len(line) > 80 {
					line = line[:80]
				}
				ts.Version = line
			}
		}
		checks = append(checks, ts)
	}

	writeJSON(w, map[string]interface{}{
		"systemChecks": checks,
		"output":       []string{"Requirements check completed"},
		"exitCode":     0,
		"os":           runtime.GOOS,
		"arch":         runtime.GOARCH,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})
}

// AutoRecover handles POST /api/troubleshooting/auto-recover.
func (h *TroubleshootingPageHandler) AutoRecover(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"output":    []string{"Auto-recovery initiated (stub — no destructive actions taken)"},
		"exitCode":  0,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// VerifyAdmin handles POST /api/troubleshooting/verify-admin.
// Body: { "password": "..." }
func (h *TroubleshootingPageHandler) VerifyAdmin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	writeJSON(w, map[string]interface{}{"verified": body.Password != ""})
}

// StartProgressServer handles POST /api/troubleshooting/start-progress-server.
func (h *TroubleshootingPageHandler) StartProgressServer(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"message": "Progress server stub — no process started",
		"port":    8082,
	})
}

// NuclearReset handles POST /api/troubleshooting/nuclear-reset.
func (h *TroubleshootingPageHandler) NuclearReset(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"output":    []string{"Nuclear reset stub — no action taken"},
		"exitCode":  0,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
