package benchmark

import (
	"context"
	"sync"
)

// ── SSE Hub ───────────────────────────────────────────────────────────────────
//
// Hub manages a set of Server-Sent Events subscribers and broadcasts
// DataPoint events to all of them in real time.
//
// Stage 3 (the SSE streaming endpoint) will call Hub.Subscribe /
// Hub.Unsubscribe per connected browser tab, and the ingest handler
// (handler.go) will call Hub.Broadcast after every Append().

// BroadcastMsg is what the hub sends to each subscriber.
type BroadcastMsg struct {
	// Type differentiates the event kind so the frontend can handle each
	// appropriately without parsing the Data envelope.
	//
	//   "metric"    – live DataPoint from a running scenario
	//   "progress"  – scenario status change (running / passed / failed)
	//   "summary"   – scenario finished with final aggregate
	//   "done"      – entire benchmark run finished
	//   "reset"     – store was wiped; frontend should clear its charts
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// Subscriber is a channel that receives broadcast messages.
// Buffered to 64 so a slow client doesn't block the broadcaster.
type Subscriber chan BroadcastMsg

// Hub is a goroutine-safe pub/sub hub.
type Hub struct {
	mu   sync.Mutex
	subs map[Subscriber]struct{}
}

// NewHub returns an initialised Hub.
func NewHub() *Hub {
	return &Hub{subs: make(map[Subscriber]struct{})}
}

// Subscribe registers a new subscriber and returns its channel.
// The caller must call Unsubscribe when the client disconnects.
func (h *Hub) Subscribe() Subscriber {
	ch := make(Subscriber, 64)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes and closes the subscriber's channel.
func (h *Hub) Unsubscribe(ch Subscriber) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
	close(ch)
}

// Broadcast sends msg to every subscriber.
// Drops the message for any subscriber whose buffer is full (non-blocking).
func (h *Hub) Broadcast(msg BroadcastMsg) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- msg:
		default:
			// Slow subscriber — drop rather than block
		}
	}
}

// BroadcastCtx is like Broadcast but respects a context deadline.
func (h *Hub) BroadcastCtx(ctx context.Context, msg BroadcastMsg) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case <-ctx.Done():
			return
		case ch <- msg:
		default:
		}
	}
}

// Len returns the number of active subscribers.
func (h *Hub) Len() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subs)
}

// GlobalHub is the process-level Hub instance wired into the admin router.
var GlobalHub = NewHub()
