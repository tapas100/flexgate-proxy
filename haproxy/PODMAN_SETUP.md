# Podman Setup for FlexGate HAProxy

## 🐳 Why Podman?

- ✅ **Daemonless** - No background service required
- ✅ **Rootless** - Run containers as non-root user
- ✅ **Docker-compatible** - Same commands, better security
- ✅ **Systemd integration** - Native service management
- ✅ **Pod support** - Native Kubernetes-style pods

---

## 📦 Installation

### macOS

```bash
# Install Podman
brew install podman

# Initialize Podman machine
podman machine init --cpus 4 --memory 8192 --disk-size 50
podman machine start

# Verify installation
podman --version
podman ps
```

### Linux (Ubuntu/Debian)

```bash
# Install Podman
sudo apt-get update
sudo apt-get install -y podman podman-compose

# Enable rootless mode (recommended)
sudo loginctl enable-linger $USER

# Verify installation
podman --version
podman info
```

### Linux (RHEL/Fedora)

```bash
# Podman comes pre-installed on Fedora 34+
sudo dnf install -y podman podman-compose

# Verify
podman --version
```

---

## 🚀 Quick Start

### Option 1: Using podman-compose (Recommended)

```bash
# Install podman-compose if not already installed
pip3 install podman-compose

# Start the stack
podman-compose -f docker-compose.haproxy.yml up -d

# View running containers
podman ps

# View logs
podman-compose -f docker-compose.haproxy.yml logs -f haproxy

# Stop the stack
podman-compose -f docker-compose.haproxy.yml down
```

### Option 2: Using Podman Pod (Kubernetes-style)

```bash
# Create a pod for all services
podman pod create \
  --name flexgate-pod \
  -p 8080:8080 \
  -p 8443:8443 \
  -p 8404:8404 \
  -p 9090:9090

# Run HAProxy in the pod
podman run -d \
  --pod flexgate-pod \
  --name haproxy \
  -v ./haproxy/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro \
  -v ./haproxy/errors:/etc/haproxy/errors:ro \
  docker.io/haproxy:2.8-alpine

# Run PostgreSQL in the pod
podman run -d \
  --pod flexgate-pod \
  --name postgres \
  -e POSTGRES_DB=flexgate \
  -e POSTGRES_USER=flexgate \
  -e POSTGRES_PASSWORD=flexgate \
  -v postgres-data:/var/lib/postgresql/data \
  docker.io/postgres:15-alpine

# Run Redis in the pod
podman run -d \
  --pod flexgate-pod \
  --name redis \
  docker.io/redis:7-alpine \
  redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

# Run FlexGate App
podman run -d \
  --pod flexgate-pod \
  --name flexgate-app-1 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL=postgresql://flexgate:flexgate@localhost:5432/flexgate \
  -e REDIS_URL=redis://localhost:6379 \
  localhost/flexgate-proxy:latest

# View pod status
podman pod ps
podman pod inspect flexgate-pod
```

### Option 3: Using Kubernetes YAML with Podman

```bash
# Generate Kubernetes YAML from compose
podman-compose -f docker-compose.haproxy.yml convert > k8s.yaml

# Run with Podman play
podman play kube k8s.yaml

# View resources
podman pod ls
podman ps --pod
```

---

## 🔧 Podman Configuration

### Enable Rootless Mode

```bash
# Check current user ID
id -u  # Should be >= 1000

# Configure subuid and subgid
echo "$USER:100000:65536" | sudo tee -a /etc/subuid
echo "$USER:100000:65536" | sudo tee -a /etc/subgid

# Enable user lingering (containers survive logout)
sudo loginctl enable-linger $USER

# Test rootless
podman run --rm alpine echo "Rootless works!"
```

### Configure Resource Limits

```bash
# Edit /etc/security/limits.conf
sudo tee -a /etc/security/limits.conf <<EOF
$USER soft nofile 65536
$USER hard nofile 65536
$USER soft nproc 4096
$USER hard nproc 4096
EOF

# Reload limits
ulimit -n 65536
ulimit -u 4096
```

---

## 🎯 Build and Run

### Build FlexGate Image with Podman

```bash
# Build image
podman build -t localhost/flexgate-proxy:latest .

# Verify image
podman images | grep flexgate

# Tag for different versions
podman tag localhost/flexgate-proxy:latest localhost/flexgate-proxy:0.1.0-beta.1
```

### Run Individual Containers

```bash
# Run HAProxy standalone
podman run -d \
  --name flexgate-haproxy \
  -p 8080:8080 \
  -p 8443:8443 \
  -p 8404:8404 \
  -v ./haproxy/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro \
  -v ./haproxy/errors:/etc/haproxy/errors:ro \
  --restart=unless-stopped \
  docker.io/haproxy:2.8-alpine

# View logs
podman logs -f flexgate-haproxy

# Stop and remove
podman stop flexgate-haproxy
podman rm flexgate-haproxy
```

---

## 🔄 Systemd Integration

### Create Systemd Service for Pod

```bash
# Generate systemd unit files
podman pod create --name flexgate-pod -p 8080:8080 -p 8443:8443 -p 8404:8404
podman generate systemd --new --files --name flexgate-pod

# Move to systemd directory
mkdir -p ~/.config/systemd/user/
mv pod-*.service container-*.service ~/.config/systemd/user/

# Enable and start
systemctl --user daemon-reload
systemctl --user enable pod-flexgate-pod.service
systemctl --user start pod-flexgate-pod.service

# Check status
systemctl --user status pod-flexgate-pod.service
journalctl --user -u pod-flexgate-pod.service -f
```

