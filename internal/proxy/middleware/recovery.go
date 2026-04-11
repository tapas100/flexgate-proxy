package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/rs/zerolog"
)

// Recovery returns a middleware that catches any panic raised by downstream
// handlers, logs the full stack trace, and returns HTTP 500 to the client.
//
// It guarantees the worker never crashes due to a handler panic. The error is
// logged at ERROR level because a panic always represents a programming bug
// that must be investigated immediately.
//
// The logger is injected so panic logs share the same zerolog.Logger (level,
// format, output) as all other log lines.
func Recovery(log zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					stack := debug.Stack()

					ctx := r.Context()
					log.Error().
						Str("request_id", RequestIDFromCtx(ctx)).
						Str("method", r.Method).
						Str("path", r.URL.Path).
						Str("client_ip", ClientIPFromCtx(ctx)).
						Str("panic", fmt.Sprintf("%v", rec)).
						Bytes("stack", stack).
						Msg("panic recovered")

					// Write a 500 only if the response has not been started yet.
					// We detect this by checking whether WriteHeader has already
					// been called; if the underlying writer does not expose that
					// information, we send the error unconditionally (safe: the
					// second WriteHeader call is a no-op in net/http).
					type headerWritten interface{ Written() bool }
					if hw, ok := w.(headerWritten); !ok || !hw.Written() {
						http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
					}
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}
