// Package intelligence provides benchmark comparisons between the HTTP and
// gRPC intelligence client implementations.
//
// Run with:
//
//	go test -bench=. -benchmem -benchtime=5s ./benchmarks/intelligence/
//
// For CPU profiling:
//
//	go test -bench=. -benchmem -cpuprofile=cpu.prof ./benchmarks/intelligence/
//	go tool pprof cpu.prof
package intelligence

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	intellpkg "github.com/flexgate/proxy/internal/intelligence"
	igrpc "github.com/flexgate/proxy/internal/intelligence/grpc"
	pb "github.com/flexgate/proxy/internal/intelligence/grpc/pb/intelligence/v1"
)

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

var (
	devNull = zerolog.New(io.Discard)

	benchRLReq = intellpkg.RateLimitRequest{
		ClientIP: "10.0.0.1",
		RouteID:  "route-bench-001",
		Method:   "GET",
		Path:     "/api/v1/users",
	}
	benchAuthReq = intellpkg.AuthRequest{
		Token:    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.benchmark",
		RouteID:  "route-bench-001",
		ClientIP: "10.0.0.1",
	}
	benchEvent = intellpkg.RequestEvent{
		RequestID: "bench-req-001",
		Method:    "GET",
		Path:      "/api/v1/users",
		Status:    200,
		LatencyMs: 3,
		ClientIP:  "10.0.0.1",
		Upstream:  "http://backend:8080",
		RouteID:   "route-bench-001",
		Timestamp: time.Now(),
		BytesOut:  512,
	}
)

// ─────────────────────────────────────────────────────────────────────────────
// HTTP server stub
// ─────────────────────────────────────────────────────────────────────────────

// startHTTPStub starts a minimal HTTP server that responds instantly with
// pre-encoded JSON payloads. No real logic — pure transport overhead.
func startHTTPStub(tb testing.TB) *httptest.Server {
	tb.Helper()

	rlResp, _ := json.Marshal(map[string]any{"allowed": true, "remaining": 999})
	authResp, _ := json.Marshal(map[string]any{"valid": true, "subject": "bench-user"})

	mux := http.NewServeMux()
	mux.HandleFunc("/v1/rate-limit", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(rlResp)
	})
	mux.HandleFunc("/v1/auth", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(authResp)
	})
	mux.HandleFunc("/v1/record", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.WriteHeader(http.StatusNoContent)
	})

	srv := httptest.NewServer(mux)
	tb.Cleanup(srv.Close)
	return srv
}

// ─────────────────────────────────────────────────────────────────────────────
// gRPC server stub
// ─────────────────────────────────────────────────────────────────────────────

// benchServer is a zero-logic implementation of IntelligenceServiceServer.
type benchServer struct {
	pb.UnimplementedIntelligenceServiceServer
}

func (s *benchServer) RateLimit(_ context.Context, _ *pb.RateLimitRequest) (*pb.RateLimitResponse, error) {
	return &pb.RateLimitResponse{Allowed: true, Remaining: 999}, nil
}

func (s *benchServer) Auth(_ context.Context, _ *pb.AuthRequest) (*pb.AuthResponse, error) {
	return &pb.AuthResponse{Valid: true, Subject: "bench-user"}, nil
}

func (s *benchServer) RecordEvents(stream grpc.ClientStreamingServer[pb.RequestEvent, pb.RecordAck]) error {
	count := int64(0)
	for {
		_, err := stream.Recv()
		if err == io.EOF {
			return stream.SendAndClose(&pb.RecordAck{Count: count})
		}
		if err != nil {
			return err
		}
		count++
	}
}

func (s *benchServer) Check(_ context.Context, _ *pb.HealthRequest) (*pb.HealthResponse, error) {
	return &pb.HealthResponse{Status: pb.HealthResponse_SERVING}, nil
}

