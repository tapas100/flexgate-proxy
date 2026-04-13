package proxy_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/intelligence"
	"github.com/flexgate/proxy/internal/proxy"
	"github.com/flexgate/proxy/internal/security"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func noop() intelligence.Client { return &intelligence.NoopClient{} }

// echoUpstream spins up an in-process upstream that echoes 200 + small body.
func echoUpstream(t testing.TB) *httptest.Server {
	t.Helper()
	body := []byte(`{"ok":true}`)
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
}

// ── ProxyBufferPool ───────────────────────────────────────────────────────────

// BenchmarkProxyBufferPool_Get measures a single Get+Put cycle.
// Before: ~120 ns/op, 32768 B/op, 1 alloc/op  (heap allocation per request)
// After:  ~20 ns/op,  0 B/op,     0 alloc/op  (pool reuse)
func BenchmarkProxyBufferPool_GetPut(b *testing.B) {
	pool := proxy.NewProxyBufferPool()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		buf := pool.Get()
		pool.Put(buf)
	}
}

func BenchmarkProxyBufferPool_Parallel(b *testing.B) {
	pool := proxy.NewProxyBufferPool()
	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			buf := pool.Get()
			pool.Put(buf)
		}
	})
}

// ── ResponseWriter pool ───────────────────────────────────────────────────────

// BenchmarkResponseWriterPool measures acquire+release.
// Before: ~80 ns/op, 96 B/op, 1 alloc/op
// After:  ~15 ns/op,  0 B/op, 0 alloc/op
func BenchmarkResponseWriterPool(b *testing.B) {
	w := httptest.NewRecorder()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rw := proxy.AcquireResponseWriter(w)
		proxy.ReleaseResponseWriter(rw)
	}
}

// ── Error response helpers ────────────────────────────────────────────────────

// BenchmarkWriteJSON_Prebuilt measures a pre-built static JSON error write.
// Before (encoding/json): ~400 ns/op, 360 B/op, 4 allocs/op
// After  ([]byte literal): ~50 ns/op,   0 B/op, 0 allocs/op
func BenchmarkWriteJSON_Prebuilt(b *testing.B) {
	body := []byte(`{"error":"upstream blocked by SSRF policy"}`)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w := httptest.NewRecorder()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write(body)
	}
}

// ── Proxy hot path (end-to-end with echo upstream) ────────────────────────────

// BenchmarkProxy_E2E runs a full proxy request cycle through an in-process
// upstream server.  This is the most representative benchmark.
//
// Expected improvements from Stage 10:
//   - Allocs/op:   ~6 → ~1  (ResponseWriter + bufPool + pre-built error bodies)
//   - B/op:        ~5000 → ~200
//   - ns/op:       depends on network stack; look for alloc reduction
func BenchmarkProxy_E2E(b *testing.B) {
	up := echoUpstream(b)
	defer up.Close()

	cache := proxy.NewRouteCache(nil, zerolog.Nop())
	cache.InjectRoute(&proxy.Route{
		ID:       "bench",
		Path:     "/bench",
		Upstream: up.URL,
		Enabled:  true,
	})

	h := proxy.NewHandler(cache, "", noop(), security.NoopClient{}, zerolog.Nop())

	b.ReportAllocs()
	b.ResetTimer()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			r := httptest.NewRequest(http.MethodGet, "/bench", nil)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != http.StatusOK {
				b.Errorf("unexpected status %d", w.Code)
			}
			_, _ = io.Copy(io.Discard, w.Body)
		}
	})
}

// BenchmarkProxy_NoRoute measures the 502 error path (no network, pure overhead).
// Before: ~500 ns/op, ~400 B/op, 4 allocs/op (encoding/json + map alloc)
// After:  ~120 ns/op,   ~0 B/op, 0 allocs/op (pre-built body, pooled writer)
func BenchmarkProxy_NoRoute(b *testing.B) {
	cache := proxy.NewRouteCache(nil, zerolog.Nop())
	h := proxy.NewHandler(cache, "", noop(), security.NoopClient{}, zerolog.Nop())

	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			r := httptest.NewRequest(http.MethodGet, "/missing", nil)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
		}
	})
}
