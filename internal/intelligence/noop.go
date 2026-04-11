package intelligence

import (
	"context"

	"github.com/flexgate/proxy/internal/intelligence/core"
)

// NoopClient is used when intelligence.url is not configured.
// Every method is a deliberate no-op that keeps the proxy fully functional
// as a standalone reverse proxy.
//
// NoopClient satisfies the Client interface and is safe for concurrent use.
type NoopClient struct{}

// RateLimit always allows the request.
func (n *NoopClient) RateLimit(_ context.Context, _ core.RateLimitRequest) core.RateLimitResult {
	return core.RateLimitResult{Allowed: true}
}

// Auth always considers the token valid.
func (n *NoopClient) Auth(_ context.Context, _ core.AuthRequest) core.AuthResult {
	return core.AuthResult{Valid: true}
}

// RecordRequest discards the event silently.
func (n *NoopClient) RecordRequest(_ core.RequestEvent) {}

// GetLogs returns an empty result with IntelligenceDisabled set to true.
func (n *NoopClient) GetLogs(_ context.Context, _ core.LogsRequest) core.LogsResult {
	return core.LogsResult{IntelligenceDisabled: true}
}
