/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Multi-Provider AI Service
 * Supports: Claude, Gemini, OpenAI, Groq
 */

import Anthropic from '@anthropic-ai/sdk';

export type AIProvider = 'claude' | 'gemini' | 'openai' | 'groq' | 'demo';

// Cache for dynamically fetched Gemini models
let geminiModelsCache: ModelInfo[] | null = null;
let geminiModelsCacheTime: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  demoMode: boolean;
}

export interface AIResponse {
  analysis: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  responseTime: number;
  costUsd: number;
  provider: AIProvider;
}

export interface ProviderInfo {
  name: string;
  description: string;
  models: ModelInfo[];
  pricingTier: 'free' | 'paid' | 'freemium';
  defaultModel: string;
  apiKeyUrl: string;
  docsUrl: string;
  icon: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

// Provider configurations
export const AI_PROVIDERS: Record<AIProvider, ProviderInfo> = {
  claude: {
    name: 'Anthropic Claude',
    description: 'Most capable for reasoning and analysis',
    pricingTier: 'paid',
    defaultModel: 'claude-3-5-sonnet-20241022',
    apiKeyUrl: 'https://console.anthropic.com',
    docsUrl: 'https://docs.anthropic.com',
    icon: '🧠',
    models: [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Best balance of intelligence and speed',
        contextWindow: 200000,
        inputCostPer1M: 3.0,
        outputCostPer1M: 15.0,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Most capable model',
        contextWindow: 200000,
        inputCostPer1M: 15.0,
        outputCostPer1M: 75.0,
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Fastest and most affordable',
        contextWindow: 200000,
        inputCostPer1M: 0.25,
        outputCostPer1M: 1.25,
      },
    ],
  },
  gemini: {
    name: 'Google Gemini',
    description: '⭐ RECOMMENDED: 60 req/min FREE - No credit card needed!',
    pricingTier: 'freemium',
    defaultModel: 'gemini-2.0-flash',  // Stable version
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    icon: '✨',
    models: [
      {
        id: 'gemini-2.0-flash-exp',
        name: '⭐ Gemini 2.0 Flash (Experimental) - RECOMMENDED',
        description: 'Latest & fastest - FREE with experimental features',
        contextWindow: 1000000,
        inputCostPer1M: 0.0,
        outputCostPer1M: 0.0,
      },
      {
        id: 'gemini-exp-1206',
        name: 'Gemini Experimental 1206',
        description: 'Experimental model from Dec 2024',
        contextWindow: 2000000,
        inputCostPer1M: 0.0,
        outputCostPer1M: 0.0,
      },
      {
        id: 'gemini-2.0-flash-thinking-exp-1219',
        name: 'Gemini 2.0 Flash Thinking (Dec 19)',
        description: 'Advanced reasoning with thinking process',
        contextWindow: 1000000,
        inputCostPer1M: 0.0,
        outputCostPer1M: 0.0,
      },
      {
        id: 'learnlm-1.5-pro-experimental',
        name: 'LearnLM 1.5 Pro (Experimental)',
        description: 'Specialized for educational content',
        contextWindow: 2000000,
        inputCostPer1M: 0.0,
        outputCostPer1M: 0.0,
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        description: 'Previous generation - Stable & reliable',
        contextWindow: 1000000,
        inputCostPer1M: 0.075,
        outputCostPer1M: 0.30,
      },
      {
        id: 'gemini-1.5-flash-8b',
        name: 'Gemini 1.5 Flash 8B',
        description: 'Compact model - Lower latency',
        contextWindow: 1000000,
        inputCostPer1M: 0.0375,
        outputCostPer1M: 0.15,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Most capable 1.5 version - 2M context',
        contextWindow: 2000000,
        inputCostPer1M: 1.25,
        outputCostPer1M: 5.0,
      },
      {
        id: 'gemini-pro',
        name: 'Gemini 1.0 Pro (Legacy)',
        description: 'First generation - Still supported',
        contextWindow: 30720,
        inputCostPer1M: 0.50,
        outputCostPer1M: 1.50,
      },
    ],
  },
  openai: {
    name: 'OpenAI',
    description: '$5 free credits - GPT-4o Mini is very affordable',
    pricingTier: 'freemium',
    defaultModel: 'gpt-4o-mini',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
    icon: '🤖',
    models: [
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Most affordable - Great for testing',
        contextWindow: 128000,
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.60,
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Most capable multimodal model',
        contextWindow: 128000,
        inputCostPer1M: 2.50,
        outputCostPer1M: 10.0,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast and affordable',
        contextWindow: 16385,
        inputCostPer1M: 0.50,
        outputCostPer1M: 1.50,
      },
    ],
  },
  groq: {
    name: 'Groq',
    description: '⚡ FASTEST: 500+ tokens/sec - 30 req/min FREE!',
    pricingTier: 'freemium',
    defaultModel: 'llama-3.3-70b-versatile',  // Updated to 3.3
    apiKeyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs',
    icon: '⚡',
    models: [
      {
        id: 'llama-3.3-70b-versatile',  // Updated to 3.3
        name: 'Llama 3.3 70B Versatile',
        description: '⭐ Best balance - 30 req/min free',
        contextWindow: 131072,
        inputCostPer1M: 0.59,
        outputCostPer1M: 0.79,
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        description: 'Fastest - 30 req/min free',
        contextWindow: 131072,
        inputCostPer1M: 0.05,
        outputCostPer1M: 0.08,
      },
      {
        id: 'llama-4-scout-17b-16e-instruct',  // New Llama 4 model
        name: 'Llama 4 Scout 17B',
        description: 'Latest Llama 4 - Efficient',
        contextWindow: 131072,
        inputCostPer1M: 0.30,
        outputCostPer1M: 0.40,
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        description: 'High quality open model',
        contextWindow: 32768,
        inputCostPer1M: 0.24,
        outputCostPer1M: 0.24,
      },
      {
        id: 'gemma2-9b-it',
        name: 'Gemma 2 9B',
        description: 'Google open model',
        contextWindow: 8192,
        inputCostPer1M: 0.20,
        outputCostPer1M: 0.20,
      },
    ],
  },
  demo: {
    name: 'Demo Mode',
    description: 'Testing only - Use Gemini (FREE) for real analysis',
    pricingTier: 'free',
    defaultModel: 'demo-mock-v1',
    apiKeyUrl: '',
    docsUrl: '',
    icon: '🎭',
    models: [
      {
        id: 'demo-mock-v1',
        name: 'Demo Mock Model',
        description: 'Realistic mock responses',
        contextWindow: 200000,
        inputCostPer1M: 0,
        outputCostPer1M: 0,
      },
    ],
  },
};

