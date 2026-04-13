package middleware_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/proxy/middleware"
	"github.com/flexgate/proxy/internal/security"
)

// stubClient is an in-process security.Client for middleware tests.
type stubClient struct {
	result security.ValidationResult
	err    error
}

func (s stubClient) Validate(_ context.Context, _, _ string) (security.ValidationResult, error) {
	return s.result, s.err
}

var silentLog = zerolog.Nop()

// nextHandler records whether it was called.
func nextHandler(called *bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*called = true
		w.WriteHeader(http.StatusOK)
	})
}

// ── no validate header → pass through ────────────────────────────────────────

func TestSSRFValidation_NoHeader_PassThrough(t *testing.T) {
	called := false
	mw := middleware.SSRFValidation(stubClient{result: security.ValidationResult{Allowed: false}}, silentLog)
	h := mw(nextHandler(&called))

	r := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if !called {
		t.Error("expected next handler to be called when header is absent")
	}
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

// ── allowed → forward ─────────────────────────────────────────────────────────

func TestSSRFValidation_Allowed_ForwardsRequest(t *testing.T) {
	called := false
	mw := middleware.SSRFValidation(stubClient{result: security.ValidationResult{
		Allowed:     true,
		Reason:      "ok",
		ResolvedIPs: []string{"93.184.216.34"},
	}}, silentLog)
	h := mw(nextHandler(&called))

	r := httptest.NewRequest(http.MethodGet, "/api/v1/users", nil)
	r.Header.Set("X-Flexgate-Upstream-Validate", "https://example.com/api/v1/users")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if !called {
		t.Error("expected next handler to be called for an allowed upstream")
	}
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	// Internal routing header must be removed before forwarding.
	if r.Header.Get("X-Flexgate-Upstream-Validate") != "" {
		t.Error("X-Flexgate-Upstream-Validate must be stripped before forwarding")
	}
}

// ── blocked → 403, no forward ─────────────────────────────────────────────────

func TestSSRFValidation_Blocked_Returns403(t *testing.T) {
	called := false
	mw := middleware.SSRFValidation(stubClient{result: security.ValidationResult{
		Allowed: false,
		Reason:  "blocked IP: 10.0.0.1 is in private range 10.0.0.0/8",
	}}, silentLog)
	h := mw(nextHandler(&called))

	r := httptest.NewRequest(http.MethodGet, "/internal", nil)
	r.Header.Set("X-Flexgate-Upstream-Validate", "http://10.0.0.1/internal")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if called {
		t.Error("next handler must NOT be called for a blocked upstream")
	}
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}
	if body["error"] != "upstream blocked by SSRF policy" {
		t.Errorf("unexpected error field: %q", body["error"])
	}
	if body["reason"] == "" {
		t.Error("expected reason field in response body")
	}
}

// ── sidecar error → fail-open, forward ───────────────────────────────────────

func TestSSRFValidation_SidecarError_FailOpen(t *testing.T) {
	import_errors := func() error {
		// Inline error to avoid importing "errors" package at top-level in test.
		return &testErr{"sidecar connection refused"}
	}()

	called := false
	mw := middleware.SSRFValidation(stubClient{
		result: security.ValidationResult{Allowed: true},
		err:    import_errors,
	}, silentLog)
	h := mw(nextHandler(&called))

	r := httptest.NewRequest(http.MethodGet, "/api", nil)
	r.Header.Set("X-Flexgate-Upstream-Validate", "https://example.com/api")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if !called {
		t.Error("fail-open: expected next handler to be called when sidecar errors")
	}
	if w.Code != http.StatusOK {
		t.Errorf("fail-open: expected 200, got %d", w.Code)
	}
}

// ── nil client → no-op pass-through ──────────────────────────────────────────

func TestSSRFValidation_NilClient_PassThrough(t *testing.T) {
	called := false
	mw := middleware.SSRFValidation(nil, silentLog)
	h := mw(nextHandler(&called))

	r := httptest.NewRequest(http.MethodGet, "/api", nil)
	r.Header.Set("X-Flexgate-Upstream-Validate", "http://10.0.0.1/api")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if !called {
		t.Error("nil client: expected next handler to be called (pass-through)")
	}
}

type testErr struct{ msg string }

func (e *testErr) Error() string { return e.msg }
