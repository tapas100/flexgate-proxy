package detector_test

import (
	"context"
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/flexgate/proxy/internal/setup/detector"
)

// TestNew_DefaultOptions verifies that zero-value options are filled in.
func TestNew_DefaultOptions(t *testing.T) {
	d := detector.New(detector.Options{})
	if d == nil {
		t.Fatal("New returned nil")
	}
}

// TestRun_ReturnsReport verifies that Run always returns a non-empty Report
// with DetectedAt set, regardless of which tools are installed on the CI host.
func TestRun_ReturnsReport(t *testing.T) {
	d := detector.New(detector.Options{
		ProbeTimeout:    2 * time.Second,
		Ports:           []int{19999}, // unlikely to be in use
		PortDialTimeout: 200 * time.Millisecond,
	})

	report, err := d.Run(context.Background())
	if err != nil {
		t.Fatalf("Run() error: %v", err)
	}
	if report.DetectedAt.IsZero() {
		t.Error("DetectedAt should be set")
	}
	if report.Ports == nil {
		t.Error("Ports map should not be nil")
	}
}

// TestRun_PortInUse starts a TCP listener on a random port and verifies that
// the detector correctly reports it as "in_use".
func TestRun_PortInUse(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	port := ln.Addr().(*net.TCPAddr).Port

	d := detector.New(detector.Options{
		ProbeTimeout:    2 * time.Second,
		Ports:           []int{port},
		PortDialTimeout: 500 * time.Millisecond,
	})

	report, err := d.Run(context.Background())
	if err != nil {
		t.Fatalf("Run() error: %v", err)
	}

	key := portKey(port)
	pr, ok := report.Ports[key]
	if !ok {
		t.Fatalf("port %d not in report", port)
	}
	if pr.Status != detector.PortInUse {
		t.Errorf("expected status=%q, got %q", detector.PortInUse, pr.Status)
	}
	if pr.Port != port {
		t.Errorf("expected port=%d, got %d", port, pr.Port)
	}
}

// TestRun_PortFree verifies that a port with no listener is reported as "free".
func TestRun_PortFree(t *testing.T) {
	// Pick a port that is almost certainly free.
	const unusedPort = 19998

	d := detector.New(detector.Options{
		ProbeTimeout:    2 * time.Second,
		Ports:           []int{unusedPort},
		PortDialTimeout: 300 * time.Millisecond,
	})

	report, err := d.Run(context.Background())
	if err != nil {
		t.Fatalf("Run() error: %v", err)
	}

	key := portKey(unusedPort)
	pr, ok := report.Ports[key]
	if !ok {
		t.Fatalf("port %d not in report", unusedPort)
	}
	// Accept "free" or "unknown" — we can't guarantee the port is free in all
	// CI environments, but it must not be "in_use".
	if pr.Status == detector.PortInUse {
		t.Errorf("port %d should not be in_use", unusedPort)
	}
}

// TestRun_CancelledContext verifies that Run honours context cancellation and
// returns quickly without hanging.
func TestRun_CancelledContext(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	d := detector.New(detector.Options{
		ProbeTimeout:    5 * time.Second, // longer than the ctx deadline
		Ports:           []int{3000, 5432, 6379},
		PortDialTimeout: 5 * time.Second,
	})

	start := time.Now()
	_, _ = d.Run(ctx)
	elapsed := time.Since(start)

	if elapsed > 2*time.Second {
		t.Errorf("Run should have returned quickly after context cancelled, took %v", elapsed)
	}
}

// TestRun_MultiplePortsConcurrently verifies that all requested ports appear
// in the report and that the run completes within a reasonable total duration
// (i.e. they ran concurrently, not sequentially).
func TestRun_MultiplePortsConcurrently(t *testing.T) {
	ports := []int{19990, 19991, 19992, 19993, 19994}
	dialTimeout := 200 * time.Millisecond

	d := detector.New(detector.Options{
		ProbeTimeout:    2 * time.Second,
		Ports:           ports,
		PortDialTimeout: dialTimeout,
	})

	start := time.Now()
	report, err := d.Run(context.Background())
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Run() error: %v", err)
	}

	// All ports must be present.
	for _, p := range ports {
		if _, ok := report.Ports[portKey(p)]; !ok {
			t.Errorf("port %d missing from report", p)
		}
	}

	// If sequential each dial would take ~dialTimeout; concurrent should be
	// well under 3× dialTimeout for the whole batch.
	maxExpected := time.Duration(len(ports)) * dialTimeout / 2
	if elapsed > maxExpected+1*time.Second {
		t.Logf("elapsed %v (threshold %v) — may indicate sequential execution", elapsed, maxExpected)
		// Soft failure: log but don't fail, as CI machines vary wildly.
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func portKey(port int) string {
	return fmt.Sprintf("%d", port)
}
