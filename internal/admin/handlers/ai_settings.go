package handlers

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/rs/zerolog"
)

// AISettingsHandler serves GET/POST /api/settings/ai and related endpoints.
//
// Settings are held in-memory (reset on restart) until a real persistence
// layer (Postgres settings table) is wired up. The shape mirrors the AIConfig
// state in AISettings.tsx exactly so the frontend renders without errors.
type AISettingsHandler struct {
	mu  sync.RWMutex
	cfg aiConfig
	log zerolog.Logger
}

type aiConfig struct {
	Success            bool        `json:"success"`
	Provider           string      `json:"provider"`
	Model              string      `json:"model"`
	MaxTokens          int         `json:"maxTokens"`
	Temperature        float64     `json:"temperature"`
	DemoMode           bool        `json:"demoMode"`
	HasAPIKey          bool        `json:"hasApiKey"`
	APIKeyLocked       bool        `json:"apiKeyLocked"`
	AvailableProviders []aiProvider `json:"availableProviders"`
}

type aiProvider struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	PricingTier  string    `json:"pricingTier"`
	DefaultModel string    `json:"defaultModel"`
	APIKeyURL    string    `json:"apiKeyUrl"`
	DocsURL      string    `json:"docsUrl"`
	Icon         string    `json:"icon"`
	Models       []aiModel `json:"models"`
}

type aiModel struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Description      string  `json:"description"`
	ContextWindow    int     `json:"contextWindow"`
	InputCostPer1M   float64 `json:"inputCostPer1M"`
	OutputCostPer1M  float64 `json:"outputCostPer1M"`
}

// NewAISettingsHandler constructs an AISettingsHandler with default config.
func NewAISettingsHandler(log zerolog.Logger) *AISettingsHandler {
	return &AISettingsHandler{
		log: log,
		cfg: defaultAIConfig(),
	}
}

