package handlers

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/rs/zerolog"
)

// AITestingHandler serves the AI testing page endpoints:
//
//	GET  /api/ai/events/sample?type=<EVENT_TYPE>  – generate a sample AI event
//	POST /api/ai/prompts/build                     – build a Claude-ready prompt
type AITestingHandler struct {
	log zerolog.Logger
}

// NewAITestingHandler constructs an AITestingHandler.
func NewAITestingHandler(log zerolog.Logger) *AITestingHandler {
	return &AITestingHandler{log: log}
}

// ── domain types (mirror AITesting.tsx) ──────────────────────────────────────

type aiEventMetadata struct {
	Confidence     float64  `json:"confidence"`
	EstimatedTokens int     `json:"estimated_tokens"`
	ReasoningHints []string `json:"reasoning_hints"`
}

type aiTestEvent struct {
	EventID   string          `json:"event_id"`
	Timestamp string          `json:"timestamp"`
	EventType string          `json:"event_type"`
	Summary   string          `json:"summary"`
	Severity  string          `json:"severity"`
	Data      interface{}     `json:"data"`
	Context   interface{}     `json:"context"`
	AIMetadata aiEventMetadata `json:"ai_metadata"`
}

type promptTemplate struct {
	Name      string `json:"name"`
	EventType string `json:"event_type"`
	MaxTokens int    `json:"max_tokens"`
}

type promptRecommendations struct {
	Model           string  `json:"model"`
	MaxTokens       int     `json:"max_tokens"`
	EstimatedCostUSD float64 `json:"estimated_cost_usd"`
}

type promptBuildResponse struct {
	Event           aiTestEvent           `json:"event"`
	Prompt          string                `json:"prompt"`
	Template        promptTemplate        `json:"template"`
	Recommendations promptRecommendations `json:"recommendations"`
}

// ── GET /api/ai/events/sample ─────────────────────────────────────────────

// SampleEvent generates a realistic sample event for the given type.
func (h *AITestingHandler) SampleEvent(w http.ResponseWriter, r *http.Request) {
	eventType := r.URL.Query().Get("type")
	if eventType == "" {
		eventType = "LATENCY_ANOMALY"
	}

	ev := buildSampleEvent(eventType)

	writeJSON(w, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"event": ev,
		},
	})
}

// ── POST /api/ai/prompts/build ────────────────────────────────────────────

