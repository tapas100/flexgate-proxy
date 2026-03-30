/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Multi-Provider AI Settings Routes
 * Supports: Claude, Gemini, OpenAI, Groq
 * 
 * Security Features:
 * - API keys encrypted at rest
 * - Keys never returned in responses
 * - HTTPS recommended for production
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import database from '../database/index';
import {
  AIProvider,
  AIProviderConfig,
  AI_PROVIDERS,
  testProviderApiKey,
  getGeminiModels,
} from '../services/aiProviders';
import { deleteOperationRateLimiter } from '../middleware/rateLimiting';

const router = express.Router();
const db = database;

// Path to external config file (for CLI users)
const CONFIG_FILE_PATH = process.env.CONFIG_FILE_PATH || path.join(process.cwd(), 'config.json');

// Encryption key for API keys (REQUIRED - no default fallback)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  const errorMsg = `
❌ CRITICAL: ENCRYPTION_KEY environment variable is required!

Generate a secure key with:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

Then set it:
  export ENCRYPTION_KEY=your-generated-key-here

Or add to .env file:
  ENCRYPTION_KEY=your-generated-key-here
`;
  console.error(errorMsg);
  throw new Error('ENCRYPTION_KEY is required');
}

if (ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters');
}

const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt sensitive data (API keys)
 */
function encrypt(text: string): string {
  if (!text || !ENCRYPTION_KEY) return '';
  
  const key = crypto.scryptSync(ENCRYPTION_KEY as string, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV + encrypted data
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':') || !ENCRYPTION_KEY) return '';
  
  try {
    const [ivHex, encryptedData] = encryptedText.split(':');
    if (!ivHex || !encryptedData) return '';
    
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY as string, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    const decrypted = decipher.update(encryptedData, 'hex', 'utf8') + decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

/**
 * Mask API key for display (show first 8 and last 4 chars)
 */
function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 12) return '••••••••';
  return apiKey.substring(0, 8) + '••••••••' + apiKey.substring(apiKey.length - 4);
}

// In-memory store for AI configuration
// Default to Gemini Flash (FREE, 60 req/min) instead of demo mode
let aiConfig: AIProviderConfig = {
  provider: (process.env.AI_PROVIDER as AIProvider) || 'gemini',
  apiKey: process.env.AI_API_KEY || '',
  model: process.env.AI_MODEL || 'gemini-2.0-flash',  // Using stable 2.0 model
  maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
  temperature: parseFloat(process.env.AI_TEMPERATURE || '0'),
  demoMode: !process.env.AI_API_KEY, // Will be true until API key is set
};

// Track if API key has been set (write-once protection)
let apiKeyLocked = false;

/**
 * Load configuration from external JSON file (for CLI/deployment)
 */
function loadExternalConfig(): boolean {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const config = JSON.parse(configData);
      
      if (config.ai) {
        if (config.ai.provider) aiConfig.provider = config.ai.provider;
        if (config.ai.apiKey) {
          aiConfig.apiKey = config.ai.apiKey;
          apiKeyLocked = true; // Config file sets lock
        }
        if (config.ai.model) aiConfig.model = config.ai.model;
        if (config.ai.maxTokens) aiConfig.maxTokens = config.ai.maxTokens;
        if (config.ai.temperature !== undefined) aiConfig.temperature = config.ai.temperature;
        aiConfig.demoMode = !aiConfig.apiKey;
      }
      
      // Update encryption key if provided
      if (config.security?.encryptionKey) {
        process.env.ENCRYPTION_KEY = config.security.encryptionKey;
      }
      
      console.log(`✅ Loaded config from: ${CONFIG_FILE_PATH}`);
      if (aiConfig.apiKey) {
        console.log(`🔐 API key loaded from config: ${maskApiKey(aiConfig.apiKey)}`);
        console.log('🔒 API key is LOCKED (write-once mode - delete to change)');
      }
      return true;
    }
  } catch (error) {
    console.error(`⚠️  Failed to load config from ${CONFIG_FILE_PATH}:`, error);
  }
  return false;
}

// Try to load from external config file first
const configFileLoaded = loadExternalConfig();

// Load config from database on startup (async, non-blocking)
setTimeout(async () => {
  // Skip database load if config file was used
  if (configFileLoaded && aiConfig.apiKey) {
    console.log('ℹ️  Using external config file, skipping database load');
    return;
  }
  
  try {
    const result = await db.query(
      'SELECT value FROM settings WHERE key = $1',
      ['ai_config']
    );
    if (result.rows.length > 0) {
      const savedConfig = JSON.parse(result.rows[0].value);
      
      // Decrypt API key if present
      if (savedConfig.apiKey) {
        savedConfig.apiKey = decrypt(savedConfig.apiKey);
        apiKeyLocked = true; // Database key sets lock
      }
      
      aiConfig = { ...aiConfig, ...savedConfig };
      console.log(`✅ Loaded AI config from database: ${aiConfig.provider}`);
      
      // Verify decrypted key works
      if (aiConfig.apiKey) {
        console.log(`🔐 Decrypted API key: ${maskApiKey(aiConfig.apiKey)}`);
        console.log('🔒 API key is LOCKED (write-once mode - delete to change)');
      }
    }
  } catch {
    console.log('ℹ️  No saved AI config found, using defaults');
  }
}, 2000); // Wait 2 seconds for database to initialize

/**
 * GET /api/settings/ai - Get current AI configuration
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({
      success: true,
      provider: aiConfig.provider,
      apiKey: '', // Never send actual key
      hasApiKey: !!aiConfig.apiKey,
      apiKeyLocked, // Tell UI if key is locked (write-once)
      model: aiConfig.model,
      maxTokens: aiConfig.maxTokens,
      temperature: aiConfig.temperature,
      demoMode: aiConfig.demoMode,
      availableProviders: Object.keys(AI_PROVIDERS).map(key => ({
        id: key,
        ...AI_PROVIDERS[key as AIProvider],
      })),
    });
  } catch (error: any) {
    console.error('Error getting AI config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration',
      message: error.message,
    });
  }
});

/**
 * POST /api/settings/ai - Update AI configuration
 * Security: API keys should be sent over HTTPS in production
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, apiKey, model, maxTokens, temperature, demoMode } = req.body;

    // 🔒 WRITE-ONCE PROTECTION: Prevent API key updates
    if (apiKeyLocked && apiKey && apiKey !== aiConfig.apiKey) {
      console.warn('🔒 Blocked attempt to update locked API key');
      res.status(403).json({
        success: false,
        error: 'API key already set and locked',
        details: 'Use DELETE /api/settings/ai/key to remove existing key before adding new one',
        code: 'KEY_ALREADY_EXISTS'
      });
      return;
    }

    // Security warning for HTTP in production
    if (process.env.NODE_ENV === 'production' && req.protocol !== 'https') {
      console.warn('⚠️  WARNING: API key sent over HTTP! Use HTTPS in production.');
    }

    // Update provider
    if (provider && Object.keys(AI_PROVIDERS).includes(provider)) {
      aiConfig.provider = provider as AIProvider;
      
      // Update to default model for new provider if not specified
      if (!model) {
        aiConfig.model = AI_PROVIDERS[provider as AIProvider].defaultModel;
      }
    }

    // Update API key if provided (encrypt before storing)
    if (apiKey && apiKey.trim()) {
      aiConfig.apiKey = apiKey.trim();
      apiKeyLocked = true; // Lock after first save
      console.log(`🔐 API key updated for ${aiConfig.provider}: ${maskApiKey(apiKey)}`);
      console.log('🔒 API key is now LOCKED (write-once mode)');
    }

    // Update model config
    if (model) aiConfig.model = model;
    if (maxTokens) aiConfig.maxTokens = parseInt(maxTokens.toString());
    if (temperature !== undefined) aiConfig.temperature = parseFloat(temperature.toString());
    if (demoMode !== undefined) aiConfig.demoMode = demoMode;

    // Encrypt API key for database storage
    const encryptedKey = aiConfig.apiKey ? encrypt(aiConfig.apiKey) : '';

    // Persist to database with encrypted key
    await db.query(
      `INSERT INTO settings (key, value, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, updated_at = NOW()`,
      [
        'ai_config',
        JSON.stringify({
          provider: aiConfig.provider,
          apiKey: encryptedKey, // Store encrypted
          hasApiKey: !!aiConfig.apiKey,
          model: aiConfig.model,
          maxTokens: aiConfig.maxTokens,
          temperature: aiConfig.temperature,
          demoMode: aiConfig.demoMode,
        }),
      ]
    );

    console.log(`✅ AI config updated: ${aiConfig.provider} / ${aiConfig.model}`);

    res.json({
      success: true,
      message: 'AI configuration updated successfully',
      securityNote: req.protocol !== 'https' ? 'Use HTTPS in production to secure API keys' : undefined,
      config: {
        provider: aiConfig.provider,
        hasApiKey: !!aiConfig.apiKey,
        model: aiConfig.model,
        maxTokens: aiConfig.maxTokens,
        temperature: aiConfig.temperature,
        demoMode: aiConfig.demoMode,
      },
    });
  } catch (error: any) {
    console.error('Error updating AI config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/settings/ai/key - Delete API key (write-once protection)
 * Allows users to remove the locked API key and set a new one
 */
router.delete('/key', deleteOperationRateLimiter, async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('🗑️  Deleting API key...');
    
    // Clear API key and unlock
    aiConfig.apiKey = '';
    apiKeyLocked = false;
    aiConfig.demoMode = true;
    
    // Update database
    await db.query(
      `INSERT INTO settings (key, value, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, updated_at = NOW()`,
      [
        'ai_config',
        JSON.stringify({
          provider: aiConfig.provider,
          apiKey: '', // Empty encrypted key
          model: aiConfig.model,
          maxTokens: aiConfig.maxTokens,
          temperature: aiConfig.temperature,
          demoMode: true,
        }),
      ]
    );
    
    console.log('✅ API key deleted and unlocked');
    
    res.json({
      success: true,
      message: 'API key deleted successfully',
      config: {
        provider: aiConfig.provider,
        hasApiKey: false,
        model: aiConfig.model,
        demoMode: true,
      },
    });
  } catch (error: any) {
    console.error('Error deleting API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key',
      message: error.message,
    });
  }
});

/**
 * POST /api/settings/ai/test - Test AI provider API key
 */
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, apiKey } = req.body;

    if (!provider || !apiKey) {
      res.status(400).json({
        success: false,
        error: 'Provider and API key are required',
      });
      return;
    }

    const result = await testProviderApiKey(provider, apiKey);

    if (result.success) {
      res.json({
        success: true,
        message: `${AI_PROVIDERS[provider as AIProvider].name} API key is valid!`,
        model: result.model,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'API key validation failed',
      });
    }
  } catch (error: any) {
    console.error('Error testing API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test API key',
      message: error.message,
    });
  }
});

/**
 * GET /api/settings/ai/providers - Get available AI providers
 */
router.get('/providers', async (_req: Request, res: Response): Promise<void> => {
  try {
    const providers = Object.entries(AI_PROVIDERS).map(([id, info]) => ({
      id,
      ...info,
    }));

    res.json({
      success: true,
      providers,
    });
  } catch (error: any) {
    console.error('Error getting providers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get providers',
      message: error.message,
    });
  }
});

/**
 * GET /api/settings/ai/providers/:provider/models
 * Fetch available models for a specific provider
 * For Gemini: Dynamically fetches from API if key provided
 */
router.get('/providers/:provider/models', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = req.params;
    const apiKey = req.headers['x-api-key'] as string;

    // Validate provider
    if (!AI_PROVIDERS[provider as AIProvider]) {
      res.status(404).json({
        success: false,
        error: 'Provider not found',
      });
      return;
    }

    // For Gemini, fetch dynamically if API key provided
    if (provider === 'gemini' && apiKey) {
      const models = await getGeminiModels(apiKey);
      res.json({
        success: true,
        models,
        cached: true, // Indicates models might be from cache
      });
      return;
    }

    // Return static models for other providers or if no API key
    const providerInfo = AI_PROVIDERS[provider as AIProvider];
    res.json({
      success: true,
      models: providerInfo.models,
      cached: false,
    });
  } catch (error: any) {
    console.error('Error fetching provider models:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch models',
      message: error.message,
    });
  }
});

/**
 * Export getters for use in other routes
 */
export function getAIConfig(): AIProviderConfig {
  return aiConfig;
}

export function getAIApiKey(): string {
  return aiConfig.apiKey;
}

export default router;