/**
 * Fetch available Gemini models dynamically from Google AI API
 * Caches results for 24 hours to avoid excessive API calls
 */
async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  // Return cached models if still valid
  const now = Date.now();
  if (geminiModelsCache && (now - geminiModelsCacheTime) < CACHE_DURATION) {
    return geminiModelsCache;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Gemini models: ${response.statusText}`);
    }

    const data: any = await response.json();
    
    // Transform API response to our ModelInfo format
    const models: ModelInfo[] = (data.models || [])
      .filter((model: any) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model: any) => ({
        id: model.name.replace('models/', ''),
        name: model.displayName || model.name.replace('models/', ''),
        description: model.description || 'Google Gemini model',
        contextWindow: model.inputTokenLimit || 1000000,
        inputCostPer1M: 0, // Free tier - update based on model
        outputCostPer1M: 0,
      }));

    // Sort by name to group similar models together
    models.sort((a, b) => {
      // Prioritize 2.0 models, then experimental, then 1.5
      const priority = (id: string) => {
        if (id.includes('2.0')) return 0;
        if (id.includes('exp')) return 1;
        if (id.includes('1.5')) return 2;
        return 3;
      };
      return priority(a.id) - priority(b.id) || a.id.localeCompare(b.id);
    });

    // Cache the results
    geminiModelsCache = models;
    geminiModelsCacheTime = now;

    return models;
  } catch (error) {
    console.warn('Failed to fetch Gemini models dynamically, using static list:', error);
    // Return static fallback list
    return AI_PROVIDERS.gemini.models;
  }
}

/**
 * Get Gemini models with dynamic fetching
 * Falls back to static list if API key not provided or fetch fails
 */
export async function getGeminiModels(apiKey?: string): Promise<ModelInfo[]> {
  if (apiKey) {
    try {
      return await fetchGeminiModels(apiKey);
    } catch {
      console.warn('Using static Gemini model list');
    }
  }
  return AI_PROVIDERS.gemini.models;
}

/**
 * Call Claude API
 */
async function callClaude(
  prompt: string,
  config: AIProviderConfig
): Promise<AIResponse> {
  const startTime = Date.now();
  const anthropic = new Anthropic({ apiKey: config.apiKey });

  const message = await anthropic.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseTime = Date.now() - startTime;
  const firstBlock = message.content[0];
  const analysis = firstBlock && 'text' in firstBlock ? firstBlock.text : '';

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const modelInfo = AI_PROVIDERS.claude.models.find(m => m.id === config.model);
  const costUsd = modelInfo
    ? (inputTokens * modelInfo.inputCostPer1M + outputTokens * modelInfo.outputCostPer1M) / 1_000_000
    : 0;

  return {
    analysis,
    model: config.model,
    inputTokens,
    outputTokens,
    responseTime,
    costUsd,
    provider: 'claude',
  };
}

/**
 * Call Google Gemini API
 */
async function callGemini(
  prompt: string,
  config: AIProviderConfig
): Promise<AIResponse> {
  const startTime = Date.now();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data: any = await response.json();
  const responseTime = Date.now() - startTime;

  const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

  const modelInfo = AI_PROVIDERS.gemini.models.find(m => m.id === config.model);
  const costUsd = modelInfo
    ? (inputTokens * modelInfo.inputCostPer1M + outputTokens * modelInfo.outputCostPer1M) / 1_000_000
    : 0;

  return {
    analysis,
    model: config.model,
    inputTokens,
    outputTokens,
    responseTime,
    costUsd,
    provider: 'gemini',
  };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  prompt: string,
  config: AIProviderConfig
): Promise<AIResponse> {
  const startTime = Date.now();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data: any = await response.json();
  const responseTime = Date.now() - startTime;

  const analysis = data.choices?.[0]?.message?.content || '';
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  const modelInfo = AI_PROVIDERS.openai.models.find(m => m.id === config.model);
  const costUsd = modelInfo
    ? (inputTokens * modelInfo.inputCostPer1M + outputTokens * modelInfo.outputCostPer1M) / 1_000_000
    : 0;

  return {
    analysis,
    model: config.model,
    inputTokens,
    outputTokens,
    responseTime,
    costUsd,
    provider: 'openai',
  };
}

/**
 * Call Groq API
 */
async function callGroq(
  prompt: string,
  config: AIProviderConfig
): Promise<AIResponse> {
  const startTime = Date.now();

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${error}`);
  }

  const data: any = await response.json();
  const responseTime = Date.now() - startTime;

  const analysis = data.choices?.[0]?.message?.content || '';
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  const modelInfo = AI_PROVIDERS.groq.models.find(m => m.id === config.model);
  const costUsd = modelInfo
    ? (inputTokens * modelInfo.inputCostPer1M + outputTokens * modelInfo.outputCostPer1M) / 1_000_000
    : 0;

  return {
    analysis,
    model: config.model,
    inputTokens,
    outputTokens,
    responseTime,
    costUsd,
    provider: 'groq',
  };
}

