// Package core defines the intelligence Client interface and all shared
// request/response types. Both the top-level intelligence package and the
// grpc sub-package import this leaf package to avoid import cycles.
package core

import (
	"context"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Client interface
// ─────────────────────────────────────────────────────────────────────────────

// Client is the thin interface the proxy uses to communicate with the optional
// FlexGate Intelligence service.
//
// All implementations must be safe for concurrent use.
//
// Design contract:
//   - RateLimit and Auth are synchronous with a hard 5 ms timeout.
//     On timeout or any error they MUST return an allow result (fail-open).
//   - RecordRequest is fire-and-forget; it must never block the caller.
//   - GetLogs is synchronous but used only by the admin API — not on the hot path.
type Client interface {
	// RateLimit checks whether the client IP / route combination has remaining
	// quota. Returns {Allowed: true} on any failure (fail-open).
	RateLimit(ctx context.Context, req RateLimitRequest) RateLimitResult

	// Auth validates the bearer token carried in AuthRequest.Token.
	// Returns {Valid: true} on any failure (fail-open).
	Auth(ctx context.Context, req AuthRequest) AuthResult

	// RecordRequest ships a RequestEvent to the intelligence service in a
	// background goroutine. The method returns immediately; the event is
	// discarded silently if the service is unavailable.
	RecordRequest(event RequestEvent)

	// GetLogs retrieves recent log entries from the intelligence service.
	// When the noop client is active, IntelligenceDisabled is set to true.
	GetLogs(ctx context.Context, req LogsRequest) LogsResult
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limit types
// ─────────────────────────────────────────────────────────────────────────────

// RateLimitRequest carries the identity fields needed for a rate-limit check.
type RateLimitRequest struct {
	ClientIP string `json:"client_ip"`
	RouteID  string `json:"route_id"`
	Method   string `json:"method"`
	Path     string `json:"path"`
}

// RateLimitResult is the response from the intelligence service.
//
// When the intelligence service is unreachable and FailOpen is true,
// Allowed is always true and the remaining fields are zero-valued.
type RateLimitResult struct {
	Allowed      bool `json:"allowed"`
	Remaining    int  `json:"remaining"`
	RetryAfterMs int  `json:"retry_after_ms"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth types
// ─────────────────────────────────────────────────────────────────────────────

// AuthRequest carries the token and context for an auth check.
type AuthRequest struct {
	Token    string `json:"token"`
	RouteID  string `json:"route_id"`
	ClientIP string `json:"client_ip"`
}

// AuthResult is the response from the intelligence service.
//
// When the intelligence service is unreachable and FailOpen is true,
// Valid is always true and Subject is empty.
type AuthResult struct {
	Valid   bool   `json:"valid"`
	Subject string `json:"subject"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Request recording types
// ─────────────────────────────────────────────────────────────────────────────

// RequestEvent is the payload sent to the intelligence service after each
// proxied request. RecordRequest is fire-and-forget; the event is dropped
// silently if the service is unavailable.
type RequestEvent struct {
	RequestID       string        `json:"request_id"`
	Method          string        `json:"method"`
	Path            string        `json:"path"`
	Status          int           `json:"status"`
	LatencyMs       int64         `json:"latency_ms"`
	ClientIP        string        `json:"client_ip"`
	Upstream        string        `json:"upstream"`
	RouteID         string        `json:"route_id"`
	HAProxyFrontend string        `json:"haproxy_frontend,omitempty"`
	HAProxyBackend  string        `json:"haproxy_backend,omitempty"`
	Timestamp       time.Time     `json:"timestamp"`
	BytesOut        int64         `json:"bytes_out"`
	Duration        time.Duration `json:"-"` // convenience alias for LatencyMs
}

// ─────────────────────────────────────────────────────────────────────────────
// Log retrieval types
// ─────────────────────────────────────────────────────────────────────────────

// LogEntry represents a single log record from the intelligence service.
type LogEntry struct {
	Timestamp time.Time         `json:"timestamp"`
	RequestID string            `json:"request_id"`
	Level     string            `json:"level"`
	Message   string            `json:"message"`
	Fields    map[string]string `json:"fields,omitempty"`
}

// LogsRequest specifies filter parameters for GetLogs.
type LogsRequest struct {
	RouteID  string    `json:"route_id,omitempty"`
	ClientIP string    `json:"client_ip,omitempty"`
	Since    time.Time `json:"since,omitempty"`
	Limit    int       `json:"limit,omitempty"` // 0 → server default (usually 100)
}

// LogsResult is returned by GetLogs.
//
// IntelligenceDisabled is true when no intelligence URL is configured
// (i.e. the noop client is active).
type LogsResult struct {
	Entries              []LogEntry `json:"entries"`
	IntelligenceDisabled bool       `json:"intelligence_disabled,omitempty"`
}
