package proxy

import (
	"net/http"
	"sync"

	"github.com/valyala/bytebufferpool"
)

// proxyBufferSize is the copy buffer size for httputil.ReverseProxy.
// 32 KiB matches the Linux socket buffer granularity and avoids extra
// syscalls on large response bodies.  It is intentionally not larger:
// bigger buffers increase GC pressure without improving throughput.
const proxyBufferSize = 32 * 1024

// ProxyBufferPool implements httputil.BufferPool using a sync.Pool of
// fixed-size byte slices.  Every request borrows one buffer for the
// response body copy; after the copy is done the buffer is returned.
//
// Without a BufferPool httputil.ReverseProxy allocates a fresh 32 KiB
// slice per request from the general heap.  At 40 K RPS that is
// 40,000 × 32 KiB = 1.28 GiB/s of allocation pressure on the GC.
// With the pool the steady-state allocation drops to near zero.
type ProxyBufferPool struct {
	p sync.Pool
}

// NewProxyBufferPool creates a ProxyBufferPool ready for use.
func NewProxyBufferPool() *ProxyBufferPool {
	return &ProxyBufferPool{
		p: sync.Pool{
			New: func() any {
				b := make([]byte, proxyBufferSize)
				return &b
			},
		},
	}
}

// Get satisfies httputil.BufferPool.
func (bp *ProxyBufferPool) Get() []byte {
	return *bp.p.Get().(*[]byte)
}

// Put satisfies httputil.BufferPool.
func (bp *ProxyBufferPool) Put(b []byte) {
	// Only return slices of the expected size so the pool stays homogeneous.
	if cap(b) == proxyBufferSize {
		b = b[:proxyBufferSize]
		bp.p.Put(&b)
	}
}

// ── ResponseWriter pool ───────────────────────────────────────────────────────

// rwPool recycles ResponseWriter instances to eliminate per-request
// heap allocations in the proxy hot path.
var rwPool = sync.Pool{
	New: func() any { return &ResponseWriter{} },
}

// AcquireResponseWriter borrows a ResponseWriter from the pool and
// initialises it with the provided underlying writer.
func AcquireResponseWriter(w http.ResponseWriter) *ResponseWriter {
	rw := rwPool.Get().(*ResponseWriter)
	rw.ResponseWriter = w
	rw.Status = http.StatusOK
	rw.Written = 0
	rw.wroteHeader = false
	return rw
}

// ReleaseResponseWriter resets and returns rw to the pool.
func ReleaseResponseWriter(rw *ResponseWriter) {
	rw.ResponseWriter = nil // drop reference so the underlying writer can be GC'd
	rwPool.Put(rw)
}

// ── bytebufferpool wrappers ───────────────────────────────────────────────────

// AcquireBuffer returns a pooled byte buffer for temporary JSON encoding.
func AcquireBuffer() *bytebufferpool.ByteBuffer { return bytebufferpool.Get() }

// ReleaseBuffer returns a buffer to the pool.
func ReleaseBuffer(b *bytebufferpool.ByteBuffer) { bytebufferpool.Put(b) }
