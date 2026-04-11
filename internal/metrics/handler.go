package metrics

import (
	"math"
	"net/http"
	"sort"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	dto "github.com/prometheus/client_model/go"
)

// Handler returns an http.Handler that serves Prometheus text exposition at
// /metrics. It uses the shared Registry so only FlexGate metrics are exposed
// (no default Go runtime metrics unless explicitly added).
func Handler() http.Handler {
	return promhttp.HandlerFor(Registry, promhttp.HandlerOpts{
		EnableOpenMetrics: true,
		Registry:          Registry,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary — computed percentiles for the admin API
// ─────────────────────────────────────────────────────────────────────────────

// Summary holds pre-computed latency percentiles and error rate, derived from
// the live Prometheus histogram data. Computed on demand by GatherSummary().
type Summary struct {
	// Latency percentiles (seconds).
	P50 float64 `json:"p50_ms"`
	P95 float64 `json:"p95_ms"`
	P99 float64 `json:"p99_ms"`

	// ErrorRate is the proportion of 5xx responses over all responses.
	// Range 0.0–1.0. -1.0 means no data yet.
	ErrorRate float64 `json:"error_rate"`

	// TotalRequests is the sum of all flexgate_proxy_requests_total counters.
	TotalRequests float64 `json:"total_requests"`

	// ActiveRequests is the current gauge value.
	ActiveRequestsNow float64 `json:"active_requests"`

	// IntelligenceCircuitOpen is true when the circuit breaker is open.
	IntelligenceCircuitOpen bool `json:"intelligence_circuit_open"`
}

// GatherSummary reads the current Prometheus metric state and computes the
// admin summary in one pass. Safe for concurrent use.
func GatherSummary() Summary {
	mfs, err := Registry.Gather()
	if err != nil {
		return Summary{ErrorRate: -1}
	}

	var (
		totalReqs    float64
		totalErrors  float64
		activereqs   float64
		circuitOpen  bool
		histBuckets  []bucket // (upper_bound, cumulative_count) pairs
		histCount    float64
	)

	for _, mf := range mfs {
		switch mf.GetName() {
		case "flexgate_proxy_requests_total":
			for _, m := range mf.GetMetric() {
				totalReqs += m.GetCounter().GetValue()
				for _, l := range m.GetLabel() {
					if l.GetName() == "status_class" && l.GetValue() == "5xx" {
						totalErrors += m.GetCounter().GetValue()
					}
				}
			}

		case "flexgate_proxy_active_requests":
			for _, m := range mf.GetMetric() {
				activereqs = m.GetGauge().GetValue()
			}

		case "flexgate_intelligence_circuit_open":
			for _, m := range mf.GetMetric() {
				circuitOpen = m.GetGauge().GetValue() > 0
			}

		case "flexgate_proxy_request_duration_seconds":
			// Merge all label combinations into one aggregate histogram.
			for _, m := range mf.GetMetric() {
				h := m.GetHistogram()
				histCount += float64(h.GetSampleCount())
				for _, b := range h.GetBucket() {
					histBuckets = mergeBucket(histBuckets, b.GetUpperBound(), float64(b.GetCumulativeCount()))
				}
			}
		}
	}

	s := Summary{
		TotalRequests:           totalReqs,
		ActiveRequestsNow:       activereqs,
		IntelligenceCircuitOpen: circuitOpen,
	}

	// Error rate.
	if totalReqs > 0 {
		s.ErrorRate = totalErrors / totalReqs
	} else {
		s.ErrorRate = -1
	}

	// Percentiles from the merged histogram.
	if histCount > 0 && len(histBuckets) > 0 {
		s.P50 = quantile(histBuckets, histCount, 0.50) * 1000 // → ms
		s.P95 = quantile(histBuckets, histCount, 0.95) * 1000
		s.P99 = quantile(histBuckets, histCount, 0.99) * 1000
	}

	return s
}

// ─────────────────────────────────────────────────────────────────────────────
// Histogram math
// ─────────────────────────────────────────────────────────────────────────────

type bucket struct {
	upper float64
	count float64
}

// mergeBucket accumulates a bucket into the slice (sums counts for same upper bound).
func mergeBucket(bs []bucket, upper, count float64) []bucket {
	for i := range bs {
		if bs[i].upper == upper {
			bs[i].count += count
			return bs
		}
	}
	return append(bs, bucket{upper: upper, count: count})
}

// quantile estimates the q-th quantile from a cumulative histogram.
// Uses linear interpolation between bucket boundaries (standard Prometheus approach).
func quantile(bs []bucket, total, q float64) float64 {
	if total == 0 || len(bs) == 0 {
		return 0
	}
	sort.Slice(bs, func(i, j int) bool { return bs[i].upper < bs[j].upper })

	target := q * total
	prev := bucket{upper: 0, count: 0}
	for _, b := range bs {
		if b.count >= target {
			if b.count == prev.count {
				return b.upper
			}
			// Linear interpolation within this bucket.
			frac := (target - prev.count) / (b.count - prev.count)
			return prev.upper + frac*(b.upper-prev.upper)
		}
		prev = b
	}
	// All observations fell in the +Inf bucket.
	return math.Inf(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Gather helpers used by tests
// ─────────────────────────────────────────────────────────────────────────────

// GatherMetricFamily is a test helper that returns the first MetricFamily
// with the given name from the shared Registry.
func GatherMetricFamily(name string) *dto.MetricFamily {
	mfs, _ := Registry.Gather()
	for _, mf := range mfs {
		if mf.GetName() == name {
			return mf
		}
	}
	return nil
}
