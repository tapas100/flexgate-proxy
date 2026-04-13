package security_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/flexgate/proxy/internal/security"
)

// ── NoopClient ────────────────────────────────────────────────────────────────

func TestNoopClient_AlwaysAllows(t *testing.T) {
	c := security.NoopClient{}
	res, err := c.Validate(context.Background(), "http://10.0.0.1/", "1.2.3.4")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Allowed {
		t.Errorf("NoopClient must always return allowed=true")
	}
}

// ── HTTPClient — allowed response ─────────────────────────────────────────────

func TestHTTPClient_Allowed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(security.ValidationResult{
			Allowed:     true,
			Reason:      "ok",
			ResolvedIPs: []string{"93.184.216.34"},
		})
	}))
	defer srv.Close()

	c := security.NewClient(srv.URL)
	res, err := c.Validate(context.Background(), "https://example.com/", "1.2.3.4")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Allowed {
		t.Errorf("expected allowed=true, got false (reason=%q)", res.Reason)
	}
	if len(res.ResolvedIPs) == 0 {
		t.Errorf("expected resolved_ips to be populated")
	}
}

// ── HTTPClient — blocked response ─────────────────────────────────────────────

func TestHTTPClient_Blocked(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(security.ValidationResult{
			Allowed: false,
			Reason:  "blocked IP: 10.0.0.1 is in private range 10.0.0.0/8",
		})
	}))
	defer srv.Close()

	c := security.NewClient(srv.URL)
	res, err := c.Validate(context.Background(), "http://10.0.0.1/", "1.2.3.4")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Allowed {
		t.Errorf("expected allowed=false for a blocked upstream")
	}
}

// ── HTTPClient — sidecar unreachable → fail-open ──────────────────────────────

func TestHTTPClient_SidecarUnreachable_FailOpen(t *testing.T) {
	// Use a listener that immediately refuses connections.
	c := security.NewClient("http://127.0.0.1:1") // port 1 is always refused
	res, err := c.Validate(context.Background(), "http://10.0.0.1/", "1.2.3.4")
	// Must return an error AND allowed=true (fail-open).
	if err == nil {
		t.Fatal("expected a connection error")
	}
	if !res.Allowed {
		t.Errorf("fail-open: expected allowed=true when sidecar is unreachable")
	}
}

// ── HTTPClient — context deadline exceeded → fail-open ────────────────────────

func TestHTTPClient_ContextTimeout_FailOpen(t *testing.T) {
	// Slow sidecar that never responds within 1 µs.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		_ = json.NewEncoder(w).Encode(security.ValidationResult{Allowed: false, Reason: "blocked"})
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Microsecond)
	defer cancel()

	c := security.NewClient(srv.URL)
	res, err := c.Validate(ctx, "http://10.0.0.1/", "1.2.3.4")
	if err == nil {
		t.Fatal("expected a timeout error")
	}
	if !res.Allowed {
		t.Errorf("fail-open: expected allowed=true on context timeout")
	}
}

// ── HTTPClient — non-200 status → fail-open ───────────────────────────────────

func TestHTTPClient_Non200_FailOpen(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := security.NewClient(srv.URL)
	res, err := c.Validate(context.Background(), "https://example.com/", "1.2.3.4")
	if err == nil {
		t.Fatal("expected an error for non-200 response")
	}
	if !res.Allowed {
		t.Errorf("fail-open: expected allowed=true on non-200 response")
	}
}

// ── NewClient — empty URL returns NoopClient ──────────────────────────────────

func TestNewClient_EmptyURL_ReturnsNoop(t *testing.T) {
	c := security.NewClient("")
	if _, ok := c.(security.NoopClient); !ok {
		t.Errorf("expected NoopClient for empty URL, got %T", c)
	}
}
