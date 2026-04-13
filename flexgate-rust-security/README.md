# flexgate-rust-security

High-performance SSRF / URL validation sidecar for FlexGate Proxy.

Written in Rust (axum + tokio). Validates upstream URLs before the proxy
forwards requests, blocking RFC 1918 addresses, link-local (169.254.0.0/16),
loopback, CGNAT, documentation ranges, multicast, and all equivalent IPv6
ranges.  DNS rebinding protection resolves a hostname twice and rejects it if
the second answer differs from the first.

## Endpoints

| Method | Path        | Description                                |
|--------|-------------|--------------------------------------------|
| POST   | `/validate` | Validate a URL for SSRF safety             |
| GET    | `/health`   | Liveness probe (`{"status":"ok"}`)         |

Metrics (Prometheus) are exposed on a **separate port** (default `9101`) so
they are never reachable via the public proxy.

### POST /validate

Request:
```json
{ "url": "https://example.com/api", "client_ip": "1.2.3.4" }
```
`client_ip` is optional — used for structured log context only.

Response (always HTTP 200):
```json
{ "allowed": true,  "reason": "ok", "resolved_ips": ["93.184.216.34"] }
{ "allowed": false, "reason": "blocked IP: 10.0.0.1 is in private range 10.0.0.0/8" }
```

## Running locally

```bash
# Development — pretty logs, default ports (9100 HTTP + 9101 metrics)
cargo run -- --log-format pretty

# With custom port and stricter DNS timeout
cargo run -- --port 9200 --dns-timeout-ms 150 --log-format pretty

# Environment variables (useful in containers)
SECURITY_PORT=9100 \
SECURITY_DNS_TIMEOUT_MS=300 \
SECURITY_REBIND_CHECK=true \
SECURITY_LOG_FORMAT=json \
SECURITY_METRICS_ADDR=0.0.0.0:9101 \
cargo run --release
```

## Manual testing

```bash
# Should be BLOCKED (link-local / AWS IMDS)
curl -s -X POST http://localhost:9100/validate \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://169.254.169.254/latest/meta-data","client_ip":"1.2.3.4"}' | jq .

# Should be BLOCKED (RFC 1918)
curl -s -X POST http://localhost:9100/validate \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://10.0.0.1/internal","client_ip":"1.2.3.4"}' | jq .

# Should be ALLOWED
curl -s -X POST http://localhost:9100/validate \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://httpbin.org/get","client_ip":"1.2.3.4"}' | jq .

# Health
curl http://localhost:9100/health

# Prometheus metrics
curl http://localhost:9101/metrics
```

## Build

```bash
# Debug build
cargo build

# Optimised release binary
cargo build --release
# Binary: ./target/release/flexgate-rust-security

# Tests (no network required — all tests use literal IPs)
cargo test

# Lint
cargo clippy -- -D warnings

# Container image (Podman)
podman build -f Containerfile -t flexgate-rust-security:latest .

# Run as a container
podman run --rm -p 9100:9100 -p 9101:9101 \
  -e SECURITY_REBIND_CHECK=true \
  flexgate-rust-security:latest
```

## Configuration reference

| CLI flag               | Env var                    | Default       | Description                              |
|------------------------|----------------------------|---------------|------------------------------------------|
| `--port`               | `SECURITY_PORT`            | `9100`        | HTTP listen port                         |
| `--dns-timeout-ms`     | `SECURITY_DNS_TIMEOUT_MS`  | `300`         | Per-query DNS timeout in milliseconds    |
| `--rebind-check`       | `SECURITY_REBIND_CHECK`    | `true`        | Enable DNS rebinding protection          |
| `--log-format`         | `SECURITY_LOG_FORMAT`      | `json`        | Log format: `json` or `pretty`           |
| `--metrics-addr`       | `SECURITY_METRICS_ADDR`    | `0.0.0.0:9101`| Prometheus listen address                |

## Blocked CIDR ranges

23 ranges are blocked, including:

| Range              | Description                     |
|--------------------|---------------------------------|
| `0.0.0.0/8`        | "This" network                  |
| `10.0.0.0/8`       | RFC 1918 private                |
| `100.64.0.0/10`    | Shared address (CGNAT)          |
| `127.0.0.0/8`      | Loopback                        |
| `169.254.0.0/16`   | Link-local (AWS IMDS, GCE)      |
| `172.16.0.0/12`    | RFC 1918 private                |
| `192.0.0.0/24`     | IETF Protocol Assignments       |
| `192.0.2.0/24`     | TEST-NET-1 (documentation)      |
| `192.168.0.0/16`   | RFC 1918 private                |
| `198.18.0.0/15`    | Benchmarking                    |
| `224.0.0.0/4`      | Multicast                       |
| `240.0.0.0/4`      | Reserved                        |
| `::1/128`          | IPv6 loopback                   |
| `fc00::/7`         | IPv6 unique-local               |
| `fe80::/10`        | IPv6 link-local                 |
| `ff00::/8`         | IPv6 multicast                  |
| + 6 more           | Discard, documentation, etc.    |

## Performance targets

| Metric      | Target   |
|-------------|----------|
| P99 latency | < 0.5 ms |
| Throughput  | > 50K RPS |

DNS cache (moka LRU+TTL, 8 192 entries, 30 s TTL) keeps hot paths well under
0.1 ms by avoiding network round-trips.

## Integration with Go proxy

The Go proxy calls this service via `internal/security/client.go`.  The client
is **fail-open**: if the sidecar is unreachable or returns an error the proxy
proceeds with the request.  This prevents the sidecar from becoming a single
point of failure.
