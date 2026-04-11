package proxy

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
)

// ResponseWriter wraps http.ResponseWriter to capture the HTTP status code
// written by the handler. It is used by the logging middleware and the proxy
// handler to record the final response status for structured log lines.
//
// It also implements http.Hijacker and http.Flusher so that websocket upgrades
// and streaming responses continue to work transparently.
type ResponseWriter struct {
	http.ResponseWriter
	Status  int
	Written int64 // bytes written to the body
	wroteHeader bool
}

// NewResponseWriter wraps w. Status defaults to 200 (matching net/http
// behaviour when WriteHeader is never called).
func NewResponseWriter(w http.ResponseWriter) *ResponseWriter {
	return &ResponseWriter{ResponseWriter: w, Status: http.StatusOK}
}

// WriteHeader captures the status code and delegates to the underlying writer.
// Multiple calls are silently ignored after the first (matching net/http).
func (rw *ResponseWriter) WriteHeader(code int) {
	if rw.wroteHeader {
		return
	}
	rw.Status = code
	rw.wroteHeader = true
	rw.ResponseWriter.WriteHeader(code)
}

// Write delegates to the underlying writer; the first call implicitly records
// a 200 status if WriteHeader has not been called yet.
func (rw *ResponseWriter) Write(b []byte) (int, error) {
	if !rw.wroteHeader {
		rw.WriteHeader(http.StatusOK)
	}
	n, err := rw.ResponseWriter.Write(b)
	rw.Written += int64(n)
	return n, err
}

// Flush implements http.Flusher for streaming responses (SSE, chunked transfer).
func (rw *ResponseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Hijack implements http.Hijacker for WebSocket upgrades.
func (rw *ResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := rw.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("responsewriter: underlying writer does not implement http.Hijacker")
	}
	return h.Hijack()
}

// Unwrap returns the underlying http.ResponseWriter (for middleware introspection).
func (rw *ResponseWriter) Unwrap() http.ResponseWriter { return rw.ResponseWriter }
