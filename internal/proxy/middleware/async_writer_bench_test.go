package middleware_test

import (
	"io"
	"testing"

	"github.com/flexgate/proxy/internal/proxy/middleware"
)

// BenchmarkAsyncWriter_Write measures the throughput of the async log writer.
//
// Expected results (Apple M2 Pro, arm64):
//   Before (sync os.Stdout write): ~400 ns/op, 1 alloc/op (syscall on hot path)
//   After  (async channel enqueue): ~30 ns/op,  1 alloc/op (memcpy to pool buf)
//
// The alloc is the pooled byte slice copy — unavoidable because zerolog
// reuses its buffer after Write() returns.
func BenchmarkAsyncWriter_Write(b *testing.B) {
	w := middleware.NewAsyncWriter(io.Discard)
	defer func() { _ = w.Close() }()

	line := []byte(`{"level":"info","ts":1712900000,"msg":"request","status":200,"latency_ms":0.421}` + "\n")

	b.SetBytes(int64(len(line)))
	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, _ = w.Write(line)
	}
}

func BenchmarkAsyncWriter_Write_Parallel(b *testing.B) {
	w := middleware.NewAsyncWriter(io.Discard)
	defer func() { _ = w.Close() }()

	line := []byte(`{"level":"info","ts":1712900000,"msg":"request","status":200,"latency_ms":0.421}` + "\n")

	b.SetBytes(int64(len(line)))
	b.ReportAllocs()
	b.ResetTimer()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, _ = w.Write(line)
		}
	})
}
