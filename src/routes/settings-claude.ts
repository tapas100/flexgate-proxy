/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Claude AI Settings Routes
 * 
 * Endpoints for managing Claude API configuration
 */

import express, { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import database from '../database/index';

const router = express.Router();
const db = database;

// In-memory store for API key (in production, use env variables or secure vault)
let claudeApiKey = process.env.ANTHROPIC_API_KEY || '';
const claudeConfig = {
  model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
  maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '2000'),
  temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0'),
  demoMode: !process.env.ANTHROPIC_API_KEY, // Default to demo mode if no API key
};

/**
 * GET /api/settings/claude - Get current Claude configuration
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({
      success: true,
      apiKey: '', // Never send actual key to frontend
      hasApiKey: !!claudeApiKey,
      model: claudeConfig.model,
      maxTokens: claudeConfig.maxTokens,
      temperature: claudeConfig.temperature,
      demoMode: claudeConfig.demoMode,
    });
  } catch (error: any) {
    console.error('Error getting Claude config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration',
      message: error.message,
    });
  }
});

/**
 * POST /api/settings/claude - Update Claude configuration
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { apiKey, model, maxTokens, temperature, demoMode } = req.body;

    // Update API key if provided
    if (apiKey && apiKey.trim()) {
      claudeApiKey = apiKey.trim();
    }

    // Update model config
    if (model) claudeConfig.model = model;
    if (maxTokens) claudeConfig.maxTokens = parseInt(maxTokens);
    if (temperature !== undefined) claudeConfig.temperature = parseFloat(temperature);
    if (demoMode !== undefined) claudeConfig.demoMode = demoMode;

    // Store in database for persistence
    await db.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, updated_at = NOW()`,
      ['claude_config', JSON.stringify({
        hasApiKey: !!claudeApiKey,
        model: claudeConfig.model,
        maxTokens: claudeConfig.maxTokens,
        temperature: claudeConfig.temperature,
        demoMode: claudeConfig.demoMode,
      })]
    );

    res.json({
      success: true,
      message: 'Claude settings updated successfully',
      config: {
        hasApiKey: !!claudeApiKey,
        model: claudeConfig.model,
        maxTokens: claudeConfig.maxTokens,
        temperature: claudeConfig.temperature,
        demoMode: claudeConfig.demoMode,
      },
    });
  } catch (error: any) {
    console.error('Error updating Claude config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration',
      message: error.message,
    });
  }
});

/**
 * POST /api/settings/claude/test - Test Claude API key
 */
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      res.status(400).json({
        success: false,
        message: 'API key is required',
      });
      return;
    }

    // Test the API key with a simple request
    const anthropic = new Anthropic({ apiKey });
    
    const startTime = Date.now();
    await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: 'Hi'
      }]
    });
    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      message: 'API key is valid and working!',
      model: 'claude-3-5-sonnet-20241022',
      responseTime,
    });
  } catch (error: any) {
    console.error('Error testing Claude API key:', error);
    
    let errorMessage = 'API key test failed';
    if (error.status === 401) {
      errorMessage = 'Invalid API key. Please check your key and try again.';
    } else if (error.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.json({
      success: false,
      message: errorMessage,
    });
  }
});

// Export the configured API key getter
export function getClaudeApiKey(): string {
  return claudeApiKey;
}

export function getClaudeConfig() {
  return claudeConfig;
}

export default router;