// BuildPrompt accepts an event and returns a Claude-ready prompt with cost
// estimates.
func (h *AITestingHandler) BuildPrompt(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Event aiTestEvent `json:"event"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"success":false,"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	ev := body.Event
	if ev.EventType == "" {
		http.Error(w, `{"success":false,"error":"event.event_type is required"}`, http.StatusBadRequest)
		return
	}

	prompt := buildPrompt(ev)
	tokenEstimate := len(prompt)/4 + 200 // rough heuristic

	resp := promptBuildResponse{
		Event:  ev,
		Prompt: prompt,
		Template: promptTemplate{
			Name:      templateNameFor(ev.EventType),
			EventType: ev.EventType,
			MaxTokens: 1000,
		},
		Recommendations: promptRecommendations{
			Model:            "gemini-2.5-flash",
			MaxTokens:        1000,
			EstimatedCostUSD: float64(tokenEstimate) / 1_000_000 * 0.075,
		},
	}

	writeJSON(w, map[string]interface{}{
		"success": true,
		"data":    resp,
	})
}

// ── sample event builders ─────────────────────────────────────────────────

var routes = []string{
	"/api/users", "/api/products", "/api/orders", "/api/payments",
	"/api/auth", "/api/search", "/api/checkout", "/api/inventory",
}

var upstreams = []string{
	"backend-us-east-1", "backend-us-west-2", "backend-eu-west-1",
	"api-service-v2", "legacy-monolith",
}

func randomRoute() string  { return routes[rand.Intn(len(routes))] }
func randomUpstream() string { return upstreams[rand.Intn(len(upstreams))] }
func jitter(base, pct float64) float64 {
	return base + (rand.Float64()-0.5)*2*base*pct
}

func buildSampleEvent(eventType string) aiTestEvent {
	now := time.Now().UTC()
	id := fmt.Sprintf("evt-%s-%d", eventType[:3], now.UnixMilli())
	route := randomRoute()
	upstream := randomUpstream()

	base := aiTestEvent{
		EventID:   id,
		Timestamp: now.Format(time.RFC3339),
		EventType: eventType,
	}

	switch eventType {
	case "LATENCY_ANOMALY":
		p99 := jitter(2800, 0.3)
		base.Summary = fmt.Sprintf("P99 latency %.0fms on %s (baseline 180ms)", p99, route)
		base.Severity = "HIGH"
		base.Data = map[string]interface{}{
			"route":          route,
			"p50_ms":         jitter(320, 0.2),
			"p95_ms":         jitter(1400, 0.2),
			"p99_ms":         p99,
			"baseline_ms":    180,
			"spike_factor":   p99 / 180,
			"sample_window":  "5m",
			"affected_rps":   jitter(45, 0.3),
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.91, EstimatedTokens: 420,
			ReasoningHints: []string{"check upstream timeouts", "inspect GC pauses", "verify DB connection pool"},
		}

	case "ERROR_RATE_SPIKE":
		rate := jitter(18.4, 0.3)
		base.Summary = fmt.Sprintf("Error rate %.1f%% on %s (threshold 2%%)", rate, route)
		base.Severity = "CRITICAL"
		base.Data = map[string]interface{}{
			"route":          route,
			"error_rate_pct": rate,
			"threshold_pct":  2.0,
			"errors_per_min": int(jitter(110, 0.3)),
			"top_status":     map[string]int{"502": 61, "503": 29, "500": 10},
			"sample_window":  "3m",
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.96, EstimatedTokens: 380,
			ReasoningHints: []string{"upstream health degraded", "check circuit breaker state", "review recent deploys"},
		}

	case "COST_ALERT":
		cost := jitter(47.2, 0.2)
		base.Summary = fmt.Sprintf("Route %s cost $%.2f/hr — %.0f%% over budget", route, cost, jitter(215, 0.1))
		base.Severity = "MEDIUM"
		base.Data = map[string]interface{}{
			"route":              route,
			"cost_per_hour_usd":  cost,
			"budget_usd":         15.0,
			"overage_pct":        (cost - 15.0) / 15.0 * 100,
			"requests_per_hour":  int(jitter(18000, 0.2)),
			"avg_response_bytes": int(jitter(24000, 0.3)),
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.87, EstimatedTokens: 350,
			ReasoningHints: []string{"response caching opportunity", "payload compression", "review rate limits"},
		}

	case "RETRY_STORM":
		retries := int(jitter(340, 0.3))
		base.Summary = fmt.Sprintf("%d retries/min on %s — cascading failure risk", retries, upstream)
		base.Severity = "CRITICAL"
		base.Data = map[string]interface{}{
			"upstream":         upstream,
			"retries_per_min":  retries,
			"original_rps":     int(jitter(85, 0.2)),
			"amplification_x":  float64(retries) / jitter(85, 0.2),
			"retry_budget_pct": jitter(94, 0.05),
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.93, EstimatedTokens: 400,
			ReasoningHints: []string{"exponential backoff needed", "retry budget exhausted", "downstream saturation imminent"},
		}

	case "CIRCUIT_BREAKER_CANDIDATE":
		failures := int(jitter(72, 0.2))
		base.Summary = fmt.Sprintf("%s: %d failures/min — circuit breaker recommended", upstream, failures)
		base.Severity = "HIGH"
		base.Data = map[string]interface{}{
			"upstream":          upstream,
			"failure_rate_pct":  jitter(68, 0.1),
			"failures_per_min":  failures,
			"consecutive_fails": int(jitter(25, 0.3)),
			"half_open_ready":   false,
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.89, EstimatedTokens: 390,
			ReasoningHints: []string{"open circuit now", "set recovery probe interval", "alert on-call team"},
		}

	case "RATE_LIMIT_BREACH":
		clientIP := fmt.Sprintf("203.0.113.%d", rand.Intn(200)+10)
		base.Summary = fmt.Sprintf("Rate limit breach: %s exceeded %d req/min on %s", clientIP, int(jitter(500, 0.2)), route)
		base.Severity = "MEDIUM"
		base.Data = map[string]interface{}{
			"route":         route,
			"client_ip":     clientIP,
			"requests":      int(jitter(500, 0.2)),
			"limit":         200,
			"window_sec":    60,
			"blocked_pct":   jitter(61, 0.1),
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.97, EstimatedTokens: 310,
			ReasoningHints: []string{"possible scraper/bot", "consider IP block", "tighten rate limit rule"},
		}

	case "UPSTREAM_DEGRADATION":
		base.Summary = fmt.Sprintf("%s health score dropped to %.0f%%", upstream, jitter(34, 0.2))
		base.Severity = "HIGH"
		base.Data = map[string]interface{}{
			"upstream":       upstream,
			"health_score":   jitter(34, 0.2),
			"latency_ms":     jitter(1200, 0.3),
			"error_rate_pct": jitter(12, 0.3),
			"connections":    int(jitter(48, 0.2)),
			"max_connections": 50,
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.88, EstimatedTokens: 370,
			ReasoningHints: []string{"failover to secondary", "shed load gracefully", "page SRE"},
		}

	case "SECURITY_ANOMALY":
		base.Summary = fmt.Sprintf("Unusual access pattern on %s — possible credential stuffing", route)
		base.Severity = "CRITICAL"
		base.Data = map[string]interface{}{
			"route":          route,
			"unique_ips":     int(jitter(840, 0.3)),
			"auth_failures":  int(jitter(1200, 0.3)),
			"user_agents":    int(jitter(12, 0.3)),
			"geo_spread":     []string{"CN", "RU", "BR", "IN"},
			"pattern":        "credential_stuffing",
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.84, EstimatedTokens: 450,
			ReasoningHints: []string{"trigger CAPTCHA", "enable geo-blocking", "rate limit per user"},
		}

	case "CAPACITY_WARNING":
		base.Summary = fmt.Sprintf("CPU %.0f%%, memory %.0f%% — approaching saturation", jitter(87, 0.05), jitter(91, 0.03))
		base.Severity = "HIGH"
		base.Data = map[string]interface{}{
			"cpu_pct":         jitter(87, 0.05),
			"memory_pct":      jitter(91, 0.03),
			"goroutines":      int(jitter(4200, 0.2)),
			"open_fds":        int(jitter(18000, 0.1)),
			"gc_pause_ms":     jitter(42, 0.3),
			"heap_alloc_mb":   jitter(1800, 0.1),
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.94, EstimatedTokens: 360,
			ReasoningHints: []string{"scale horizontally", "profile memory leaks", "reduce goroutine pool size"},
		}

	case "RECOVERY_SIGNAL":
		base.Summary = fmt.Sprintf("%s recovered — error rate back to %.1f%%", upstream, jitter(0.3, 0.5))
		base.Severity = "LOW"
		base.Data = map[string]interface{}{
			"upstream":          upstream,
			"recovery_time_sec": int(jitter(180, 0.4)),
			"error_rate_now":    jitter(0.3, 0.5),
			"error_rate_peak":   jitter(45, 0.2),
			"circuit_state":     "closed",
		}
		base.AIMetadata = aiEventMetadata{
			Confidence: 0.98, EstimatedTokens: 280,
			ReasoningHints: []string{"monitor for recurrence", "review runbook", "update incident timeline"},
		}

	default:
		base.Summary = fmt.Sprintf("Unknown event type: %s", eventType)
		base.Severity = "LOW"
		base.Data = map[string]interface{}{"raw_type": eventType}
		base.AIMetadata = aiEventMetadata{Confidence: 0.5, EstimatedTokens: 200}
	}

	base.Context = map[string]interface{}{
		"environment": "production",
		"region":      "us-east-1",
		"version":     "1.4.2",
		"host":        "flexgate-proxy-1",
	}

	return base
}

// ── prompt builder ────────────────────────────────────────────────────────

func templateNameFor(eventType string) string {
	names := map[string]string{
		"LATENCY_ANOMALY":         "Latency Root-Cause Analysis",
		"ERROR_RATE_SPIKE":        "Error Rate Investigation",
		"COST_ALERT":              "Cost Optimization Review",
		"RETRY_STORM":             "Retry Storm Mitigation",
		"CIRCUIT_BREAKER_CANDIDATE": "Circuit Breaker Decision",
		"RATE_LIMIT_BREACH":       "Rate Limit Enforcement",
		"UPSTREAM_DEGRADATION":    "Upstream Health Analysis",
		"SECURITY_ANOMALY":        "Security Incident Response",
		"CAPACITY_WARNING":        "Capacity Planning",
		"RECOVERY_SIGNAL":         "Post-Recovery Review",
	}
	if n, ok := names[eventType]; ok {
		return n
	}
	return "General Incident Analysis"
}

func buildPrompt(ev aiTestEvent) string {
	dataJSON, _ := json.MarshalIndent(ev.Data, "", "  ")
	ctxJSON, _ := json.MarshalIndent(ev.Context, "", "  ")
	hints := ""
	for i, h := range ev.AIMetadata.ReasoningHints {
		hints += fmt.Sprintf("  %d. %s\n", i+1, h)
	}

	return fmt.Sprintf(`You are an expert SRE (Site Reliability Engineer) analyzing a production incident for a high-traffic API gateway called Flexgate.

## Incident Event

- **Event ID:** %s
- **Type:** %s  
- **Severity:** %s
- **Timestamp:** %s
- **Summary:** %s

## Event Data

`+"`"+`json
%s
`+"`"+`

## Environment Context

`+"`"+`json
%s
`+"`"+`

## Reasoning Hints

%s
## Your Task

1. **Root Cause Analysis** — Identify the most likely root cause(s) with confidence levels.
2. **Immediate Actions** — List the top 3 actions to take in the next 15 minutes.
3. **Short-term Fix** — Describe a fix that resolves the issue within 1 hour.
4. **Prevention** — Recommend 2–3 changes to prevent recurrence.
5. **Escalation** — Should this be escalated? To whom and why?

Respond in structured markdown with clear headings. Be concise and actionable.`,
		ev.EventID,
		ev.EventType,
		ev.Severity,
		ev.Timestamp,
		ev.Summary,
		string(dataJSON),
		string(ctxJSON),
		hints,
	)
}
