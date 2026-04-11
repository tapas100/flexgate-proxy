# Containerfile for FlexGate Proxy (Go)
# Build with: podman build -t localhost/flexgate-proxy:latest .
# Or use:     make build
#
# Multi-stage:
#   Stage 1 — golang:1.24-alpine  → compile static binary
#   Stage 2 — gcr.io/distroless/static  → minimal runtime image (~8 MB)
#
# Build args:
#   VERSION   semver string baked into the binary via ldflags (default: dev)

ARG VERSION=dev

# ── Stage 1: Compile ──────────────────────────────────────────────────────────
FROM docker.io/golang:1.24-alpine AS builder

# git is needed for `go mod download` when fetching private modules.
RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Download dependencies first (cached layer — only re-runs when go.mod/go.sum change).
COPY go.mod go.sum ./
RUN go mod download

# Copy source and compile.
COPY . .

ARG VERSION
RUN CGO_ENABLED=0 GOOS=linux go build \
        -trimpath \
        -ldflags="-s -w -X main.version=${VERSION}" \
        -o /out/flexgate-proxy \
        ./cmd/flexgate

# ── Stage 2: Minimal runtime ──────────────────────────────────────────────────
FROM gcr.io/distroless/static:nonroot

# Copy the CA bundle from the builder so TLS upstream connections work.
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the compiled binary.
COPY --from=builder /out/flexgate-proxy /flexgate-proxy

# Copy the default config (flexgate.yaml).  Can be overridden by mounting a
# ConfigMap / host volume at /etc/flexgate/flexgate.yaml at runtime.
COPY --from=builder /build/flexgate.yaml /etc/flexgate/flexgate.yaml

# distroless/nonroot runs as UID 65532 by default — no USER statement needed.

# Proxy data-plane port (HAProxy backend) + admin API port.
EXPOSE 8080 9090

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/flexgate-proxy", "healthcheck"]

ENTRYPOINT ["/flexgate-proxy"]
