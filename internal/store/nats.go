package store

import (
	"context"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/rs/zerolog"
)

const (
	// natsConnectTimeout is the max time to establish the initial connection.
	natsConnectTimeout = 10 * time.Second
	// natsReconnectWait is the delay between reconnection attempts.
	natsReconnectWait = 2 * time.Second
	// natsMaxReconnects is the number of reconnection attempts before giving up.
	// -1 = unlimited.
	natsMaxReconnects = -1
	// natsPingInterval is how often the client pings the server to detect
	// broken connections.
	natsPingInterval = 30 * time.Second
	// natsMaxPingsOut is the number of unanswered pings before the client
	// considers the connection dead.
	natsMaxPingsOut = 3
	// natsStartupRetries controls how many times we retry the initial dial.
	natsStartupRetries = 10
	// natsRetryDelay is the backoff between initial dial retries.
	natsRetryDelay = 3 * time.Second
	// natsMaxPendingBytes is the maximum number of unprocessed bytes held in
	// the client buffer before the server starts slow-consumer warnings.
	// 64 MiB is the recommended starting value for high-throughput workloads.
	natsMaxPendingBytes = 64 * 1024 * 1024
)

// NATSConn wraps nats.Conn and adds application-level helpers.
type NATSConn struct {
	conn *nats.Conn
	log  zerolog.Logger
}

// NewNATSConn dials a NATS server, configures production-grade reconnect and
// ping-pong settings, and returns the wrapper. It retries the initial dial
// natsStartupRetries times to tolerate Docker / Kubernetes ordering races.
func NewNATSConn(ctx context.Context, url string, log zerolog.Logger) (*NATSConn, error) {
	var conn *nats.Conn
	var lastErr error

	opts := []nats.Option{
		// Connection lifecycle
		nats.Timeout(natsConnectTimeout),
		nats.ReconnectWait(natsReconnectWait),
		nats.MaxReconnects(natsMaxReconnects),
		nats.PingInterval(natsPingInterval),
		nats.MaxPingsOutstanding(natsMaxPingsOut),

		// Buffer tuning
		nats.ReconnectBufSize(natsMaxPendingBytes),

		// Structured reconnection logging
		nats.DisconnectErrHandler(func(nc *nats.Conn, err error) {
			if err != nil {
				log.Warn().Err(err).Str("url", nc.ConnectedUrl()).Msg("nats: disconnected")
			}
		}),
		nats.ReconnectHandler(func(nc *nats.Conn) {
			log.Info().Str("url", nc.ConnectedUrl()).Msg("nats: reconnected")
		}),
		nats.ClosedHandler(func(nc *nats.Conn) {
			log.Info().Msg("nats: connection closed")
		}),
		nats.ErrorHandler(func(nc *nats.Conn, sub *nats.Subscription, err error) {
			subj := ""
			if sub != nil {
				subj = sub.Subject
			}
			log.Error().Err(err).Str("subject", subj).Msg("nats: async error")
		}),
	}

	for attempt := 1; attempt <= natsStartupRetries; attempt++ {
		// Respect context cancellation during startup retries.
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("nats: context cancelled during startup: %w", ctx.Err())
		default:
		}

		conn, lastErr = nats.Connect(url, opts...)
		if lastErr == nil {
			break
		}
		log.Warn().
			Err(lastErr).
			Int("attempt", attempt).
			Str("url", url).
			Msg("nats: connection attempt failed, retrying")
		time.Sleep(natsRetryDelay)
	}

	if conn == nil {
		return nil, fmt.Errorf("nats: could not connect after %d attempts: %w", natsStartupRetries, lastErr)
	}

	log.Info().
		Str("server_id", conn.ConnectedServerId()).
		Str("server_url", conn.ConnectedUrl()).
		Msg("nats: connected")

	return &NATSConn{conn: conn, log: log}, nil
}

// Conn returns the underlying *nats.Conn for direct use by subscribers
// and publishers.
func (n *NATSConn) Conn() *nats.Conn { return n.conn }

// Drain gracefully flushes in-flight messages and closes the connection.
// It should be called during ordered shutdown before Close().
// Drain blocks until all pending messages are delivered or the default
// NATS drain timeout (30 s) elapses.
func (n *NATSConn) Drain() error {
	if n.conn.IsClosed() || n.conn.IsDraining() {
		return nil
	}
	n.log.Info().Msg("nats: draining")
	if err := n.conn.Drain(); err != nil {
		return fmt.Errorf("nats: drain: %w", err)
	}
	return nil
}

// Close forcibly closes the connection. Prefer Drain() during normal shutdown.
func (n *NATSConn) Close() {
	if !n.conn.IsClosed() {
		n.conn.Close()
	}
	n.log.Info().Msg("nats: connection closed")
}

// Status returns a one-line string suitable for the health endpoint.
func (n *NATSConn) Status() string {
	switch n.conn.Status() {
	case nats.CONNECTED:
		return "connected"
	case nats.RECONNECTING:
		return "reconnecting"
	case nats.CONNECTING:
		return "connecting"
	case nats.DRAINING_SUBS, nats.DRAINING_PUBS:
		return "draining"
	case nats.CLOSED:
		return "closed"
	default:
		return "unknown"
	}
}

// Ping sends a PING to the server and waits for a PONG.
func (n *NATSConn) Ping() error {
	return n.conn.FlushTimeout(5 * time.Second)
}
