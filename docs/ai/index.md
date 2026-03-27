# AI Features

FlexGate is the first API gateway with **native AI integration** — turning live traffic into structured signals that Claude can reason about, without dashboards or noisy logs.

---

## How It Works

```
Live Traffic
    │
    ▼
FlexGate Event Bus ──► Structured AI Events (10 types)
    │                        │
    │                        ▼
    │                 AI Incident Created
    │                        │
    │                        ▼
    │                 Claude Analysis
    │                 (root cause + actions)
    │                        │
    ▼                        ▼
Metrics / Logs       Auto-Recovery Actions
                     (circuit break, scale, alert)
```

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **AI Events** | 10 structured event types — `CIRCUIT_BREAKER_OPENED`, `HIGH_LATENCY`, `ERROR_RATE_SPIKE`, etc. |
| **AI Incidents** | Persisted incident records with Claude analysis, confidence scores, and recommended actions |
| **Playbooks** | Pre-built response strategies for common failure patterns |
| **Cost Tracking** | Per-analysis token usage and daily budget controls |

---

## Sections

<div class="feature-grid" markdown>

<div class="feature-card" markdown>
<div class="icon">🎯</div>
**[Use Cases](use-cases.md)**  
Real scenarios where FlexGate AI saves the day.
</div>

<div class="feature-card" markdown>
<div class="icon">🚨</div>
**[Incident Response](playbooks/incident-response.md)**  
Step-by-step AI-assisted incident resolution.
</div>

<div class="feature-card" markdown>
<div class="icon">🔄</div>
**[Auto-Recovery](playbooks/auto-recovery.md)**  
Automated healing playbooks for common failures.
</div>

<div class="feature-card" markdown>
<div class="icon">💰</div>
**[Cost Optimization](playbooks/cost-optimization.md)**  
Keep AI analysis costs under $5/day.
</div>

<div class="feature-card" markdown>
<div class="icon">🧪</div>
**[Testing Guide](TESTING_GUIDE.md)**  
Test AI features without live incidents.
</div>

</div>

---

## Quick Setup

```bash
# Set your Claude API key
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env

# Restart FlexGate
npm start

# Verify AI endpoint
curl http://localhost:3001/api/ai/health
```

!!! info "Free Providers"
    Don't have a Claude API key? FlexGate also supports **Gemini** and free open-source models.  
    See [AI Provider Configuration](../getting-started/configuration.md).
