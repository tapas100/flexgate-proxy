# Makefile for FlexGate with Podman
.PHONY: help install build start stop restart logs stats clean test

# Default target
help:
	@echo "FlexGate Podman Commands:"
	@echo ""
	@echo "  make install         - Install Podman and dependencies"
	@echo "  make build           - Build FlexGate container image"
	@echo "  make start           - Start all services"
	@echo "  make stop            - Stop all services"
	@echo "  make restart         - Restart all services"
	@echo "  make logs            - View logs"
	@echo "  make stats           - View HAProxy stats page"
	@echo "  make test            - Run load test"
	@echo "  make clean           - Remove all containers and volumes"
	@echo ""
	@echo "Observability (Stage 5):"
	@echo "  make go-metrics          - Scrape proxy /metrics (raw)"
	@echo "  make go-metrics-admin    - Scrape admin /metrics (raw)"
	@echo "  make go-metrics-summary  - Fetch /api/metrics/summary JSON"
	@echo "  make go-metrics-dump     - Dump all metric values (sorted)"
	@echo "  make prom-start          - Start local Prometheus container"
	@echo "  make prom-stop           - Stop local Prometheus container"
	@echo "  make grafana-import      - Open Grafana import page"
	@echo ""
	@echo "Load Testing (Stage 6):"
	@echo "  make go-loadtest          - Full load test suite (~5 min)"
	@echo "  make go-loadtest-baseline - Quick 15s baseline"
	@echo "  make go-loadtest-mix      - Mixed-method simulation (60s)"
	@echo "  make go-loadtest-ramp     - Concurrency ramp (120s)"
	@echo "  make go-loadtest-soak     - 10-minute soak test"
	@echo "  HOST=x PORT=y make go-loadtest  - Target a remote host"
	@echo ""

# Install Podman (macOS)
install:
	@echo "Installing Podman..."
	@if command -v brew &> /dev/null; then \
		brew install podman podman-compose; \
		podman machine init --cpus 4 --memory 8192 --disk-size 50; \
		podman machine start; \
	else \
		echo "Homebrew not found. Install from https://brew.sh"; \
		exit 1; \
	fi
	@pip3 install podman-compose
	@echo "✅ Podman installed successfully"

# Build FlexGate image
build:
	@echo "Building FlexGate image..."
	@podman build -t localhost/flexgate-proxy:latest .
	@podman tag localhost/flexgate-proxy:latest localhost/flexgate-proxy:0.1.0-beta.1
	@echo "✅ Image built: localhost/flexgate-proxy:latest"

# Start all services
start:
	@echo "Starting FlexGate services..."
	@podman-compose -f podman-compose.yml up -d
	@echo "✅ Services started"
	@echo ""
	@echo "Access points:"
	@echo "  - API Gateway:  http://localhost:8080"
	@echo "  - HAProxy Stats: http://localhost:8404/stats (admin/changeme)"
	@echo "  - Prometheus:    http://localhost:9090"

# Stop all services
stop:
	@echo "Stopping FlexGate services..."
	@podman-compose -f podman-compose.yml down
	@echo "✅ Services stopped"

# Restart all services
restart: stop start

# View logs
logs:
	@podman-compose -f podman-compose.yml logs -f

# View logs for specific service
logs-haproxy:
	@podman logs -f flexgate-haproxy

logs-app:
	@podman logs -f flexgate-app-1

logs-postgres:
	@podman logs -f flexgate-postgres

# Open HAProxy stats page
stats:
	@open http://localhost:8404/stats || xdg-open http://localhost:8404/stats

# View container stats
podman-stats:
	@podman stats

# Run load test
test:
	@echo "Running load test (10K requests)..."
	@podman run --rm \
		--network=host \
		docker.io/curlimages/curl:latest \
		sh -c 'for i in $$(seq 1 10000); do curl -s http://localhost:8080/api/health > /dev/null & done; wait'
	@echo "✅ Load test complete"

# Health check
health:
	@echo "Checking service health..."
	@curl -f http://localhost:8080/health && echo "✅ API healthy" || echo "❌ API unhealthy"
	@curl -f http://localhost:8404/stats && echo "✅ HAProxy healthy" || echo "❌ HAProxy unhealthy"

# Clean up everything
clean:
	@echo "Cleaning up..."
	@podman-compose -f podman-compose.yml down -v
	@podman system prune -a -f
	@echo "✅ Cleaned up all containers and volumes"

# Reload HAProxy config
reload-haproxy:
	@echo "Reloading HAProxy configuration..."
	@podman kill -s HUP flexgate-haproxy
	@echo "✅ HAProxy config reloaded"

# Validate HAProxy config
validate-haproxy:
	@echo "Validating HAProxy configuration..."
	@podman run --rm \
		-v ./haproxy/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro \
		docker.io/haproxy:2.8-alpine \
		haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
	@echo "✅ HAProxy config is valid"

# Exec into HAProxy container
shell-haproxy:
	@podman exec -it flexgate-haproxy sh

# Exec into app container
shell-app:
	@podman exec -it flexgate-app-1 sh

# Generate systemd service files
systemd:
	@echo "Generating systemd service files..."
	@podman pod create --name flexgate-pod \
		-p 8080:8080 -p 8443:8443 -p 8404:8404 -p 9090:9090
	@podman generate systemd --new --files --name flexgate-pod
	@mkdir -p ~/.config/systemd/user/
	@mv pod-*.service container-*.service ~/.config/systemd/user/
	@systemctl --user daemon-reload
	@echo "✅ Systemd service files generated"
	@echo ""
	@echo "To enable on boot:"
	@echo "  systemctl --user enable pod-flexgate-pod.service"
	@echo "  systemctl --user start pod-flexgate-pod.service"

# Show running containers
ps:
	@podman ps --pod

# Show pod status
pod:
	@podman pod ps
	@echo ""
	@podman pod inspect flexgate-pod 2>/dev/null || echo "No pod found"

# Backup configuration
backup:
	@echo "Backing up configuration..."
	@mkdir -p backups
	@podman cp flexgate-haproxy:/usr/local/etc/haproxy/haproxy.cfg backups/haproxy-$$(date +%Y%m%d-%H%M%S).cfg
	@echo "✅ Configuration backed up to backups/"

# Deploy to production
deploy:
	@echo "Deploying to production..."
	@$(MAKE) validate-haproxy
	@$(MAKE) build
	@$(MAKE) restart
	@echo "✅ Deployed successfully"

# Monitor metrics
metrics:
	@open http://localhost:9090 || xdg-open http://localhost:9090

# ─────────────────────────────────────────────────────────────────────────────
# Go build targets (Stage 0+)
# ─────────────────────────────────────────────────────────────────────────────
include Makefile.build
