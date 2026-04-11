// Package intelligence provides the Client interface, domain types, and
// factory for the optional FlexGate Intelligence service.
//
// All types are type-aliased from the internal core sub-package so that
// callers throughout the codebase continue to use the intelligence.* namespace
// without changes, while the grpc sub-package can import core without a cycle.
package intelligence

import "github.com/flexgate/proxy/internal/intelligence/core"

// ─────────────────────────────────────────────────────────────────────────────
// Re-export Client interface
// ─────────────────────────────────────────────────────────────────────────────

// Client is the thin interface the proxy uses to communicate with the optional
// FlexGate Intelligence service. See core.Client for full documentation.
type Client = core.Client

// ─────────────────────────────────────────────────────────────────────────────
// Re-export domain types
// ─────────────────────────────────────────────────────────────────────────────

type RateLimitRequest = core.RateLimitRequest
type RateLimitResult = core.RateLimitResult

type AuthRequest = core.AuthRequest
type AuthResult = core.AuthResult

type RequestEvent = core.RequestEvent

type LogEntry = core.LogEntry
type LogsRequest = core.LogsRequest
type LogsResult = core.LogsResult
