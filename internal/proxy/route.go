package proxy

import "time"

// Route is the in-memory representation of a single proxy routing rule.
// It is loaded from Postgres on startup and kept in the RouteCache.
//
// Field semantics:
//
//	Path         – URL prefix this rule matches (e.g. "/api/payments").
//	              A trailing "/*" wildcard is stripped before storage and the
//	              cache performs prefix matching.
//	Upstream     – Full base URL of the backend (e.g. "https://payments.internal:8443").
//	              No trailing slash.
//	StripPrefix  – Prefix to remove from the request path before forwarding.
//	              Empty string means forward the path unchanged.
//	Methods      – Allowed HTTP methods. Empty slice means all methods allowed.
//	AddHeaders   – Headers to inject into the upstream request.
//	Timeout      – Per-route upstream timeout. Zero means use proxy default.
//	Enabled      – Disabled routes are loaded but not matched.
type Route struct {
	ID          string
	Path        string
	Upstream    string
	StripPrefix string
	Methods     []string
	AddHeaders  map[string]string
	Timeout     time.Duration
	Enabled     bool
}
