# FlexGate Proxy

<div class="hero" markdown>

# FlexGate Proxy

**The AI-native API gateway that detects failures, analyzes root causes with Claude, and auto-heals 80% of incidents — in under 10 minutes.**

<div class="btn-group" markdown>
[Get Started](getting-started/quickstart.md){ .md-button .md-button--primary }
[View on GitHub](https://github.com/tapas100/flexgate-proxy){ .md-button }
[npm install](https://www.npmjs.com/package/flexgate-proxy){ .md-button }
</div>

</div>

## Why FlexGate?

<div class="feature-grid" markdown>

<div class="feature-card" markdown>
<div class="icon">🤖</div>
**AI-Native Signals**  
Stop exporting logs to Claude. Native AI event types with pre-digested, structured context. No hallucinations.
</div>

<div class="feature-card" markdown>
<div class="icon">🛡️</div>
**Production Security**  
SSRF protection, HMAC API keys, tiered rate limiting, restricted CORS, and 0 npm CVEs.
</div>

<div class="feature-card" markdown>
<div class="icon">⚡</div>
**Circuit Breakers**  
Per-upstream circuit breaking with automatic recovery. Never let one bad upstream take down everything.
</div>

<div class="feature-card" markdown>
<div class="icon">📊</div>
**Real-time Observability**  
Prometheus metrics, Winston structured logs, SSE live dashboard, and PostgreSQL persistence.
</div>

<div class="feature-card" markdown>
<div class="icon">🖥️</div>
**Admin UI**  
Full React dashboard for routes, webhooks, logs, metrics, settings, and AI incident management.
</div>

<div class="feature-card" markdown>
<div class="icon">💰</div>
**Token-Optimised**  
87% cheaper than Grafana + PagerDuty. Clean AI signals cost < $5/day vs $50–500/day for traditional stacks.
</div>

</div>

---

## Quick Install

=== "npm"

    ```bash
    npm install -g flexgate-proxy
    flexgate init
    flexgate start
    ```

=== "From source"

    ```bash
    git clone https://github.com/tapas100/flexgate-proxy.git
    cd flexgate-proxy
    npm install && npm run build
    npm start
    ```

---

## Current Version

| Package | Version | Status |
|---------|---------|--------|
| `flexgate-proxy` | `0.1.0-beta.2` | ⚠️ Beta |
| Node.js | `>=18.0.0` | ✅ |
| npm | `>=9.0.0` | ✅ |

!!! warning "Beta Release"
    This is a **beta** release. Not recommended for production use yet.  
    [Report issues →](https://github.com/tapas100/flexgate-proxy/issues)

---

## What's New in beta.2

!!! success "0 npm vulnerabilities"
    Removed `jade` (4 CVEs), upgraded `http-proxy-middleware` → v3, `morgan` → 1.10.1. Full details in the [Changelog](changelog.md).

- ✅ Settings API (`/api/settings`) with validation, backup, and sanitization  
- ✅ AI incident tracking (`/api/ai-incidents`) with Claude integration  
- ✅ Tiered API rate limiting (global / admin / auth)  
- ✅ CORS restricted to `ALLOWED_ORIGINS` env var  
- ✅ 26/26 integration tests passing  
