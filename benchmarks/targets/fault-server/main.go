// benchmarks/targets/fault-server/main.go
//
// Fault-injection HTTP server for Stage 7 failure testing.
//
// Replaces (or augments) the standard echo server to simulate upstream faults
// that FlexGate must handle gracefully.  Each fault mode is selectable via
// the -mode flag.
//
// Modes
// ─────
//   healthy     — normal echo server (default); responds 200 immediately
//   down        — immediately closes the connection (simulates "port closed")
//   slow        — delays every response by -delay ms (simulates overloaded upstream)
//   timeout     — hangs indefinitely until the client closes (simulates dead upstream)
//   reset       — accepts the connection then sends TCP RST (simulates abrupt crash)
//
// HTTP control plane (port -ctrl-addr, default :9099)
// ──────────────────────────────────────────────────
//   POST /fault/set?mode=<mode>   — change mode at runtime without restart
//   GET  /fault/status            — returns current mode as JSON
//   POST /fault/reset             — return to healthy mode
//
// The control plane is used by run-failure.sh to switch fault modes between
// test phases without restarting the server.
//
// Build
// ─────
//   go build -o benchmarks/targets/fault-server/fault-server \
//            ./benchmarks/targets/fault-server/
//
// Run
// ───
//   # Start in healthy mode:
//   ./fault-server -addr :9008 -ctrl-addr :9099
//
//   # Switch to slow mode (800 ms delay):
//   ./fault-server -addr :9008 -ctrl-addr :9099 -delay 800
//   curl -X POST "http://localhost:9099/fault/set?mode=slow"
//
//   # Switch to timeout:
//   curl -X POST "http://localhost:9099/fault/set?mode=timeout"
//
//   # Return to healthy:
//   curl -X POST "http://localhost:9099/fault/reset"

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"sync/atomic"
	"time"
)

// ── Mode constants ────────────────────────────────────────────────────────────

const (
	ModeHealthy = "healthy"
	ModeDown    = "down"
	ModeSlow    = "slow"
	ModeTimeout = "timeout"
	ModeReset   = "reset"
)

var validModes = map[string]bool{
	ModeHealthy: true,
	ModeDown:    true,
	ModeSlow:    true,
	ModeTimeout: true,
	ModeReset:   true,
}

// ── Global state ──────────────────────────────────────────────────────────────

