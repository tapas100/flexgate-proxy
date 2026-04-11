package intelligence

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"
)

// intelligenceTimeout is the hard ceiling for every synchronous call to the
// intelligence service. It must never slow the proxy hot path.
const intelligenceTimeout = 5 * time.Millisecond

// consecutiveFailureThreshold is the number of back-to-back errors before
// the circuit opens and all sync calls short-circuit to the allow result.
const consecutiveFailureThreshold = 10

// HTTPClient is the live HTTP/JSON implementation of Client. It speaks JSON
// over HTTP to the FlexGate Intelligence service.
//
// All synchronous calls (RateLimit, Auth) carry a configurable timeout so they
// can never add meaningful latency to the proxy hot path. On any failure the
// result is always the permissive default (fail-open).
//
// RecordRequest spawns a goroutine and returns immediately.
type HTTPClient struct {
	baseURL    string
	licenceKey string
	timeout    time.Duration
	http       *http.Client
	log        zerolog.Logger

	// consecutiveFailures is incremented on every error and reset to zero on
	// every success. When it reaches consecutiveFailureThreshold the circuit
	// opens: synchronous calls skip the network round-trip entirely.
	consecutiveFailures atomic.Int64
}

// newHTTPClient constructs an HTTPClient with the production 5 ms timeout.
// Called by New() when a URL is set and no gRPC address is configured.
func newHTTPClient(baseURL, licenceKey string, log zerolog.Logger) *HTTPClient {
	return NewHTTPClientWithTimeout(baseURL, licenceKey, intelligenceTimeout, log)
}

// NewHTTPClientWithTimeout constructs an HTTPClient with a custom timeout.
// Exported so benchmarks and tests can build a client against a local stub
// without tripping the 5 ms production ceiling.
func NewHTTPClientWithTimeout(baseURL, licenceKey string, timeout time.Duration, log zerolog.Logger) *HTTPClient {
	return &HTTPClient{
		baseURL:    baseURL,
		licenceKey: licenceKey,
		timeout:    timeout,
		http: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				MaxIdleConns:        50,
				MaxIdleConnsPerHost: 20,
				IdleConnTimeout:     30 * time.Second,
			},
		},
		log: log.With().Str("component", "intelligence").Logger(),
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// RateLimit
// ─────────────────────────────────────────────────────────────────────────────

// RateLimit asks the intelligence service whether the request is within quota.
// Returns {Allowed: true} on circuit-open, timeout, or any HTTP/decode error.
func (c *HTTPClient) RateLimit(ctx context.Context, req RateLimitRequest) RateLimitResult {
	allow := RateLimitResult{Allowed: true}

	if c.circuitOpen() {
		return allow
	}

	// Hard cap — intelligence must never stall the hot path.
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	var result RateLimitResult
	if err := c.post(ctx, "/v1/rate-limit", req, &result); err != nil {
		c.recordFailure("rate_limit", err)
		return allow
	}
	c.recordSuccess()
	return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

// Auth asks the intelligence service to validate the bearer token.
// Returns {Valid: true} on circuit-open, timeout, or any HTTP/decode error.
func (c *HTTPClient) Auth(ctx context.Context, req AuthRequest) AuthResult {
	allow := AuthResult{Valid: true}

	if c.circuitOpen() {
		return allow
	}

	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	var result AuthResult
	if err := c.post(ctx, "/v1/auth", req, &result); err != nil {
		c.recordFailure("auth", err)
		return allow
	}
	c.recordSuccess()
	return result
}

// ─────────────────────────────────────────────────────────────────────────────
// RecordRequest
// ─────────────────────────────────────────────────────────────────────────────

// RecordRequest fires a goroutine to ship the event to the intelligence service
// and returns immediately. The event is dropped silently on any error.
func (c *HTTPClient) RecordRequest(event RequestEvent) {
	go func() {
		if c.circuitOpen() {
			return
		}

		// Give the async call a slightly longer budget than the sync calls —
		// latency here is invisible to the end user.
		ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
		defer cancel()

		if err := c.post(ctx, "/v1/record", event, nil); err != nil {
			c.recordFailure("record_request", err)
			return
		}
		c.recordSuccess()
	}()
}

// ─────────────────────────────────────────────────────────────────────────────
// GetLogs
// ─────────────────────────────────────────────────────────────────────────────

// GetLogs retrieves recent log entries from the intelligence service.
// Used by the admin API, not on the hot path.
func (c *HTTPClient) GetLogs(ctx context.Context, req LogsRequest) LogsResult {
	if c.circuitOpen() {
		c.log.Warn().Msg("intelligence: circuit open, skipping GetLogs")
		return LogsResult{}
	}

	var result LogsResult
	if err := c.post(ctx, "/v1/logs", req, &result); err != nil {
		c.recordFailure("get_logs", err)
		return LogsResult{}
	}
	c.recordSuccess()
	return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

// post encodes body as JSON, POST-s it to path, and JSON-decodes the response
// into out (nil out means the response body is discarded).
//
// It injects the X-Licence-Key header on every request.
func (c *HTTPClient) post(ctx context.Context, path string, body, out any) error {
	encoded, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("intelligence: marshal body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("intelligence: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Licence-Key", c.licenceKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("intelligence: do request: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("intelligence: unexpected status %d from %s", resp.StatusCode, path)
	}

	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("intelligence: decode response: %w", err)
		}
	}
	return nil
}

// circuitOpen returns true when too many consecutive failures have been seen
// and synchronous calls should skip the network entirely.
func (c *HTTPClient) circuitOpen() bool {
	return c.consecutiveFailures.Load() >= consecutiveFailureThreshold
}

// recordFailure increments the failure counter and emits a WARN log.
func (c *HTTPClient) recordFailure(operation string, err error) {
	n := c.consecutiveFailures.Add(1)
	c.log.Warn().
		Err(err).
		Str("operation", operation).
		Int64("consecutive_failures", n).
		Msg("intelligence: request failed (fail-open)")

	if n == consecutiveFailureThreshold {
		c.log.Warn().
			Int64("threshold", consecutiveFailureThreshold).
			Msg("intelligence: circuit opened — all sync checks will short-circuit until service recovers")
	}
}

// recordSuccess resets the failure counter (circuit closes).
func (c *HTTPClient) recordSuccess() {
	c.consecutiveFailures.Store(0)
}
