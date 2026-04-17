// Package handlers — setup detection endpoint.
//
//	GET /api/setup/detect → runs all environment probes and returns a Report.
package handlers

import (
	"net/http"

	"github.com/rs/zerolog"

	"github.com/flexgate/proxy/internal/setup/detector"
)

// DetectHandler handles GET /api/setup/detect.
//
// It runs all host-environment probes (nginx, haproxy, docker, podman, ports)
// concurrently and returns the consolidated Report as JSON.
//
// The endpoint is intentionally unauthenticated — the setup wizard and CLI
// need to call it before any admin credentials have been configured.
type DetectHandler struct {
	log      zerolog.Logger
	detector *detector.Detector
}

// NewDetectHandler creates a DetectHandler with the supplied detector options.
// Pass detector.DefaultOptions() for production defaults.
func NewDetectHandler(opts detector.Options, log zerolog.Logger) *DetectHandler {
	return &DetectHandler{
		log:      log,
		detector: detector.New(opts),
	}
}

// DefaultDetectOptions returns the detector.Options used in production.
// Exposed here so the router can construct a DetectHandler without importing
// the detector package directly.
func DefaultDetectOptions() detector.Options {
	return detector.DefaultOptions()
}

// Detect handles GET /api/setup/detect.
//
// Example response:
//
//	{
//	  "nginx":   { "installed": true,  "version": "1.24.0" },
//	  "haproxy": { "installed": false, "error": "not found" },
//	  "docker":  { "installed": true,  "version": "26.1.4" },
//	  "podman":  { "installed": false, "error": "not found" },
//	  "ports": {
//	    "3000": { "port": 3000, "status": "free"   },
//	    "5432": { "port": 5432, "status": "in_use" },
//	    "6379": { "port": 6379, "status": "free"   }
//	  },
//	  "detectedAt": "2026-04-14T10:00:00Z"
//	}
func (h *DetectHandler) Detect(w http.ResponseWriter, r *http.Request) {
	report, err := h.detector.Run(r.Context())
	if err != nil {
		h.log.Error().Err(err).Msg("setup/detect: probe run failed")
		Error(w, http.StatusInternalServerError, "environment detection failed")
		return
	}

	h.log.Info().
		Bool("nginx", report.Nginx.Installed).
		Bool("haproxy", report.HAProxy.Installed).
		Bool("docker", report.Docker.Installed).
		Bool("podman", report.Podman.Installed).
		Bool("postgres", report.Postgres.Installed).
		Bool("redis", report.Redis.Installed).
		Bool("nats", report.Nats.Installed).
		Msg("setup/detect: completed")

	JSON(w, http.StatusOK, report)
}
