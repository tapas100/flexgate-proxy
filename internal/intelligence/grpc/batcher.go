package grpc

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/flexgate/proxy/internal/intelligence/core"
	pb "github.com/flexgate/proxy/internal/intelligence/grpc/pb/intelligence/v1"
)

// ─────────────────────────────────────────────────────────────────────────────
// BatcherConfig
// ─────────────────────────────────────────────────────────────────────────────

// BatcherConfig controls the batching behaviour of the event batcher.
type BatcherConfig struct {
	// MaxBatchSize is the maximum number of events per gRPC stream.
	// When the buffer reaches this size the batch is flushed immediately.
	// Default: 100.
	MaxBatchSize int
	// FlushInterval is the maximum time an event may wait in the buffer before
	// being flushed, even if MaxBatchSize has not been reached.
	// Default: 100 ms.
	FlushInterval time.Duration
	// WorkerCount is the number of concurrent flush goroutines.
	// Default: 2.
	WorkerCount int
}

func (c *BatcherConfig) setDefaults() {
	if c.MaxBatchSize <= 0 {
		c.MaxBatchSize = 100
	}
	if c.FlushInterval <= 0 {
		c.FlushInterval = 100 * time.Millisecond
	}
	if c.WorkerCount <= 0 {
		c.WorkerCount = 2
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Batcher
// ─────────────────────────────────────────────────────────────────────────────

// Batcher accumulates RequestEvents in a lock-protected buffer and flushes them
// to the intelligence service via a single client-streaming RPC.
//
// Properties:
//   - RecordRequest never blocks the caller — events are appended to a channel.
//   - Events are dropped silently when the channel is full (back-pressure).
//   - Flush happens either when MaxBatchSize is reached or FlushInterval fires,
//     whichever comes first.
//   - Multiple worker goroutines drain the buffer independently.
type Batcher struct {
	cfg        BatcherConfig
	pool       *Pool
	licenceKey string
	log        zerolog.Logger

	in   chan core.RequestEvent
	once sync.Once
	done chan struct{}
}

// NewBatcher creates and starts a Batcher.
func NewBatcher(pool *Pool, licenceKey string, cfg BatcherConfig, log zerolog.Logger) *Batcher {
	cfg.setDefaults()

	b := &Batcher{
		cfg:        cfg,
		pool:       pool,
		licenceKey: licenceKey,
		log:        log.With().Str("component", "grpc-batcher").Logger(),
		// Buffer up to 10× MaxBatchSize events before dropping.
		in:   make(chan core.RequestEvent, cfg.MaxBatchSize*10),
		done: make(chan struct{}),
	}
	b.start()
	return b
}

// Enqueue adds an event to the batch buffer. Non-blocking: drops the event
// if the buffer is full (back-pressure protection).
func (b *Batcher) Enqueue(ev core.RequestEvent) {
	select {
	case b.in <- ev:
	default:
		b.log.Warn().Msg("batcher: buffer full, dropping event")
	}
}

// Close drains in-flight events and stops all workers.
func (b *Batcher) Close() {
	b.once.Do(func() {
		close(b.done)
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

func (b *Batcher) start() {
	for i := 0; i < b.cfg.WorkerCount; i++ {
		go b.worker()
	}
}

// worker drains b.in into fixed-size batches and flushes each batch over a
// single client-streaming gRPC call.
func (b *Batcher) worker() {
	ticker := time.NewTicker(b.cfg.FlushInterval)
	defer ticker.Stop()

	batch := make([]core.RequestEvent, 0, b.cfg.MaxBatchSize)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		b.flush(batch)
		batch = batch[:0]
	}

	for {
		select {
		case ev, ok := <-b.in:
			if !ok {
				flush()
				return
			}
			batch = append(batch, ev)
			if len(batch) >= b.cfg.MaxBatchSize {
				flush()
			}

		case <-ticker.C:
			flush()

		case <-b.done:
			// Drain remaining events before exiting.
			for {
				select {
				case ev := <-b.in:
					batch = append(batch, ev)
				default:
					flush()
					return
				}
			}
		}
	}
}

// flush opens a client-streaming RPC, sends all events in batch, and closes
// the stream. Errors are logged at WARN and otherwise ignored (fail-open).
func (b *Batcher) flush(batch []core.RequestEvent) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ctx = outgoingCtx(ctx, b.licenceKey)

	stream, err := b.pool.Pick().RecordEvents(ctx)
	if err != nil {
		b.log.Warn().Err(err).Int("count", len(batch)).Msg("batcher: open stream failed")
		return
	}

	sent := 0
	for _, ev := range batch {
		if err := stream.Send(toProtoEvent(ev)); err != nil {
			b.log.Warn().Err(err).Msg("batcher: stream send failed")
			break
		}
		sent++
	}

	ack, err := stream.CloseAndRecv()
	if err != nil {
		b.log.Warn().Err(err).Int("sent", sent).Msg("batcher: stream close failed")
		return
	}
	b.log.Debug().
		Int64("acked", ack.Count).
		Int("sent", sent).
		Msg("batcher: flush complete")
}

// toProtoEvent converts the domain type to its protobuf representation.
func toProtoEvent(ev core.RequestEvent) *pb.RequestEvent {
	return &pb.RequestEvent{
		RequestId:       ev.RequestID,
		Method:          ev.Method,
		Path:            ev.Path,
		Status:          int32(ev.Status),
		LatencyMs:       ev.LatencyMs,
		ClientIp:        ev.ClientIP,
		Upstream:        ev.Upstream,
		RouteId:         ev.RouteID,
		HaproxyFrontend: ev.HAProxyFrontend,
		HaproxyBackend:  ev.HAProxyBackend,
		Timestamp:       timestamppb.New(ev.Timestamp),
		BytesOut:        ev.BytesOut,
	}
}
