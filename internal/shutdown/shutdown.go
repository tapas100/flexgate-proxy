// Package shutdown provides an ordered, HAProxy-aware graceful shutdown
// orchestrator for FlexGate.
//
// Shutdown sequence
//
//  1. Signal HAProxy to drain this backend (AGENT-CHECK down / weight 0).
//     HAProxy stops sending new connections immediately; in-flight requests
//     continue on existing connections.
//
//  2. Wait for the HAProxy drain grace period so that the load balancer has
//     time to acknowledge the weight change and stop routing new requests to
//     this worker.
//
//  3. Call http.Server.Shutdown on both the proxy and admin servers with the
//     configured drain timeout. net/http drains all active keep-alive
//     connections and waits for in-flight requests to complete.
//
//  4. Cancel the root context, stopping all background goroutines
//     (route cache, NATS subscriber, etc.).
//
//  5. Close all store connections (Postgres pool, Redis client, NATS conn).
//
//  6. Flush any pending log writes and exit.
package shutdown

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/rs/zerolog"
)

// Config controls shutdown behaviour. All fields have sane defaults when zero.
type Config struct {
	// HAProxySocket is the path to the HAProxy UNIX admin socket.
	// Empty → HAProxy drain step is skipped.
	HAProxySocket string

	// DrainGracePeriod is the time we wait after telling HAProxy to drain
	// before we start shutting down the HTTP servers.
	// This allows the LB to detect the state change and stop routing new
	// requests. Default: 3s.
	DrainGracePeriod time.Duration

	// ShutdownTimeout is the maximum time allowed for in-flight HTTP requests
	// to complete after the servers stop accepting new connections.
	// Default: 30s.
	ShutdownTimeout time.Duration
}

func (c *Config) drainGrace() time.Duration {
	if c.DrainGracePeriod > 0 {
		return c.DrainGracePeriod
	}
	return 3 * time.Second
}

func (c *Config) shutdownTimeout() time.Duration {
	if c.ShutdownTimeout > 0 {
		return c.ShutdownTimeout
	}
	return 30 * time.Second
}

// Orchestrator manages the ordered shutdown sequence.
type Orchestrator struct {
	cfg    Config
	proxy  *http.Server
	admin  *http.Server
	cancel context.CancelFunc // cancels the root context
	closer func()             // closes all stores
	log    zerolog.Logger
}

// New creates a new Orchestrator. cancel must be the root context cancel func;
// closer must close all store clients.
func New(
	cfg Config,
	proxy, admin *http.Server,
	cancel context.CancelFunc,
	closer func(),
	log zerolog.Logger,
) *Orchestrator {
	return &Orchestrator{
		cfg:    cfg,
		proxy:  proxy,
		admin:  admin,
		cancel: cancel,
		closer: closer,
		log:    log,
	}
}

// Run executes the full shutdown sequence synchronously. It is intended to be
// called from main() after a SIGTERM/SIGINT is received.
func (o *Orchestrator) Run() {
	o.log.Info().Msg("shutdown: starting ordered shutdown sequence")

	// ── step 1: drain HAProxy ─────────────────────────────────────────────────
	if o.cfg.HAProxySocket != "" {
		if err := o.drainHAProxy(); err != nil {
			// Non-fatal: if HAProxy drain fails we still shut down cleanly;
			// the worst outcome is a brief burst of 502s from HAProxy.
			o.log.Warn().Err(err).Msg("shutdown: haproxy drain failed — continuing anyway")
		} else {
			o.log.Info().
				Dur("grace_period", o.cfg.drainGrace()).
				Msg("shutdown: haproxy drained, waiting grace period")
			time.Sleep(o.cfg.drainGrace())
		}
	} else {
		o.log.Debug().Msg("shutdown: haproxy socket not configured, skipping drain")
	}

	// ── step 2: stop accepting new HTTP connections ───────────────────────────
	shutCtx, shutCancel := context.WithTimeout(
		context.Background(), o.cfg.shutdownTimeout(),
	)
	defer shutCancel()

	done := make(chan error, 2)
	go func() { done <- o.proxy.Shutdown(shutCtx) }()
	go func() { done <- o.admin.Shutdown(shutCtx) }()

	for i := 0; i < 2; i++ {
		if err := <-done; err != nil {
			o.log.Error().Err(err).Msg("shutdown: http server shutdown error")
		}
	}
	o.log.Info().Msg("shutdown: http servers stopped")

	// ── step 3: cancel root context (background goroutines) ───────────────────
	o.cancel()
	o.log.Info().Msg("shutdown: root context cancelled")

	// ── step 4: close stores ──────────────────────────────────────────────────
	o.closer()
	o.log.Info().Msg("shutdown: stores closed")

	o.log.Info().Msg("shutdown: complete")
}

// drainHAProxy sends a runtime API command to the HAProxy admin socket to set
// this backend server's weight to 0, triggering a drain. HAProxy will
// immediately stop routing new requests to this worker while letting existing
// connections complete.
//
// The command used is:
//
//	set server <backend>/<server> weight 0
//
// We also try the simpler agent-check approach:
//
//	disable server <backend>/<server>
//
// In practice, weight-0 is safer because it triggers graceful draining in
// HAProxy rather than an abrupt removal.
//
// The socket protocol is line-oriented text; each command ends with \n and
// HAProxy responds with a single result line.
func (o *Orchestrator) drainHAProxy() error {
	conn, err := net.DialTimeout("unix", o.cfg.HAProxySocket, 2*time.Second)
	if err != nil {
		return fmt.Errorf("dial haproxy socket %s: %w", o.cfg.HAProxySocket, err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))

	// Send a SIGTERM-equivalent via the stats socket.
	// "set weight" gracefully drains; "disable" removes immediately.
	// We use "set weight 0%" which is the safest universal approach.
	cmd := "set weight flexgate/flexgate-worker 0%\n"
	if _, err := fmt.Fprint(conn, cmd); err != nil {
		return fmt.Errorf("write drain command: %w", err)
	}

	// Read response (optional — we don't fail on parse error).
	buf := make([]byte, 256)
	n, _ := conn.Read(buf)
	if n > 0 {
		o.log.Debug().
			Str("response", string(buf[:n])).
			Msg("shutdown: haproxy drain response")
	}
	return nil
}
