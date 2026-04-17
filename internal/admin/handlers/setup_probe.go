package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

// ProbeHandler handles GET /api/setup/probe?url=<target>
//
// The setup wizard calls this instead of fetching the traffic proxy directly,
// which avoids CORS: the browser calls same-origin admin API (port 9090),
// and the admin API makes the HTTP request server-side.
type ProbeHandler struct {
	log    zerolog.Logger
	client *http.Client
}

// NewProbeHandler creates a ProbeHandler with a short-timeout HTTP client.
func NewProbeHandler(log zerolog.Logger) *ProbeHandler {
	return &ProbeHandler{
		log: log,
		client: &http.Client{
			Timeout: 10 * time.Second,
			// Don't follow redirects — report them as-is so the wizard can show the real status.
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

// ProbeResponse is the JSON body returned to the browser.
type ProbeResponse struct {
	StatusCode  int             `json:"statusCode"`
	LatencyMs   int64           `json:"latencyMs"`
	Body        json.RawMessage `json:"body,omitempty"`
	RawBody     string          `json:"rawBody"`
	TargetURL   string          `json:"targetUrl"`
	Error       string          `json:"error,omitempty"`
}

// Probe fetches the ?url= query param server-side and returns a structured response.
// Only URLs with http/https scheme are allowed; arbitrary internal targets are fine
// for this development-phase endpoint.
func (h *ProbeHandler) Probe(w http.ResponseWriter, r *http.Request) {
	rawTarget := r.URL.Query().Get("url")
	if rawTarget == "" {
		http.Error(w, `{"error":"missing url query param"}`, http.StatusBadRequest)
		return
	}

	parsed, err := url.Parse(rawTarget)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		http.Error(w, `{"error":"url must be http or https"}`, http.StatusBadRequest)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, rawTarget, nil)
	if err != nil {
		writeProbeError(w, rawTarget, "build request: "+err.Error())
		return
	}
	req.Header.Set("Accept", "application/json, text/plain, */*")

	t0 := time.Now()
	resp, err := h.client.Do(req)
	latencyMs := time.Since(t0).Milliseconds()
	if err != nil {
		writeProbeError(w, rawTarget, err.Error())
		return
	}
	defer resp.Body.Close() //nolint:errcheck

	rawBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	rawBody := string(rawBytes)

	var bodyJSON json.RawMessage
	if strings.Contains(resp.Header.Get("Content-Type"), "application/json") {
		if json.Valid(rawBytes) {
			bodyJSON = json.RawMessage(rawBytes)
		}
	}

	out := ProbeResponse{
		StatusCode: resp.StatusCode,
		LatencyMs:  latencyMs,
		Body:       bodyJSON,
		RawBody:    rawBody,
		TargetURL:  rawTarget,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(out)
}

func writeProbeError(w http.ResponseWriter, target, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK) // always 200 — the error is in the body
	_ = json.NewEncoder(w).Encode(ProbeResponse{
		StatusCode: 0,
		TargetURL:  target,
		Error:      msg,
	})
}
