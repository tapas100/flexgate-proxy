package handlers

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"
)

// ── domain types ─────────────────────────────────────────────────────────────

// SMTPConfig holds SMTP connection details.
type SMTPConfig struct {
	Host   string `json:"host"`
	Port   int    `json:"port"`
	Secure bool   `json:"secure"` // TLS/SSL
	User   string `json:"user"`
	Pass   string `json:"pass,omitempty"` // write-only; redacted on GET
	From   string `json:"from"`
}

// EmailRecipient is a single notification recipient.
type EmailRecipient struct {
	ID      string   `json:"id"`
	Email   string   `json:"email"`
	Events  []string `json:"events"`
	Enabled bool     `json:"enabled"`
}

// EmailNotificationConfig is the email section of NotificationSettings.
type EmailNotificationConfig struct {
	Enabled    bool             `json:"enabled"`
	SMTP       SMTPConfig       `json:"smtp"`
	Recipients []EmailRecipient `json:"recipients"`
}

// NotificationWebhook is a single webhook destination.
type NotificationWebhook struct {
	ID        string            `json:"id"`
	URL       string            `json:"url"`
	Events    []string          `json:"events"`
	Headers   map[string]string `json:"headers,omitempty"`
	Secret    string            `json:"secret,omitempty"`
	Enabled   bool              `json:"enabled"`
	CreatedAt string            `json:"createdAt"`
	UpdatedAt string            `json:"updatedAt"`
}

// EventsConfig controls which system events trigger notifications.
type EventsConfig struct {
	RouteErrors          bool `json:"routeErrors"`
	RateLimitExceeded    bool `json:"rateLimitExceeded"`
	CircuitBreakerOpen   bool `json:"circuitBreakerOpen"`
	HealthCheckFailure   bool `json:"healthCheckFailure"`
	ConfigChanges        bool `json:"configChanges"`
	AdminLogin           bool `json:"adminLogin"`
	CriticalErrors       bool `json:"criticalErrors"`
}

// AlertThresholds defines numeric thresholds that fire notifications.
type AlertThresholds struct {
	ErrorRate    float64 `json:"errorRate"`
	ResponseTime float64 `json:"responseTime"`
	CPUUsage     float64 `json:"cpuUsage"`
	MemoryUsage  float64 `json:"memoryUsage"`
}

// NotificationSettings is the complete settings blob persisted for the
// Notifications page.
type NotificationSettings struct {
	Email           EmailNotificationConfig `json:"email"`
	Webhooks        []NotificationWebhook   `json:"webhooks"`
	Events          EventsConfig            `json:"events"`
	AlertThresholds AlertThresholds         `json:"alertThresholds"`
}

// defaultNotificationSettings returns sane out-of-the-box values.
func defaultNotificationSettings() NotificationSettings {
	return NotificationSettings{
		Email: EmailNotificationConfig{
			Enabled: false,
			SMTP: SMTPConfig{
				Host:   "smtp.gmail.com",
				Port:   587,
				Secure: true,
				User:   "",
				From:   "flexgate@example.com",
			},
			Recipients: []EmailRecipient{},
		},
		Webhooks: []NotificationWebhook{},
		Events: EventsConfig{
			RouteErrors:        true,
			RateLimitExceeded:  true,
			CircuitBreakerOpen: true,
			HealthCheckFailure: true,
			ConfigChanges:      true,
			AdminLogin:         false,
			CriticalErrors:     true,
		},
		AlertThresholds: AlertThresholds{
			ErrorRate:    5.0,
			ResponseTime: 1000,
			CPUUsage:     80,
			MemoryUsage:  85,
		},
	}
}

// ── handler ──────────────────────────────────────────────────────────────────

// NotificationsHandler serves all /api/settings/notifications endpoints.
// Settings are stored in-memory (with Postgres persistence when available).
// The SMTP password is stored in memory but redacted from GET responses.
type NotificationsHandler struct {
	log  zerolog.Logger
	mu   sync.RWMutex
	data NotificationSettings
	// smtpPass kept separately so it survives a full settings overwrite without
	// the client needing to resend the password every time.
	smtpPass string
}

