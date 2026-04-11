package grpc

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/metadata"

	pb "github.com/flexgate/proxy/internal/intelligence/grpc/pb/intelligence/v1"
)

// ─────────────────────────────────────────────────────────────────────────────
// Pool configuration
// ─────────────────────────────────────────────────────────────────────────────

// PoolConfig tunes the connection pool behaviour.
type PoolConfig struct {
	// Target is the gRPC server address, e.g. "intelligence.svc.cluster.local:9000".
	Target string
	// Size is the number of persistent connections maintained. Default: 4.
	Size int
	// LicenceKey is sent as gRPC metadata "x-licence-key" on every call.
	LicenceKey string
	// DialTimeout limits how long a single dial attempt may take.
	DialTimeout time.Duration
	// KeepaliveInterval is the PING interval for idle connections.
	KeepaliveInterval time.Duration
	// KeepaliveTimeout is how long to wait for a PING ack before marking the
	// connection dead.
	KeepaliveTimeout time.Duration
}

func (c *PoolConfig) setDefaults() {
	if c.Size <= 0 {
		c.Size = 4
	}
	if c.DialTimeout <= 0 {
		c.DialTimeout = 3 * time.Second
	}
	if c.KeepaliveInterval <= 0 {
		c.KeepaliveInterval = 30 * time.Second
	}
	if c.KeepaliveTimeout <= 0 {
		c.KeepaliveTimeout = 5 * time.Second
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// connSlot — one physical gRPC connection with a derived service client
// ─────────────────────────────────────────────────────────────────────────────

type connSlot struct {
	conn   *grpc.ClientConn
	client pb.IntelligenceServiceClient
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool
// ─────────────────────────────────────────────────────────────────────────────

// Pool holds a fixed-size set of gRPC connections to the intelligence service.
// Connections are created eagerly on New() and replaced transparently when
// they enter a terminal state (Shutdown or TransientFailure).
//
// Pick() uses a lock-free round-robin counter — O(1), no channel overhead.
type Pool struct {
	cfg   PoolConfig
	slots []*connSlot
	mu    sync.RWMutex // protects slots during replacement
	robin atomic.Uint64
}

// NewPool dials cfg.Size connections to cfg.Target and returns a ready Pool.
func NewPool(cfg PoolConfig) (*Pool, error) {
	cfg.setDefaults()

	p := &Pool{cfg: cfg, slots: make([]*connSlot, cfg.Size)}
	for i := range p.slots {
		slot, err := p.dial()
		if err != nil {
			// Close whatever was opened before returning.
			for j := 0; j < i; j++ {
				_ = p.slots[j].conn.Close()
			}
			return nil, fmt.Errorf("grpc pool: dial slot %d: %w", i, err)
		}
		p.slots[i] = slot
	}
	return p, nil
}

// Pick returns a service client from the pool using lock-free round-robin.
// If the selected connection is in a terminal state it is healed before use.
func (p *Pool) Pick() pb.IntelligenceServiceClient {
	idx := int(p.robin.Add(1)-1) % len(p.slots)

	p.mu.RLock()
	slot := p.slots[idx]
	state := slot.conn.GetState()
	p.mu.RUnlock()

	if state == connectivity.Shutdown || state == connectivity.TransientFailure {
		p.heal(idx)
		p.mu.RLock()
		slot = p.slots[idx]
		p.mu.RUnlock()
	}
	return slot.client
}

// Close closes all connections in the pool.
func (p *Pool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, s := range p.slots {
		_ = s.conn.Close()
	}
}

// heal replaces the connection at idx with a fresh one.
func (p *Pool) heal(idx int) {
	slot, err := p.dial()
	if err != nil {
		// Heal failed — keep the broken slot; the caller will get a failure
		// which triggers the fail-open circuit in GRPCClient.
		return
	}
	p.mu.Lock()
	old := p.slots[idx]
	p.slots[idx] = slot
	p.mu.Unlock()
	_ = old.conn.Close()
}

// dial creates a single new connection + service client.
func (p *Pool) dial() (*connSlot, error) {
	dialCtx, cancel := context.WithTimeout(context.Background(), p.cfg.DialTimeout)
	defer cancel()

	conn, err := grpc.DialContext( //nolint:staticcheck // DialContext is idiomatic pre-1.65
		dialCtx,
		p.cfg.Target,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithKeepaliveParams(keepalive.ClientParameters{
			Time:                p.cfg.KeepaliveInterval,
			Timeout:             p.cfg.KeepaliveTimeout,
			PermitWithoutStream: true,
		}),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(4*1024*1024), // 4 MiB
			grpc.MaxCallSendMsgSize(4*1024*1024),
		),
	)
	if err != nil {
		return nil, err
	}
	return &connSlot{
		conn:   conn,
		client: pb.NewIntelligenceServiceClient(conn),
	}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// outgoingCtx — attach licence key as gRPC metadata
// ─────────────────────────────────────────────────────────────────────────────

// outgoingCtx returns a child context with the licence key injected as
// outgoing gRPC metadata so every RPC carries it automatically.
func outgoingCtx(ctx context.Context, licenceKey string) context.Context {
	return metadata.NewOutgoingContext(ctx, metadata.Pairs("x-licence-key", licenceKey))
}
