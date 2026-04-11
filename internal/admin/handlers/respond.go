package handlers

import (
	"encoding/json"
	"net/http"
)

// JSON writes v as JSON with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// ErrResponse is the canonical error envelope returned by every admin handler.
type ErrResponse struct {
	Error     string `json:"error"`
	RequestID string `json:"request_id,omitempty"`
}

// Error writes a JSON error response.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, ErrResponse{Error: msg})
}

// decodeJSON reads a JSON body into dst.  Returns false and writes 400 if the
// body is missing, malformed, or exceeds 1 MiB.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		Error(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return false
	}
	return true
}