// startGRPCStub registers the stub server on a random loopback port and
// returns a connected GRPCClient.
func startGRPCStub(tb testing.TB) *igrpc.GRPCClient {
	tb.Helper()

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		tb.Fatalf("listen: %v", err)
	}

	srv := grpc.NewServer()
	pb.RegisterIntelligenceServiceServer(srv, &benchServer{})

	go func() { _ = srv.Serve(lis) }()
	tb.Cleanup(func() { srv.GracefulStop() })

	conn, err := grpc.NewClient(
		lis.Addr().String(),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		tb.Fatalf("dial: %v", err)
	}
	tb.Cleanup(func() { _ = conn.Close() })

	// Build a GRPCClient that uses the in-process connection.
	// We construct via the exported PoolConfig path so the pool dials our stub.
	c, err := igrpc.NewGRPCClient(igrpc.ClientConfig{
		Pool: igrpc.PoolConfig{
			Target: lis.Addr().String(),
			Size:   4,
		},
		Batcher: igrpc.BatcherConfig{
			MaxBatchSize:  100,
			FlushInterval: 100 * time.Millisecond,
			WorkerCount:   2,
		},
	}, devNull)
	if err != nil {
		tb.Fatalf("NewGRPCClient: %v", err)
	}
	tb.Cleanup(c.Close)
	return c
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks — RateLimit
// ─────────────────────────────────────────────────────────────────────────────

func BenchmarkHTTP_RateLimit(b *testing.B) {
	srv := startHTTPStub(b)
	// Use a longer-than-production timeout so the bench actually completes RPCs.
	client := newHTTPClientWithTimeout(srv.URL, "", 500*time.Millisecond)

	ctx := context.Background()
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = client.RateLimit(ctx, benchRLReq)
	}
}

func BenchmarkGRPC_RateLimit(b *testing.B) {
	client := startGRPCStub(b)

	ctx := context.Background()
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = client.RateLimit(ctx, benchRLReq)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks — Auth
// ─────────────────────────────────────────────────────────────────────────────

func BenchmarkHTTP_Auth(b *testing.B) {
	srv := startHTTPStub(b)
	client := newHTTPClientWithTimeout(srv.URL, "", 500*time.Millisecond)

	ctx := context.Background()
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = client.Auth(ctx, benchAuthReq)
	}
}

func BenchmarkGRPC_Auth(b *testing.B) {
	client := startGRPCStub(b)

	ctx := context.Background()
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = client.Auth(ctx, benchAuthReq)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks — RecordRequest (fire-and-forget)
// ─────────────────────────────────────────────────────────────────────────────

func BenchmarkHTTP_RecordRequest(b *testing.B) {
	srv := startHTTPStub(b)
	client := newHTTPClientWithTimeout(srv.URL, "", 500*time.Millisecond)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		client.RecordRequest(benchEvent)
	}
	// Give async goroutines time to drain.
	time.Sleep(200 * time.Millisecond)
}

func BenchmarkGRPC_RecordRequest_Batched(b *testing.B) {
	client := startGRPCStub(b)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		client.RecordRequest(benchEvent)
	}
	// Give the batcher time to flush.
	time.Sleep(200 * time.Millisecond)
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark — Noop (baseline)
// ─────────────────────────────────────────────────────────────────────────────

func BenchmarkNoop_RateLimit(b *testing.B) {
	client := &intellpkg.NoopClient{}
	ctx := context.Background()
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = client.RateLimit(ctx, benchRLReq)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Parallel benchmarks
// ─────────────────────────────────────────────────────────────────────────────

func BenchmarkHTTP_RateLimit_Parallel(b *testing.B) {
	srv := startHTTPStub(b)
	client := newHTTPClientWithTimeout(srv.URL, "", 500*time.Millisecond)

	ctx := context.Background()
	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_ = client.RateLimit(ctx, benchRLReq)
		}
	})
}

func BenchmarkGRPC_RateLimit_Parallel(b *testing.B) {
	client := startGRPCStub(b)

	ctx := context.Background()
	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_ = client.RateLimit(ctx, benchRLReq)
		}
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// newHTTPClientWithTimeout builds an HTTPClient with a custom timeout so
// benchmarks against a local stub don't trip the 5 ms production ceiling.
func newHTTPClientWithTimeout(baseURL, licenceKey string, timeout time.Duration) *intellpkg.HTTPClient {
	return intellpkg.NewHTTPClientWithTimeout(baseURL, licenceKey, timeout, devNull)
}
