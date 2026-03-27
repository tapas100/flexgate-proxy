# Introduction

## What is FlexGate?

FlexGate is a **production-grade API Gateway** built with TypeScript, designed to be the flexible, self-hosted alternative to Kong, AWS API Gateway, and other commercial solutions. It combines the high performance of HAProxy with the flexibility of Node.js to deliver enterprise-grade API management capabilities.

## Why FlexGate?

### 🚀 Built for Performance

FlexGate uses **HAProxy** as its data plane, capable of handling **>10,000 requests per second** with minimal latency. The control plane is built with Node.js and TypeScript, providing flexibility without sacrificing speed.

```
Client Request → HAProxy (Data Plane) → Your Backend Services
                    ↓
              Node.js Control Plane
              (Configuration, Metrics, Management)
```

### 🎯 Developer Experience First

Unlike other API gateways that require complex XML configurations or proprietary DSLs, FlexGate offers:

- **Beautiful Admin UI** - Manage routes visually at http://localhost:3000/admin
- **Simple YAML Config** - Familiar configuration format
- **REST API** - Programmatic management for automation
- **CLI Tools** - Command-line interface for DevOps workflows
- **TypeScript** - Full type safety and excellent IDE support

### 💰 Open Source & Cost-Effective

FlexGate is **100% free and open source** under the MIT license:

- **No Enterprise Tier** - All features included
- **No Per-Request Pricing** - Pay only for infrastructure
- **No Vendor Lock-in** - Self-hosted on your infrastructure
- **Community Driven** - Active development and support

### 🔒 Security Built-In

Production-ready security features included:

- **JWT Authentication** - Token-based auth with configurable providers
- **API Key Management** - Generate and manage API keys
- **Rate Limiting** - Token bucket and sliding window algorithms
- **Circuit Breaker** - Prevent cascade failures
- **CORS** - Cross-origin request handling
- **SSL/TLS** - HTTPS support with automatic certificate management

### 📊 Observability Ready

Monitor and debug your API traffic with:

- **Prometheus Metrics** - Request rates, latency, errors
- **Grafana Dashboards** - Pre-built visualizations
- **Distributed Tracing** - OpenTelemetry integration
- **Structured Logging** - JSON logs with correlation IDs
- **Real-time Monitoring** - Live metrics in Admin UI

## Key Features

### Traffic Management

| Feature | Description |
|---------|-------------|
| **Dynamic Routing** | Route requests based on path, method, headers, or query params |
| **Load Balancing** | Round-robin, least-connections, IP-hash algorithms |
| **Health Checks** | Active and passive health checking for backends |
| **Retry Logic** | Automatic retry with exponential backoff |
| **Timeouts** | Configurable connection and request timeouts |
| **WebSockets** | Full WebSocket proxy support |

### Request/Response Transformation

- **Header Manipulation** - Add, remove, or modify headers
- **Path Rewriting** - Transform request paths
- **Query String Handling** - Manipulate query parameters
- **Body Transformation** - Modify request/response bodies
- **Content Negotiation** - Handle multiple content types

### Protection & Reliability

- **Rate Limiting** - Per-route, per-IP, or per-API-key limits
- **Circuit Breaker** - Fail fast and recover automatically
- **Request Validation** - JSON schema validation
- **IP Whitelisting/Blacklisting** - Access control by IP
- **DDoS Protection** - Built-in defenses against attacks

### Multi-tenancy

- **Organizations** - Isolate routes and configs per tenant
- **User Management** - Role-based access control (RBAC)
- **Quota Management** - Per-tenant usage limits
- **Webhook Support** - Event notifications per organization

## Architecture

FlexGate uses a **dual-plane architecture**:

### Data Plane (HAProxy)

- **High Performance** - C-based proxy, handles actual traffic
- **Production Proven** - Powers many of the world's largest sites
- **Protocol Support** - HTTP/1.1, HTTP/2, WebSockets, TCP
- **Zero Downtime** - Reload configuration without dropping connections

### Control Plane (Node.js + TypeScript)

- **Configuration Management** - Dynamic route updates via API
- **Admin UI** - React-based web interface
- **Metrics Collection** - Aggregate and export metrics
- **Database** - PostgreSQL for persistent configuration
- **Caching** - Redis for performance optimization

### Supporting Services

- **PostgreSQL** - Configuration and state storage
- **Redis** - Caching and rate limiting
- **Prometheus** - Metrics collection and storage
- **Grafana** - Visualization and dashboards
- **NATS JetStream** - Event streaming and webhooks

## Use Cases

### API Aggregation

Combine multiple backend services into a unified API:

```yaml
routes:
  - path: /api/v1/users
    upstream: http://user-service:8080
  
  - path: /api/v1/orders
    upstream: http://order-service:8080
  
  - path: /api/v1/products
    upstream: http://product-service:8080
```

### Microservices Gateway

Route traffic to microservices with service discovery:

- **Service Registry** - Auto-discover backend services
- **Load Distribution** - Balance across service instances
- **Health Monitoring** - Remove unhealthy instances
- **Canary Deployments** - Gradual rollout of new versions