### Auto-start on Boot

```bash
# Enable linger (containers start on boot)
sudo loginctl enable-linger $USER

# Verify linger is enabled
loginctl show-user $USER | grep Linger
# Should show: Linger=yes

# Your pod will now start automatically on boot
```

---

## 📊 Monitoring with Podman

### View Container Stats

```bash
# Real-time stats
podman stats

# Specific container
podman stats flexgate-haproxy

# Export metrics
podman stats --format "{{.Container}},{{.CPUPerc}},{{.MemUsage}}" --no-stream
```

### Inspect Container

```bash
# Detailed info
podman inspect flexgate-haproxy

# Get IP address
podman inspect flexgate-haproxy | jq '.[0].NetworkSettings.IPAddress'

# Get port mappings
podman port flexgate-haproxy
```

### Health Checks

```bash
# Check container health
podman healthcheck run flexgate-haproxy

# View health status
podman inspect flexgate-haproxy | jq '.[0].State.Health'
```

---

## 🔐 Security Best Practices

### Run Rootless (Default)

```bash
# Always run as non-root user
podman run --rm alpine whoami
# Output: root (inside container)

# But actual user is non-root
ps aux | grep podman
# Shows your user, not root
```

### Use SELinux Labels

```bash
# Mount volumes with correct SELinux context
podman run -d \
  -v ./haproxy/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro,Z \
  haproxy:2.8-alpine

# Z = private unshared label
# z = shared label
```

### Limit Container Capabilities

```bash
# Drop all capabilities, add only needed ones
podman run -d \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --cap-add=CHOWN \
  haproxy:2.8-alpine
```

---

## 🚀 Production Deployment

### Using Quadlet (Podman 4.4+)

Create `~/.config/containers/systemd/flexgate.container`:

```ini
[Unit]
Description=FlexGate HAProxy Container
After=network-online.target

[Container]
Image=docker.io/haproxy:2.8-alpine
ContainerName=flexgate-haproxy
Volume=./haproxy/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
Volume=./haproxy/errors:/etc/haproxy/errors:ro
PublishPort=8080:8080
PublishPort=8443:8443
PublishPort=8404:8404
HealthCmd=haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
HealthInterval=30s
HealthRetries=3

[Service]
Restart=always
TimeoutStartSec=900

[Install]
WantedBy=multi-user.target default.target
```

Enable:

```bash
systemctl --user daemon-reload
systemctl --user enable --now flexgate.service
```

---

## 🧪 Testing

### Load Test with Podman

```bash
# Run Artillery in a container
podman run --rm -it \
  --network=host \
  docker.io/artilleryio/artillery:latest \
  quick --count 100 --num 1000 http://localhost:8080/api/health
```

### Network Testing

```bash
# Test HAProxy from another container
podman run --rm \
  --network=host \
  docker.io/curlimages/curl:latest \
  curl http://localhost:8080/api/health

# Or create a custom network
podman network create flexgate-net
podman run -d --network=flexgate-net --name haproxy haproxy:2.8-alpine
podman run --rm --network=flexgate-net curlimages/curl curl http://haproxy:8080/stats
```

---

## 🐛 Troubleshooting

### Check Podman Version

```bash
podman --version
# Should be >= 4.0 for best features
```

### Fix Permission Issues

```bash
# If volumes have permission errors
podman unshare chown -R 0:0 ./haproxy/haproxy.cfg

# Or run with :Z flag
-v ./haproxy/haproxy.cfg:/etc/haproxy/haproxy.cfg:ro,Z
```

### Network Issues

```bash
# List networks
podman network ls

# Inspect network
podman network inspect podman

# Reset networking
podman system reset --force
```

### Container Won't Start

```bash
# Check logs
podman logs flexgate-haproxy

# Run interactively for debugging
podman run --rm -it haproxy:2.8-alpine sh

# Check events
podman events --filter container=flexgate-haproxy
```

---

## 📚 Useful Commands

```bash
# Cleanup unused resources
podman system prune -a -f

# Export container as tar
podman export flexgate-haproxy > haproxy.tar

# Import image
podman import haproxy.tar localhost/haproxy:custom

# Copy files from container
podman cp flexgate-haproxy:/etc/haproxy/haproxy.cfg ./backup.cfg

# Execute command in running container
podman exec -it flexgate-haproxy sh

# View container processes
podman top flexgate-haproxy

# Restart container
podman restart flexgate-haproxy

# Pause/unpause
podman pause flexgate-haproxy
podman unpause flexgate-haproxy
```

---

## 🔄 Migration from Docker

```bash
# If you have docker-compose.yml
alias docker=podman
alias docker-compose=podman-compose

# Or use podman-compose directly
podman-compose up -d

# Convert Docker images to Podman
docker save myimage:latest | podman load
```

---

## 🎯 Next Steps

1. **Install Podman** on your system
2. **Run the stack** with podman-compose
3. **Set up systemd services** for auto-restart
4. **Configure monitoring** with Prometheus
5. **Load test** to verify >10K req/sec

---

**Resources:**
- [Podman Documentation](https://docs.podman.io/)
- [Podman vs Docker](https://www.redhat.com/en/topics/containers/what-is-podman)
- [Rootless Containers](https://www.redhat.com/sysadmin/rootless-podman)
- [Quadlet Guide](https://www.redhat.com/sysadmin/quadlet-podman)
