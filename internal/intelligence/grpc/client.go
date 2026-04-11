package grpc

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/flexgate/proxy/internal/intelligence/core"
	pb "github.com/flexgate/proxy/internal/intelligence/grpc/pb/intelligence/v1"
)

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// syncTimeout is the hard ceiling for RateLimit and Auth RPCs.
// Intelligence can never slow the proxy hot path.
const syncTimeout = 5 * time.Millisecond

// consecutiveFailureThreshold is the number of back-to-back gRPC errors
// before the circuit opens.
const consecutiveFailureThreshold = 10

// ─────────────────────────────────────────────────────────────────────────────
// GRPCClient
// ─────────────────────────────────────────────────────────────────────────────

// GRPCClient implements intelligence.Client using gRPC transport.
//
// It wraps a Pool for connection management and a Batcher for fire-and-forget
// event streaming. All synchronous RPCs carry a hard 5 ms timeout and fail
// open on any error. The embedded circuit breaker prevents hammering a dead
// service.
type GRPCClient struct {
	pool        *Pool
	batcher     *Batcher
	licenceKey  string
	log         zerolog.Logger
	failures    atomic.Int64
}

// ClientConfig is the full configuration surface for GRPCClient.
type ClientConfig struct {
	Pool    PoolConfig
	Batcher BatcherConfig
}

// NewGRPCClient constructs a GRPCClient with a connection pool and event
// batcher. Returns an error only if the initial connections cannot be dialled.
func NewGRPCClient(cfg ClientConfig, log zerolog.Logger) (*GRPCClient, error) {
	pool, err := NewPool(cfg.Pool)
	if err != nil {
		return nil, err
	}

	batcher := NewBatcher(pool, cfg.Pool.LicenceKey, cfg.Batcher, log)

	return &GRPCClient{
		pool:       pool,
		batcher:    batcher,
		licenceKey: cfg.Pool.LicenceKey,
		log:        log.With().Str("component", "grpc-client").Logger(),
	}, nil
}

// Close shuts down the batcher (flushing remaining events) and the pool.
func (c *GRPCClient) Close() {
	c.batcher.Close()
	c.pool.Close()
}

// ─────────────────────────────────────────────────────────────────────────────
// intelligence.Client implementation
// ─────────────────────────────────────────────────────────────────────────────

// RateLimit calls the gRPC RateLimit RPC with a 5 ms timeout.
// Returns {Allowed: true} on circuit-open, timeout, or any RPC error.
func (c *GRPCClient) RateLimit(ctx context.Context, req core.RateLimitRequest) core.RateLimitResult {
	allow := core.RateLimitResult{Allowed: true}
	if c.circuitOpen() {
		return allow
	}

	ctx, cancel := context.WithTimeout(outgoingCtx(ctx, c.licenceKey), syncTimeout)
	defer cancel()

	resp, err := c.pool.Pick().RateLimit(ctx, &pb.RateLimitRequest{
		ClientIp: req.ClientIP,
		RouteId:  req.RouteID,
		Method:   req.Method,
		Path:     req.Path,
	})
	if err != nil {
		c.recordFailure("rate_limit", err)
		return allow
	}
	c.recordSuccess()
	return core.RateLimitResult{
		Allowed:      resp.Allowed,
		Remaining:    int(resp.Remaining),
		RetryAfterMs: int(resp.RetryAfterMs),
	}
}

// Auth calls the gRPC Auth RPC with a 5 ms timeout.
// Returns {Valid: true} on circuit-open, timeout, or any RPC error.
func (c *GRPCClient) Auth(ctx context.Context, req core.AuthRequest) core.AuthResult {
	allow := core.AuthResult{Valid: true}
	if c.circuitOpen() {
		return allow
	}

	ctx, cancel := context.WithTimeout(outgoingCtx(ctx, c.licenceKey), syncTimeout)
	defer cancel()

	resp, err := c.pool.Pick().Auth(ctx, &pb.AuthRequest{
		Token:    req.Token,
		RouteId:  req.RouteID,
		ClientIp: req.ClientIP,
	})
	if err != nil {
		c.recordFailure("auth", err)
		return allow
	}
	c.recordSuccess()
	return core.AuthResult{
		Valid:   resp.Valid,
		Subject: resp.Subject,
	}
}

// RecordRequest enqueues the event for asynchronous streaming. Never blocks.
func (c *GRPCClient) RecordRequest(ev core.RequestEvent) {
	if c.circuitOpen() {
		return
	}
	c.batcher.Enqueue(ev)
}

// GetLogs calls the server-streaming GetLogs RPC and collects all pages.
// Used by the admin API only — not on the hot path.
func (c *GRPCClient) GetLogs(ctx context.Context, req core.LogsRequest) core.LogsResult {
	if c.circuitOpen() {
		c.log.Warn().Msg("grpc: circuit open, skipping GetLogs")
		return core.LogsResult{}
	}

	ctx = outgoingCtx(ctx, c.licenceKey)

	var since *timestamppb.Timestamp
	if !req.Since.IsZero() {
		since = timestamppb.New(req.Since)
	}

	stream, err := c.pool.Pick().GetLogs(ctx, &pb.LogsRequest{
		RouteId:  req.RouteID,
		ClientIp: req.ClientIP,
		Since:    since,
		Limit:    int32(req.Limit),
	})
	if err != nil {
		c.recordFailure("get_logs", err)
		return core.LogsResult{}
	}

	var entries []core.LogEntry
	for {
		entry, err := stream.Recv()
		if err != nil {
			// io.EOF means the stream ended normally.
			if isEOF(err) {
				break
			}
			c.recordFailure("get_logs_recv", err)
			return core.LogsResult{Entries: entries}
		}
		entries = append(entries, fromProtoLogEntry(entry))
	}
	c.recordSuccess()
	return core.LogsResult{Entries: entries}
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit breaker
// ─────────────────────────────────────────────────────────────────────────────

func (c *GRPCClient) circuitOpen() bool {
	return c.failures.Load() >= consecutiveFailureThreshold
}

func (c *GRPCClient) recordFailure(op string, err error) {
	n := c.failures.Add(1)
	c.log.Warn().
		Err(err).
		Str("op", op).
		Int64("consecutive_failures", n).
		Msg("grpc: request failed (fail-open)")
	if n == consecutiveFailureThreshold {
		c.log.Warn().
			Int64("threshold", consecutiveFailureThreshold).
			Msg("grpc: circuit opened — sync checks will short-circuit until service recovers")
	}
}

func (c *GRPCClient) recordSuccess() {
	c.failures.Store(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// isEOF returns true for the sentinel error that marks the end of a gRPC stream.
func isEOF(err error) bool {
	if err == nil {
		return false
	}
	// grpc streams return io.EOF on normal termination.
	st, ok := status.FromError(err)
	if ok && st.Code() == codes.OK {
		return true
	}
	return err.Error() == "EOF"
}

// fromProtoLogEntry converts a protobuf LogEntry to the domain type.
func fromProtoLogEntry(e *pb.LogEntry) core.LogEntry {
	entry := core.LogEntry{
		RequestID: e.RequestId,
		Level:     e.Level,
		Message:   e.Message,
		Fields:    e.Fields,
	}
	if e.Timestamp != nil {
		entry.Timestamp = e.Timestamp.AsTime()
	}
	return entry
}
