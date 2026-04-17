// Package handlers — setup execution endpoint.
//
//	POST /api/setup/run           → start a setup run (returns 202 Accepted)
//	GET  /api/setup/run/stream    → SSE stream of execution Events
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/setup"
	"github.com/flexgate/proxy/internal/setup/runner"
)

// ── SetupRunHandler ───────────────────────────────────────────────────────────

// SetupRunHandler manages POST /api/setup/run and GET /api/setup/run/stream.
//
// Race-condition fix (Stage 7 / streaming fix):
//
// The browser opens the SSE stream *after* POST /api/setup/run returns 202.
// Without a replay buffer every event emitted in that gap is lost and the
// progress bar stays at 0%.
//
// Solution: all broadcast events are appended to `replay`.  When a new SSE
// client connects it first drains the replay buffer (under the write lock so
// no new events are missed), then switches to the live channel.
type SetupRunHandler struct {
	log    zerolog.Logger
	runner *runner.Runner

	replayMu sync.Mutex
	replay   []runner.Event
	done     bool

	subsMu sync.Mutex
	subs   map[chan runner.Event]struct{}
}

// NewSetupRunHandler creates a handler backed by the given store.
func NewSetupRunHandler(store *setup.Store, log zerolog.Logger) *SetupRunHandler {
	return &SetupRunHandler{
		log:    log,
		runner: runner.New(store, log),
		subs:   make(map[chan runner.Event]struct{}),
	}
}

// broadcast appends e to the replay buffer then fans out to live subscribers.
// Two separate locks — never held simultaneously — prevent deadlock.
func (h *SetupRunHandler) broadcast(e runner.Event) {
	h.replayMu.Lock()
	h.replay = append(h.replay, e)
	if e.Type == runner.EventDone || e.Fatal {
		h.done = true
	}
	h.replayMu.Unlock()

	h.subsMu.Lock()
	for ch := range h.subs {
		select {
		case ch <- e:
		default:
		}
	}
	h.subsMu.Unlock()
}

// subscribeWithReplay snapshots the replay buffer and registers a live channel.
// The two locks are acquired sequentially (never together).
func (h *SetupRunHandler) subscribeWithReplay() ([]runner.Event, chan runner.Event, bool) {
	h.replayMu.Lock()
	snap := make([]runner.Event, len(h.replay))
	copy(snap, h.replay)
	alreadyDone := h.done
	h.replayMu.Unlock()

	ch := make(chan runner.Event, 64)
	if !alreadyDone {
		h.subsMu.Lock()
		h.subs[ch] = struct{}{}
		h.subsMu.Unlock()
	}
	return snap, ch, alreadyDone
}

// unsubscribe removes a live subscriber.
func (h *SetupRunHandler) unsubscribe(ch chan runner.Event) {
	h.subsMu.Lock()
	delete(h.subs, ch)
	h.subsMu.Unlock()
	for len(ch) > 0 {
		<-ch
	}
}

// ── POST /api/setup/run ───────────────────────────────────────────────────────

type runRequest struct {
	DryRun bool `json:"dryRun,omitempty"`
}

// Run handles POST /api/setup/run.
func (h *SetupRunHandler) Run(w http.ResponseWriter, r *http.Request) {
	if h.runner.IsRunning() {
		Error(w, http.StatusConflict, "setup run already in progress")
		return
	}

	var req runRequest
	if r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	// Reset replay buffer for this new run.
	h.replayMu.Lock()
	h.replay = nil
	h.done = false
	h.replayMu.Unlock()

	events := h.runner.Run(context.Background())

	// Broadcast goroutine — no mutex held across loop iterations.
	go func() {
		for e := range events {
			h.broadcast(e)
			if e.Type == runner.EventDone || e.Fatal {
				break
			}
		}
		// drain
		for range events {
		}
	}()

	h.log.Info().Bool("dryRun", req.DryRun).Msg("setup/run: execution started")
	JSON(w, http.StatusAccepted, map[string]interface{}{
		"started": true,
		"dryRun":  req.DryRun,
	})
}

// ── GET /api/setup/run/stream ─────────────────────────────────────────────────

// Stream handles GET /api/setup/run/stream as a Server-Sent Events endpoint.
//
// On connect it replays all events emitted so far, then streams live events.
// This eliminates the race between POST /run returning 202 and the browser
// opening the EventSource connection.
func (h *SetupRunHandler) Stream(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	origin := r.Header.Get("Origin")
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		Error(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	ctx := r.Context()

	// Heartbeat so the browser knows the connection is alive immediately.
	writeSSE(w, flusher, "connected", runner.Event{
		Type:      "connected",
		Message:   "stream connected",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})

	// Get replay + register for live events atomically.
	past, ch, alreadyDone := h.subscribeWithReplay()
	defer h.unsubscribe(ch)

	// Replay everything the client missed.
	for _, e := range past {
		writeSSE(w, flusher, string(e.Type), e)
		if e.Type == runner.EventDone || e.Fatal {
			return // run finished before we connected — nothing more to stream
		}
	}

	// If the run was already done by the time we subscribed, we're finished.
	if alreadyDone {
		return
	}

	// Stream live events.
	for {
		select {
		case <-ctx.Done():
			return
		case e, open := <-ch:
			if !open {
				return
			}
			writeSSE(w, flusher, string(e.Type), e)
			if e.Type == runner.EventDone || e.Fatal {
				return
			}
		}
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func writeSSE(w http.ResponseWriter, f http.Flusher, event string, v interface{}) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
	f.Flush()
}
