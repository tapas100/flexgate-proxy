---
layout: home

hero:
  name: FlexGate
  text: Production-Grade API Gateway
  tagline: Built-in observability, security, and reliability. The flexible alternative to Kong and AWS API Gateway.
  image:
    src: /hero-logo.svg
    alt: FlexGate Logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/tapas100/flexgate-proxy
    - theme: alt
      text: Install via NPM
      link: https://www.npmjs.com/package/flexgate-proxy

features:
  - icon: 🚀
    title: Fast & Scalable
    details: Handle >10,000 requests/sec with HAProxy data plane. Built for high-performance production workloads.
  
  - icon: 🎯
    title: Easy to Use
    details: Web-based Admin UI for visual configuration. No coding required for basic setup. CLI tools for automation.
  
  - icon: 📊
    title: Built-in Observability
    details: Prometheus metrics, Grafana dashboards, distributed tracing, and structured logging out of the box.
  
  - icon: 🔒
    title: Secure by Default
    details: JWT authentication, API key management, rate limiting, circuit breaker, and CORS support built-in.
  
  - icon: 🎨
    title: Flexible Configuration
    details: YAML files, REST API, or Admin UI. Choose the configuration method that works best for your workflow.
  
  - icon: ☁️
    title: Cloud Native
    details: Docker/Podman ready, Kubernetes manifests included. Deploy anywhere - cloud, on-prem, or edge.
  
  - icon: 🔄
    title: High Availability
    details: Health checks, circuit breaker, automatic failover, and zero-downtime config reloads.
  
  - icon: 📦
    title: Lightweight
    details: Minimal dependencies, small footprint. Run on containers, VMs, or bare metal with ease.
  
  - icon: 🛠️
    title: Developer Friendly
    details: TypeScript codebase, comprehensive API docs, CLI tools, and excellent IDE support.
---

## Quick Start

Install FlexGate and start routing traffic in under 2 minutes:

:::code-group

```bash [npm]
# Install globally
npm install -g flexgate-proxy

# Start the gateway
flexgate start
```

```bash [Podman]
# Clone repository
git clone https://github.com/tapas100/flexgate-proxy.git
cd flexgate-proxy

# Start all services
make start
```

```bash [Docker]
# Pull and run
docker pull flexgate/flexgate-proxy:latest
docker run -p 3000:3000 flexgate/flexgate-proxy
```

:::

Visit **http://localhost:3000/admin** to access the Admin UI.

## Your First Route

Configure a route in seconds:

```yaml
# config/proxy.yml
routes:
  - path: /api/users
    upstream: https://jsonplaceholder.typicode.com/users
    methods: [GET, POST]
    rateLimit:
      enabled: true
      max: 100
      windowMs: 60000
```

Test it:

```bash
curl http://localhost:3000/api/users
```

## Why FlexGate?

<div class="comparison-table">

| Feature | FlexGate | Kong | AWS API Gateway | NGINX |
|---------|----------|------|-----------------|-------|
| **Admin UI** | ✅ Built-in | ❌ Paid only | ✅ Yes | ❌ No |
| **Self-hosted** | ✅ Free | ⚠️ Limited | ❌ No | ✅ Yes |
| **Rate Limiting** | ✅ Free | ⚠️ Plugin | ✅ Yes | ⚠️ Manual |
| **Circuit Breaker** | ✅ Built-in | ⚠️ Plugin | ❌ Limited | ❌ No |
| **Metrics** | ✅ Prometheus | ⚠️ Plugin | ✅ CloudWatch | ⚠️ Manual |
| **WebSockets** | ✅ Yes | ✅ Yes | ⚠️ Limited | ✅ Yes |
| **Tracing** | ✅ Built-in | ⚠️ Plugin | ✅ X-Ray | ❌ No |
| **Cost** | ✅ Free | 💰 $$$$ | 💰 Pay-per-use | ✅ Free |

</div>

## Trusted By

FlexGate powers API infrastructure for:

- 🏢 **Enterprise Applications** - Internal API gateways
- 🌐 **SaaS Platforms** - Multi-tenant API management
- 📱 **Mobile Backends** - App API orchestration
- 🤖 **Microservices** - Service mesh alternative
- ⚡ **Edge Computing** - Low-latency API routing

## Community

Join thousands of developers using FlexGate:

- **GitHub**: [Star the repo](https://github.com/tapas100/flexgate-proxy) ⭐
- **Discussions**: [Ask questions](https://github.com/tapas100/flexgate-proxy/discussions)
- **Issues**: [Report bugs](https://github.com/tapas100/flexgate-proxy/issues)
- **NPM**: [1000+ downloads/month](https://www.npmjs.com/package/flexgate-proxy)

## What's Next?

<div class="vp-doc next-steps">

- 📖 **[Getting Started Guide](/guide/getting-started)** - Install and configure FlexGate
- 🎯 **[Admin UI Tutorial](/guide/admin-ui/overview)** - Learn the web interface
- 🔧 **[Configuration](/guide/config/routes)** - Advanced routing and features
- 🚀 **[Production Deployment](/guide/deployment/production)** - Go live with confidence

</div>

<style>
.comparison-table {
  margin: 2rem 0;
}

.comparison-table table {
  width: 100%;
  font-size: 0.9rem;
}

.next-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-top: 2rem;
}

.next-steps a {
  display: block;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.3s;
}

.next-steps a:hover {
  border-color: var(--vp-c-brand);
  background: var(--vp-c-bg-soft);
}
</style>