/**
 * Main function to call any AI provider
 */
export async function callAIProvider(
  prompt: string,
  config: AIProviderConfig
): Promise<AIResponse> {
  switch (config.provider) {
  case 'claude':
    return callClaude(prompt, config);
  case 'gemini':
    return callGemini(prompt, config);
  case 'openai':
    return callOpenAI(prompt, config);
  case 'groq':
    return callGroq(prompt, config);
  default:
    throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Test API key for any provider
 */
export async function testProviderApiKey(
  provider: AIProvider,
  apiKey: string
): Promise<{ success: boolean; error?: string; model?: string }> {
  try {
    const providerInfo = AI_PROVIDERS[provider];
    const config: AIProviderConfig = {
      provider,
      apiKey,
      model: providerInfo.defaultModel,
      maxTokens: 10,
      temperature: 0,
      demoMode: false,
    };

    const response = await callAIProvider('Reply with "OK"', config);
    return {
      success: true,
      model: response.model,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Get model info for a provider
 */
export function getModelInfo(provider: AIProvider, modelId: string): ModelInfo | undefined {
  return AI_PROVIDERS[provider]?.models.find(m => m.id === modelId);
}

/**
 * Calculate cost for a given provider and token usage
 */
export function calculateCost(
  provider: AIProvider,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const modelInfo = getModelInfo(provider, modelId);
  if (!modelInfo) return 0;

  return (
    (inputTokens * modelInfo.inputCostPer1M + outputTokens * modelInfo.outputCostPer1M) /
    1_000_000
  );
}