### Legacy API Modernization

Add modern features to legacy APIs without modifying them:

- **Authentication** - Add JWT/OAuth to legacy endpoints
- **Rate Limiting** - Protect old systems from overload
- **CORS** - Enable cross-origin requests
- **Monitoring** - Track usage and performance
- **Caching** - Reduce load on legacy systems

### Multi-tenant SaaS

Isolate tenant traffic and enforce quotas:

```typescript
// Each tenant gets isolated routes and limits
{
  tenant: "acme-corp",
  routes: [...],
  rateLimit: { max: 10000, windowMs: 60000 },
  quota: { maxRequests: 1000000, period: "month" }
}
```

### Mobile Backend

Optimize API responses for mobile clients:

- **Response Compression** - gzip/brotli for bandwidth savings
- **Field Filtering** - Return only requested fields
- **Pagination** - Limit response size
- **Caching** - CDN-friendly cache headers
- **Offline Support** - Conditional requests (ETags)

## Comparison with Alternatives

### vs Kong

| Aspect | FlexGate | Kong |
|--------|----------|------|
| **License** | MIT (Free) | Apache 2.0 (Core), Proprietary (Enterprise) |
| **Admin UI** | ✅ Built-in | ❌ Enterprise only |
| **Performance** | >10k req/s | >10k req/s |
| **Language** | TypeScript | Lua |
| **Database** | PostgreSQL | PostgreSQL/Cassandra |
| **Plugins** | Built-in features | Marketplace (many paid) |
| **Learning Curve** | Easy | Moderate |
| **Cost** | Free | Free (Core), $$$$ (Enterprise) |

### vs AWS API Gateway

| Aspect | FlexGate | AWS API Gateway |
|--------|----------|-----------------|
| **Hosting** | Self-hosted | AWS only |
| **Cost** | Infrastructure only | $3.50 per million requests |
| **Latency** | <10ms (self-hosted) | ~50-100ms (managed) |
| **WebSockets** | ✅ Full support | ⚠️ Limited |
| **Customization** | ✅ Full control | ⚠️ AWS limits |
| **Vendor Lock-in** | ❌ None | ✅ AWS ecosystem |
| **Local Dev** | ✅ Easy | ⚠️ Requires SAM/LocalStack |

### vs NGINX

| Aspect | FlexGate | NGINX |
|--------|----------|-------|
| **Configuration** | YAML + UI | Config files |
| **Dynamic Updates** | ✅ API/UI | ⚠️ Reload required |
| **Rate Limiting** | ✅ Built-in | ⚠️ Manual setup |
| **Metrics** | ✅ Prometheus | ⚠️ Log parsing |
| **Admin UI** | ✅ Yes | ❌ No |
| **Learning Curve** | Easy | Steep |
| **Use Case** | API Gateway | Web Server/Proxy |

## When to Use FlexGate

✅ **Perfect For:**

- Building internal API gateways for microservices
- Modernizing legacy APIs with new features
- Multi-tenant SaaS platforms requiring traffic isolation
- High-performance API routing (>10k req/s)
- Self-hosted infrastructure (on-prem, private cloud)
- Teams wanting full control and customization
- Budget-conscious projects avoiding per-request pricing

❌ **Not Ideal For:**

- Extremely simple use cases (single backend proxy)
- Teams fully committed to AWS ecosystem
- Projects requiring GraphQL federation (use Apollo Gateway)
- Serverless-first architectures (use AWS API Gateway)

## Performance Benchmarks

Tested on AWS EC2 t3.medium (2 vCPU, 4GB RAM):

| Scenario | Requests/sec | Latency (p95) | Latency (p99) |
|----------|--------------|---------------|---------------|
| **Simple Proxy** | 12,500 | 8ms | 12ms |
| **With Auth** | 10,200 | 12ms | 18ms |
| **With Rate Limit** | 11,800 | 10ms | 15ms |
| **Full Features** | 9,500 | 15ms | 22ms |

_Benchmark methodology available in `/benchmarks` directory_

## Technology Stack

- **Runtime**: Node.js 18+ (LTS)
- **Language**: TypeScript 5+
- **Proxy**: HAProxy 2.8+
- **Database**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Metrics**: Prometheus + Grafana
- **Messaging**: NATS JetStream
- **Frontend**: React 18 + TypeScript
- **Container**: Docker/Podman

## Getting Help

- **Documentation**: [docs.flexgate.io](https://tapas100.github.io/flexgate-proxy/)
- **GitHub Issues**: [Report bugs](https://github.com/tapas100/flexgate-proxy/issues)
- **Discussions**: [Ask questions](https://github.com/tapas100/flexgate-proxy/discussions)
- **NPM**: [Package page](https://www.npmjs.com/package/flexgate-proxy)

## Next Steps

Ready to get started? Check out:

- **[Getting Started Guide](./getting-started.md)** - Install FlexGate in 2 minutes
- **[Installation Guide](./installation.md)** - Detailed setup instructions
- **[First Route Tutorial](./first-route.md)** - Create your first API route

---

*FlexGate is open source software released under the MIT License.*
