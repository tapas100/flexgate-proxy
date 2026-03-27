---
layout: home

hero:
  name: "FlexGate Proxy"
  text: "AI-Native API Gateway"
  tagline: Detects failures, analyzes root causes with Claude, and auto-heals 80% of incidents — in under 10 minutes.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: View on GitHub
      link: https://github.com/tapas100/flexgate-proxy

features:
  - icon: 🤖
    title: AI-Native Signals
    details: 10 structured event types (CIRCUIT_BREAKER_OPENED, HIGH_LATENCY, ERROR_RATE_SPIKE…) that AI agents can reason about directly — no noisy logs, no dashboards.

  - icon: 🛡️
    title: Production Security
    details: SSRF protection, HMAC-SHA256 API keys, tiered rate limiting, restricted CORS via ALLOWED_ORIGINS, and 0 npm vulnerabilities.

  - icon: ⚡
    title: Circuit Breakers & Retries
    details: Per-upstream circuit breaking with configurable thresholds and automatic recovery. Exponential backoff retries with jitter.

  - icon: 📊
    title: Real-time Observability
    details: Prometheus metrics, Winston structured JSON logs, Server-Sent Events for live dashboard streaming, and full PostgreSQL persistence.

  - icon: 🖥️
    title: Admin UI — No Extra Setup
    details: Full React dashboard built-in. Manage routes, webhooks, logs, metrics, settings, and AI incidents from http://localhost:3000.

  - icon: 💰
    title: Token-Optimised
    details: ~$5/day for AI-assisted incident response vs $50–500/day for Grafana + PagerDuty. Clean pre-digested signals mean fewer tokens and less hallucination risk.
---

## Quick Install

```bash
npm install -g flexgate-proxy

flexgate init       # generates config/flexgate.json
flexgate migrate    # sets up the database schema
flexgate start      # starts gateway on :3001, Admin UI on :3000
```

## How It Compares

| Feature | FlexGate | Kong | AWS API GW | Nginx |
|---------|----------|------|------------|-------|
| Admin UI | ✅ Built-in, free | ✅ Enterprise only | ✅ Paid | ❌ |
| AI-native events | ✅ | ❌ | ❌ | ❌ |
| npm installable | ✅ | ❌ | ❌ | ❌ |
| Circuit breakers | ✅ Built-in | ✅ Plugin | ❌ | ❌ |
| PostgreSQL backend | ✅ | ✅ | ✅ | ❌ |
| Open source | ✅ MIT | ✅ / Enterprise | ❌ | ✅ |

## Architecture

```
Incoming Request
       │
       ▼
┌──────────────────────────────────────┐
│             FlexGate Proxy           │
│                                      │
│  CORS  ──►  Rate Limit  ──►  Auth   │
│                   │                  │
│            Route Matching            │
│                   │                  │
│           Circuit Breaker            │
│                   │                  │
│          Upstream Request            │
│                   │                  │
│       Metrics + Structured Logs      │
└──────────────────────────────────────┘
       │                    │
       ▼                    ▼
   Response           AI Event Bus
                            │
                     AI Incident Record
                            │
                     Claude Analysis
                     (root cause + fix)
```

## What's New in v0.1.0-beta.2

- **0 npm vulnerabilities** — removed `jade` (4 CVEs), upgraded `http-proxy-middleware` to v3, `morgan` to 1.10.1
- **Settings API** — `GET/PUT/POST /api/settings` with validation, sanitization, and backup
- **AI incident tracking** — full CRUD at `/api/ai-incidents` with Claude integration
- **Tiered rate limiting** — global / admin / auth layers
- **Restricted CORS** — configured via `ALLOWED_ORIGINS` environment variable
- **26/26 integration tests passing**

See the full [Changelog](changelog.md).