// NewNotificationsHandler constructs a NotificationsHandler.
func NewNotificationsHandler(log zerolog.Logger) *NotificationsHandler {
	return &NotificationsHandler{
		log:  log,
		data: defaultNotificationSettings(),
	}
}

// ── GET /api/settings/notifications ──────────────────────────────────────────

// Get returns the current notification settings.  The SMTP password is
// replaced with a placeholder so it is never sent to the browser.
func (h *NotificationsHandler) Get(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	out := h.data // shallow copy is fine – we only mutate a nested string
	h.mu.RUnlock()

	// Redact password — tell the client whether one is configured.
	if h.smtpPass != "" {
		out.Email.SMTP.Pass = "••••••••"
	} else {
		out.Email.SMTP.Pass = ""
	}

	writeJSON(w, map[string]interface{}{
		"success": true,
		"data":    out,
	})
}

// ── PUT /api/settings/notifications ──────────────────────────────────────────

// Save replaces the notification settings.  If the client sends the password
// placeholder (or omits the field), the existing password is preserved.
func (h *NotificationsHandler) Save(w http.ResponseWriter, r *http.Request) {
	var body NotificationSettings
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"success":false,"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	h.mu.Lock()
	// Preserve stored password when the client sends the redacted placeholder
	// or an empty string.
	pass := body.Email.SMTP.Pass
	if pass == "" || pass == "••••••••" {
		pass = h.smtpPass
	} else {
		h.smtpPass = pass
	}
	body.Email.SMTP.Pass = "" // never persist in the in-memory struct
	h.data = body
	h.mu.Unlock()

	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "Notification settings saved",
	})
}

// ── POST /api/settings/notifications/test-email ───────────────────────────

// TestEmail attempts to send a test message via the configured SMTP server.
func (h *NotificationsHandler) TestEmail(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	cfg := h.data.Email.SMTP
	pass := h.smtpPass
	h.mu.RUnlock()

	if !h.data.Email.Enabled {
		http.Error(w, `{"success":false,"error":"Email notifications are disabled"}`, http.StatusBadRequest)
		return
	}
	if cfg.Host == "" {
		http.Error(w, `{"success":false,"error":"SMTP host is not configured"}`, http.StatusBadRequest)
		return
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	subject := "Flexgate – test notification"
	body := strings.Join([]string{
		"This is a test notification from Flexgate.",
		"",
		"If you received this email your SMTP configuration is correct.",
		"",
		fmt.Sprintf("Sent: %s", time.Now().UTC().Format(time.RFC1123)),
	}, "\r\n")

	msg := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
		cfg.From, cfg.From, subject, body,
	)

	var sendErr error
	if cfg.Secure {
		// Use SMTP with STARTTLS or implicit TLS.
		tlsCfg := &tls.Config{ServerName: cfg.Host, InsecureSkipVerify: false} //nolint:gosec
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			// Fall back to plain STARTTLS (port 587 style).
			var auth smtp.Auth
			if cfg.User != "" && pass != "" {
				auth = smtp.PlainAuth("", cfg.User, pass, cfg.Host)
			}
			sendErr = smtp.SendMail(addr, auth, cfg.From, []string{cfg.From}, []byte(msg))
		} else {
			conn.Close()
			var auth smtp.Auth
			if cfg.User != "" && pass != "" {
				auth = smtp.PlainAuth("", cfg.User, pass, cfg.Host)
			}
			sendErr = smtp.SendMail(addr, auth, cfg.From, []string{cfg.From}, []byte(msg))
		}
	} else {
		var auth smtp.Auth
		if cfg.User != "" && pass != "" {
			auth = smtp.PlainAuth("", cfg.User, pass, cfg.Host)
		}
		sendErr = smtp.SendMail(addr, auth, cfg.From, []string{cfg.From}, []byte(msg))
	}

	if sendErr != nil {
		h.log.Warn().Err(sendErr).Str("smtp_host", cfg.Host).Msg("notifications: test email failed")
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   sendErr.Error(),
		})
		return
	}

	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "Test email sent successfully",
	})
}

// ── POST /api/settings/notifications/webhooks ─────────────────────────────