var (
	currentMode atomic.Value  // stores string
	delayMs     int
	reqCount    uint64

	healthBody = []byte(`{"ok":true,"service":"fault-server"}`)
)

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	addr     := flag.String("addr",      ":9008", "Data-plane listen address")
	ctrlAddr := flag.String("ctrl-addr", ":9099", "Control-plane listen address")
	mode     := flag.String("mode",      "healthy", "Initial fault mode: healthy|down|slow|timeout|reset")
	delay    := flag.Int("delay",        800,    "Artificial delay in ms (used in 'slow' mode)")
	flag.Parse()

	if !validModes[*mode] {
		log.Fatalf("[fault-server] unknown mode: %s", *mode)
	}

	currentMode.Store(*mode)
	delayMs = *delay

	// ── Control plane ───────────────────────────────────────────────────────
	ctrlMux := http.NewServeMux()

	ctrlMux.HandleFunc("/fault/set", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		newMode := r.URL.Query().Get("mode")
		if !validModes[newMode] {
			http.Error(w, fmt.Sprintf(`{"error":"unknown mode: %s"}`, newMode), http.StatusBadRequest)
			return
		}
		currentMode.Store(newMode)
		log.Printf("[fault-server] mode changed to: %s", newMode)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"ok":true,"mode":"%s"}`, newMode)
	})

	ctrlMux.HandleFunc("/fault/reset", func(w http.ResponseWriter, r *http.Request) {
		currentMode.Store(ModeHealthy)
		log.Printf("[fault-server] mode reset to: healthy")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"ok":true,"mode":"healthy"}`)
	})

	ctrlMux.HandleFunc("/fault/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"mode":"%s","delay_ms":%d,"req_count":%d}`,
			currentMode.Load().(string), delayMs, atomic.LoadUint64(&reqCount))
	})

	go func() {
		log.Printf("[fault-server] control plane on %s", *ctrlAddr)
		if err := http.ListenAndServe(*ctrlAddr, ctrlMux); err != nil {
			log.Fatalf("[fault-server] ctrl: %v", err)
		}
	}()

	// ── Data plane ──────────────────────────────────────────────────────────
	// We use a raw net.Listener so that "down" and "reset" modes can
	// manipulate the connection at the TCP level before HTTP parsing.
	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatalf("[fault-server] listen: %v", err)
	}

	log.Printf("[fault-server] data plane on %s  mode=%s  delay=%dms  pid=%d",
		*addr, *mode, *delay, os.Getpid())

	// Build a standard HTTP server for healthy/slow/timeout modes
	dataMux := http.NewServeMux()

	dataMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		mode := currentMode.Load().(string)
		n := atomic.AddUint64(&reqCount, 1)

		switch mode {
		case ModeHealthy:
			// Normal echo
			resp, _ := json.Marshal(map[string]interface{}{
				"ok": true, "ts": time.Now().UnixNano(), "req_n": n,
			})
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Content-Length", fmt.Sprintf("%d", len(resp)))
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(resp)

		case ModeSlow:
			// Delay, then respond normally
			time.Sleep(time.Duration(delayMs) * time.Millisecond)
			resp, _ := json.Marshal(map[string]interface{}{
				"ok": true, "ts": time.Now().UnixNano(), "req_n": n, "delay_ms": delayMs,
			})
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(resp)

		case ModeTimeout:
			// Hang until the client closes. FlexGate's context timeout will fire.
			// We use a 90 s local limit to prevent goroutine leaks in the fault server.
			select {
			case <-r.Context().Done():
				// Client disconnected (FlexGate timed out)
			case <-time.After(90 * time.Second):
				// Safety valve — don't hold forever
			}
			// At this point writing is a no-op but prevents panic
			w.WriteHeader(http.StatusServiceUnavailable)

		case ModeDown, ModeReset:
			// These are handled at the TCP accept layer below.
			// If we get here it means the mode changed after accept —
			// just close normally.
			w.WriteHeader(http.StatusServiceUnavailable)
		}
	})

	dataMux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		// Health check always responds regardless of fault mode.
		// This lets HAProxy keep the server in rotation even during fault injection
		// (which is intentional — we want FlexGate to try to forward).
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(healthBody)
	})

	srv := &http.Server{
		Handler:           dataMux,
		ReadTimeout:       120 * time.Second,  // generous — for timeout mode
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       60 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Custom Accept loop so we can intercept at TCP level for down/reset modes
	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Printf("[fault-server] accept error: %v", err)
			continue
		}

		mode := currentMode.Load().(string)
		switch mode {
		case ModeDown:
			// Immediately close — simulates "connection refused" from a dead process.
			// The OS has already accepted the TCP handshake (SYN+SYN-ACK+ACK) before
			// we got here; closing now triggers an immediate RST on some OSes.
			conn.Close()
			continue

		case ModeReset:
			// Set SO_LINGER=0 to force RST on close
			if tc, ok := conn.(*net.TCPConn); ok {
				tc.SetLinger(0)
			}
			conn.Close()
			continue

		default:
			// healthy / slow / timeout — hand off to HTTP server
			go srv.ConnState(conn, http.StateNew)
			go serveConn(srv, conn)
		}
	}
}

// serveConn passes an already-accepted net.Conn to the http.Server.
// This is the pattern used internally by http.Server.Serve().
func serveConn(srv *http.Server, conn net.Conn) {
	// http.Server does not expose a public ServeConn method in older Go
	// versions, but net/http does expose it since Go 1.12.  We wrap via
	// a single-connection listener.
	l := &oneConnListener{conn: conn, done: make(chan struct{})}
	srv.Serve(l)
	<-l.done
}

// oneConnListener is a net.Listener that yields exactly one connection.
type oneConnListener struct {
	conn net.Conn
	done chan struct{}
}

func (l *oneConnListener) Accept() (net.Conn, error) {
	if l.conn == nil {
		// Block until closed
		<-l.done
		return nil, fmt.Errorf("closed")
	}
	c := l.conn
	l.conn = nil
	return c, nil
}

func (l *oneConnListener) Close() error {
	select {
	case <-l.done:
	default:
		close(l.done)
	}
	return nil
}

func (l *oneConnListener) Addr() net.Addr {
	return &net.TCPAddr{}
}