> **Beta notice:** Not recommended for production use yet. [Report issues on GitHub.](https://github.com/tapas100/flexgate-proxy/issues)

[![npm](https://img.shields.io/npm/v/flexgate-proxy?label=npm&color=blue)](https://www.npmjs.com/package/flexgate-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/tapas100/flexgate-proxy/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Security: 0 CVEs](https://img.shields.io/badge/security-0%20CVEs-success)](https://github.com/tapas100/flexgate-proxy/security)

---

## Quick Install

```bash
npm install -g flexgate-proxy

flexgate init       # generates config/flexgate.json
flexgate migrate    # sets up the database schema
flexgate start      # starts gateway on :3001, Admin UI on :3000
```

---

## What is FlexGate?

FlexGate is a **production-grade reverse proxy and API gateway** built on Node.js. It sits in front of your upstream services and gives you intelligent traffic control, real-time observability, and AI-native incident response — all in one package.

### 🤖 AI-Native Signals

Stop copy-pasting logs into Claude. FlexGate emits 10 structured event types (`CIRCUIT_BREAKER_OPENED`, `HIGH_LATENCY`, `ERROR_RATE_SPIKE`, ...) that AI agents can reason about directly — no dashboards, no noisy logs.

### 🛡️ Production Security

SSRF protection, HMAC-SHA256 API keys, tiered rate limiting (global / admin / auth), restricted CORS via `ALLOWED_ORIGINS`, and **0 npm vulnerabilities**.

### ⚡ Circuit Breakers & Retries

Per-upstream circuit breaking with configurable thresholds and automatic recovery. Exponential backoff retries with jitter. Never let one bad upstream take down everything.

### 📊 Real-time Observability

Prometheus metrics, Winston structured JSON logs, Server-Sent Events for live dashboard streaming, and full PostgreSQL persistence for every request.

### 🖥️ Admin UI — No Extra Setup

Full React dashboard built-in: manage routes, webhooks, logs, metrics, settings, and AI incidents from a single URL at `http://localhost:3000`.

### 💰 Token-Optimised

~$5/day for AI-assisted incident response vs $50–500/day for Grafana + PagerDuty + on-call. Clean, pre-digested signals mean fewer tokens and less hallucination risk.

---

## How It Compares

| Feature | FlexGate | Kong | AWS API GW | Nginx |
|---------|----------|------|------------|-------|
| Admin UI | ✅ Built-in, free | ✅ Enterprise only | ✅ Paid | ❌ |
| AI-native events | ✅ | ❌ | ❌ | ❌ |
| npm installable | ✅ | ❌ | ❌ | ❌ |
| Circuit breakers | ✅ Built-in | ✅ Plugin | ❌ | ❌ |
| PostgreSQL backend | ✅ | ✅ | ✅ | ❌ |
| Open source | ✅ MIT | ✅ / Enterprise | ❌ | ✅ |

---

## Architecture

```
Incoming Request
       │
       ▼
┌──────────────────────────────────────┐
│             FlexGate Proxy           │
│                                      │
│  CORS  ──►  Rate Limit  ──►  Auth   │
│                   │                  │
│            Route Matching            │
│                   │                  │
│           Circuit Breaker            │
│                   │                  │
│          Upstream Request            │
│                   │                  │
│       Metrics + Structured Logs      │
└──────────────────────────────────────┘
       │                    │
       ▼                    ▼
   Response           AI Event Bus
                            │
                     AI Incident Record
                            │
                     Claude Analysis
                     (root cause + fix)
```

---

## Documentation

| | |
|---|---|
| [Getting Started](getting-started/index.md) | Install, configure, run your first gateway |
| [Guides](guides/index.md) | Routes, webhooks, Admin UI, observability, traffic control |
| [AI Features](ai/index.md) | AI events, incident response playbooks, cost control |
| [API Reference](api/index.md) | Full REST API — all endpoints with request/response |
| [CLI Reference](cli/index.md) | `flexgate init`, `start`, `migrate`, `status` |
| [Architecture](architecture/index.md) | System design, threat model, trade-offs |
| [Deployment](deployment/index.md) | AWS EC2, cloud comparison, production hardening |
| [Contributing](contributing/index.md) | Dev setup, project structure, PR guidelines |

---

## What's New in v0.1.0-beta.2

- **0 npm vulnerabilities** — removed `jade` (4 CVEs), upgraded `http-proxy-middleware` to v3, `morgan` to 1.10.1
- **Settings API** — `GET/PUT/POST /api/settings` with validation, sanitization, and backup
- **AI incident tracking** — full CRUD at `/api/ai-incidents` with Claude integration
- **Tiered rate limiting** — global / admin / auth layers
- **Restricted CORS** — configured via `ALLOWED_ORIGINS` environment variable
- **26/26 integration tests passing**

See the full [Changelog](changelog.md).

---

> **Beta notice:** Not recommended for production use yet. [Report issues on GitHub.](https://github.com/tapas100/flexgate-proxy/issues)
