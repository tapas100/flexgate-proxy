// benchmarks/targets/echo-server/main.go
//
// Zero-logic HTTP echo server used as the upstream for all benchmark scenarios.
//
// Design rules:
//   - Single handler, no middleware, no routing logic
//   - Pre-allocated response body — no per-request allocation on the hot path
//   - Responds 200 to /bench and /health; 404 to everything else
//   - Reports its own start timestamp in the response so k6 can calculate
//     true end-to-end latency if needed
//   - No logging to stdout (avoids I/O becoming the bottleneck)
//   - Configurable via flags: -addr, -latency (artificial delay in µs)
//
// Build:
//   go build -o benchmarks/targets/echo-server/echo-server \
//            ./benchmarks/targets/echo-server/
//
// Run:
//   ./benchmarks/targets/echo-server/echo-server -addr :9000
//
//   # With artificial 1 ms upstream latency (realistic application simulation):
//   ./benchmarks/targets/echo-server/echo-server -addr :9000 -latency 1000

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync/atomic"
	"time"
)

// ── Response type ─────────────────────────────────────────────────────────────

type benchResponse struct {
	OK       bool   `json:"ok"`
	TS       int64  `json:"ts"`     // unix nanoseconds — allows latency decomposition
	ReqCount uint64 `json:"req_n"`  // monotonic counter — detect dropped requests
}

// ── Global state ──────────────────────────────────────────────────────────────

var (
	startTime = time.Now()
	reqCount  uint64 // atomic counter

	// Pre-encoded health response — never changes
	healthBody = []byte(`{"ok":true,"service":"echo-server"}`)
)

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	addr    := flag.String("addr",    ":9000", "Listen address")
	latency := flag.Int("latency",   0,        "Artificial upstream latency in microseconds (0 = none)")
	flag.Parse()

	artificialDelay := time.Duration(*latency) * time.Microsecond

	mux := http.NewServeMux()

	// /bench — the hot-path benchmark endpoint
	mux.HandleFunc("/bench", func(w http.ResponseWriter, r *http.Request) {
		if artificialDelay > 0 {
			time.Sleep(artificialDelay)
		}

		n := atomic.AddUint64(&reqCount, 1)

		resp := benchResponse{
			OK:       true,
			TS:       time.Now().UnixNano(),
			ReqCount: n,
		}

		body, _ := json.Marshal(resp)

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(body)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})

	// /health — liveness probe used by k6 setup() and HAProxy health checks
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(healthBody)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(healthBody)
	})

	// Everything else → 404 (catches misconfigured proxy routes immediately)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	})

	srv := &http.Server{
		Addr:    *addr,
		Handler: mux,

		// Tuned for high-concurrency benchmark load
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      5 * time.Second,
		IdleTimeout:       60 * time.Second,
		ReadHeaderTimeout: 2 * time.Second,
		MaxHeaderBytes:    1 << 16, // 64 KiB
	}

	log.Printf("[echo-server] listening on %s  artificial_latency=%v  pid=%d",
		*addr, artificialDelay, os.Getpid())
	log.Printf("[echo-server] started at %s", startTime.Format(time.RFC3339))

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[echo-server] fatal: %v", err)
	}
}