func defaultAIConfig() aiConfig {
	return aiConfig{
		Success:      true,
		Provider:     "gemini",
		Model:        "gemini-2.5-flash",
		MaxTokens:    1000,
		Temperature:  0.3,
		DemoMode:     true,
		HasAPIKey:    false,
		APIKeyLocked: false,
		AvailableProviders: []aiProvider{
			{
				ID:           "demo",
				Name:         "Demo Mode",
				Description:  "Simulated AI responses — no API key required",
				PricingTier:  "free",
				DefaultModel: "demo",
				APIKeyURL:    "",
				DocsURL:      "",
				Icon:         "🎭",
				Models: []aiModel{
					{ID: "demo", Name: "Demo Model", Description: "Simulated responses", ContextWindow: 4096, InputCostPer1M: 0, OutputCostPer1M: 0},
				},
			},
			{
				ID:           "claude",
				Name:         "Anthropic Claude",
				Description:  "Claude 3 family — strong reasoning and safety",
				PricingTier:  "paid",
				DefaultModel: "claude-3-haiku-20240307",
				APIKeyURL:    "https://console.anthropic.com/",
				DocsURL:      "https://docs.anthropic.com/",
				Icon:         "🤖",
				Models: []aiModel{
					{ID: "claude-3-haiku-20240307", Name: "Claude 3 Haiku", Description: "Fast and affordable", ContextWindow: 200000, InputCostPer1M: 0.25, OutputCostPer1M: 1.25},
					{ID: "claude-3-sonnet-20240229", Name: "Claude 3 Sonnet", Description: "Balanced performance", ContextWindow: 200000, InputCostPer1M: 3.0, OutputCostPer1M: 15.0},
					{ID: "claude-3-opus-20240229", Name: "Claude 3 Opus", Description: "Most capable", ContextWindow: 200000, InputCostPer1M: 15.0, OutputCostPer1M: 75.0},
					{ID: "claude-3-5-sonnet-20241022", Name: "Claude 3.5 Sonnet", Description: "Latest and greatest", ContextWindow: 200000, InputCostPer1M: 3.0, OutputCostPer1M: 15.0},
				},
			},
			{
				ID:           "openai",
				Name:         "OpenAI",
				Description:  "GPT-4o and GPT-3.5 family",
				PricingTier:  "paid",
				DefaultModel: "gpt-3.5-turbo",
				APIKeyURL:    "https://platform.openai.com/api-keys",
				DocsURL:      "https://platform.openai.com/docs",
				Icon:         "✨",
				Models: []aiModel{
					{ID: "gpt-3.5-turbo", Name: "GPT-3.5 Turbo", Description: "Fast and cheap", ContextWindow: 16385, InputCostPer1M: 0.5, OutputCostPer1M: 1.5},
					{ID: "gpt-4o-mini", Name: "GPT-4o Mini", Description: "Small and affordable", ContextWindow: 128000, InputCostPer1M: 0.15, OutputCostPer1M: 0.6},
					{ID: "gpt-4o", Name: "GPT-4o", Description: "Most capable", ContextWindow: 128000, InputCostPer1M: 5.0, OutputCostPer1M: 15.0},
					{ID: "gpt-4-turbo", Name: "GPT-4 Turbo", Description: "High quality", ContextWindow: 128000, InputCostPer1M: 10.0, OutputCostPer1M: 30.0},
				},
			},
			{
				ID:           "gemini",
				Name:         "Google Gemini",
				Description:  "Gemini 2.x and 1.5 family",
				PricingTier:  "freemium",
				DefaultModel: "gemini-2.5-flash",
				APIKeyURL:    "https://aistudio.google.com/app/apikey",
				DocsURL:      "https://ai.google.dev/docs",
				Icon:         "💎",
				Models: []aiModel{
					{ID: "gemini-2.5-flash", Name: "Gemini 2.5 Flash", Description: "Fast, free tier", ContextWindow: 1048576, InputCostPer1M: 0, OutputCostPer1M: 0},
					{ID: "gemini-2.5-pro", Name: "Gemini 2.5 Pro", Description: "Most capable", ContextWindow: 1048576, InputCostPer1M: 1.25, OutputCostPer1M: 10.0},
					{ID: "gemini-1.5-flash", Name: "Gemini 1.5 Flash", Description: "Fast and efficient", ContextWindow: 1048576, InputCostPer1M: 0, OutputCostPer1M: 0},
					{ID: "gemini-1.5-pro", Name: "Gemini 1.5 Pro", Description: "Balanced capability", ContextWindow: 2097152, InputCostPer1M: 1.25, OutputCostPer1M: 5.0},
				},
			},
			{
				ID:           "groq",
				Name:         "Groq",
				Description:  "Ultra-fast inference via custom LPUs",
				PricingTier:  "freemium",
				DefaultModel: "llama3-8b-8192",
				APIKeyURL:    "https://console.groq.com/keys",
				DocsURL:      "https://console.groq.com/docs",
				Icon:         "⚡",
				Models: []aiModel{
					{ID: "llama3-8b-8192", Name: "Llama 3 8B", Description: "Fast open-source", ContextWindow: 8192, InputCostPer1M: 0.05, OutputCostPer1M: 0.08},
					{ID: "llama3-70b-8192", Name: "Llama 3 70B", Description: "High quality", ContextWindow: 8192, InputCostPer1M: 0.59, OutputCostPer1M: 0.79},
					{ID: "mixtral-8x7b-32768", Name: "Mixtral 8x7B", Description: "MoE model", ContextWindow: 32768, InputCostPer1M: 0.24, OutputCostPer1M: 0.24},
				},
			},
		},
	}
}

// Get handles GET /api/settings/ai.
func (h *AISettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, h.cfg)
}

// Save handles POST /api/settings/ai.
func (h *AISettingsHandler) Save(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Provider    string  `json:"provider"`
		APIKey      string  `json:"apiKey"`
		Model       string  `json:"model"`
		MaxTokens   int     `json:"maxTokens"`
		Temperature float64 `json:"temperature"`
		DemoMode    bool    `json:"demoMode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"success":false,"error":"invalid body"}`, http.StatusBadRequest)
		return
	}

	h.mu.Lock()
	if body.Provider != "" {
		h.cfg.Provider = body.Provider
	}
	if body.Model != "" {
		h.cfg.Model = body.Model
	}
	if body.MaxTokens > 0 {
		h.cfg.MaxTokens = body.MaxTokens
	}
	h.cfg.Temperature = body.Temperature
	h.cfg.DemoMode = body.DemoMode
	if body.APIKey != "" {
		h.cfg.HasAPIKey = true
		h.cfg.APIKeyLocked = true
	}
	h.mu.Unlock()

	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "AI settings saved",
	})
}

// TestKey handles POST /api/settings/ai/test.
func (h *AISettingsHandler) TestKey(w http.ResponseWriter, r *http.Request) {
	// Stub — always succeeds; a real impl would call the provider's verify endpoint.
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "API key accepted (stub validation)",
	})
}

// DeleteKey handles DELETE /api/settings/ai/key.
func (h *AISettingsHandler) DeleteKey(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	h.cfg.HasAPIKey = false
	h.cfg.APIKeyLocked = false
	h.cfg.DemoMode = true
	h.cfg.Provider = "demo"
	h.mu.Unlock()

	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "API key deleted",
	})
}