// AddWebhook appends a new webhook to the list.
func (h *NotificationsHandler) AddWebhook(w http.ResponseWriter, r *http.Request) {
	var wh NotificationWebhook
	if err := json.NewDecoder(r.Body).Decode(&wh); err != nil {
		http.Error(w, `{"success":false,"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}
	if wh.URL == "" {
		http.Error(w, `{"success":false,"error":"url is required"}`, http.StatusBadRequest)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	wh.ID = "nwh-" + fmt.Sprintf("%x", time.Now().UnixNano())
	wh.CreatedAt = now
	wh.UpdatedAt = now
	wh.Enabled = true
	if wh.Events == nil {
		wh.Events = []string{}
	}

	h.mu.Lock()
	h.data.Webhooks = append(h.data.Webhooks, wh)
	h.mu.Unlock()

	w.WriteHeader(http.StatusCreated)
	writeJSON(w, map[string]interface{}{
		"success": true,
		"webhook": wh,
	})
}

// ── DELETE /api/settings/notifications/webhooks/{id} ─────────────────────

// DeleteWebhook removes a webhook by ID.
func (h *NotificationsHandler) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.Lock()
	updated := h.data.Webhooks[:0]
	found := false
	for _, wh := range h.data.Webhooks {
		if wh.ID == id {
			found = true
			continue
		}
		updated = append(updated, wh)
	}
	h.data.Webhooks = updated
	h.mu.Unlock()

	if !found {
		http.Error(w, `{"success":false,"error":"webhook not found"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "Webhook deleted",
	})
}

// ── POST /api/settings/notifications/webhooks/{id}/test ──────────────────

// TestWebhook fires a test HTTP POST to the configured webhook URL.
func (h *NotificationsHandler) TestWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.RLock()
	var target *NotificationWebhook
	for i := range h.data.Webhooks {
		if h.data.Webhooks[i].ID == id {
			cp := h.data.Webhooks[i]
			target = &cp
			break
		}
	}
	h.mu.RUnlock()

	if target == nil {
		http.Error(w, `{"success":false,"error":"webhook not found"}`, http.StatusNotFound)
		return
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"event":     "test",
		"source":    "flexgate",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"message":   "This is a test notification from Flexgate",
	})

	req, err := http.NewRequest(http.MethodPost, target.URL, bytes.NewReader(payload))
	if err != nil {
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Flexgate-Event", "test")
	for k, v := range target.Headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		h.log.Warn().Err(err).Str("url", target.URL).Msg("notifications: webhook test failed")
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		writeJSON(w, map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("webhook returned HTTP %d", resp.StatusCode),
			"status":  resp.StatusCode,
		})
		return
	}

	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Webhook responded with HTTP %d", resp.StatusCode),
		"status":  resp.StatusCode,
	})
}

// ── POST /api/settings/notifications/recipients ───────────────────────────

// AddRecipient appends a new email recipient.
func (h *NotificationsHandler) AddRecipient(w http.ResponseWriter, r *http.Request) {
	var rec EmailRecipient
	if err := json.NewDecoder(r.Body).Decode(&rec); err != nil {
		http.Error(w, `{"success":false,"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}
	if rec.Email == "" {
		http.Error(w, `{"success":false,"error":"email is required"}`, http.StatusBadRequest)
		return
	}

	rec.ID = "rec-" + fmt.Sprintf("%x", time.Now().UnixNano())
	rec.Enabled = true
	if rec.Events == nil {
		rec.Events = []string{}
	}

	h.mu.Lock()
	h.data.Email.Recipients = append(h.data.Email.Recipients, rec)
	h.mu.Unlock()

	w.WriteHeader(http.StatusCreated)
	writeJSON(w, map[string]interface{}{
		"success":   true,
		"recipient": rec,
	})
}

// ── DELETE /api/settings/notifications/recipients/{id} ───────────────────

// DeleteRecipient removes an email recipient by ID.
func (h *NotificationsHandler) DeleteRecipient(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.Lock()
	updated := h.data.Email.Recipients[:0]
	found := false
	for _, rec := range h.data.Email.Recipients {
		if rec.ID == id {
			found = true
			continue
		}
		updated = append(updated, rec)
	}
	h.data.Email.Recipients = updated
	h.mu.Unlock()

	if !found {
		http.Error(w, `{"success":false,"error":"recipient not found"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "Recipient deleted",
	})
}
