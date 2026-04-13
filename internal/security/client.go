// Package security provides a Go client for the flexgate-rust-security SSRF
// validation sidecar.
//
// The client is fail-open: if the sidecar is unreachable, times out, or
// returns a non-200 status the request is allowed through.  This prevents the
// sidecar from becoming a single point of failure for the proxy.
package security

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ValidationResult is the response from the Rust sidecar.
type ValidationResult struct {
	Allowed     bool     `json:"allowed"`
	Reason      string   `json:"reason"`
	ResolvedIPs []string `json:"resolved_ips,omitempty"`
}

// Client validates upstream URLs via the Rust security sidecar.
type Client interface {
	// Validate checks whether rawURL is safe to proxy to.
	// clientIP is included for structured logging in the sidecar.
	// On any transport or sidecar error the call returns (allowed=true, err).
	Validate(ctx context.Context, rawURL, clientIP string) (ValidationResult, error)
}

// NewClient returns an HTTPClient if sidecarURL is non-empty, otherwise a
// NoopClient that always allows.
func NewClient(sidecarURL string) Client {
	if sidecarURL == "" {
		return NoopClient{}
	}
	return &HTTPClient{
		baseURL: sidecarURL,
		http: &http.Client{
			// 2 ms hard budget — the proxy hot path must not stall.
			// The context passed to Validate() carries its own 2 ms deadline
			// as a belt-and-suspenders guard; this client timeout is the
			// outer safety net for the transport layer.
			Timeout: 2 * time.Millisecond,
			Transport: &http.Transport{
				MaxIdleConnsPerHost:   64,
				IdleConnTimeout:       30 * time.Second,
				DisableCompression:    true,
				ResponseHeaderTimeout: 2 * time.Millisecond,
			},
		},
	}
}

// ── HTTPClient ────────────────────────────────────────────────────────────────

// HTTPClient calls the Rust sidecar over HTTP.
type HTTPClient struct {
	baseURL string
	http    *http.Client
}

type validateRequest struct {
	URL      string `json:"url"`
	ClientIP string `json:"client_ip,omitempty"`
}

// Validate sends a POST /validate request to the sidecar.
// It is always fail-open: transport errors, non-200 status codes, and decode
// errors all result in (allowed=true, non-nil error).
func (c *HTTPClient) Validate(ctx context.Context, rawURL, clientIP string) (ValidationResult, error) {
	body, err := json.Marshal(validateRequest{URL: rawURL, ClientIP: clientIP})
	if err != nil {
		// Should never happen with plain strings.
		return allow(), fmt.Errorf("security: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/validate", bytes.NewReader(body))
	if err != nil {
		return allow(), fmt.Errorf("security: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		// Sidecar unreachable — fail-open.
		return allow(), fmt.Errorf("security: sidecar unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Unexpected HTTP status — fail-open.
		return allow(), fmt.Errorf("security: sidecar returned HTTP %d", resp.StatusCode)
	}

	var result ValidationResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return allow(), fmt.Errorf("security: decode response: %w", err)
	}
	return result, nil
}

// ── NoopClient ────────────────────────────────────────────────────────────────

// NoopClient always allows — used when no sidecar URL is configured.
type NoopClient struct{}

func (NoopClient) Validate(_ context.Context, _, _ string) (ValidationResult, error) {
	return allow(), nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func allow() ValidationResult { return ValidationResult{Allowed: true, Reason: "ok"} }
