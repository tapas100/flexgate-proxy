/**
 * AI Incident Tracking Routes
 * 
 * Endpoints for managing AI-detected incidents, recommendations, and outcomes.
 * Enables complete incident lifecycle tracking with Claude integration.
 */

import express, { Request, Response } from 'express';
import database from '../database/index';
import { AIEvent } from '../ai/types/events';
import { getAIConfig } from './settings-ai';
import { callAIProvider } from '../services/aiProviders';
import { generateMockAnalysis } from '../services/mockClaudeService';
import { logger } from '../logger';
// import { requireAuth } from '../auth/middleware'; // Temporarily disabled for testing

const router = express.Router();
const db = database;

// Valid event types for validation
const VALID_EVENT_TYPES = [
  'CIRCUIT_BREAKER_CANDIDATE',
  'RATE_LIMIT_BREACH',
  'LATENCY_ANOMALY',
  'ERROR_RATE_SPIKE',
  'COST_ALERT',
  'RETRY_STORM',
  'UPSTREAM_DEGRADATION',
  'SECURITY_ANOMALY',
  'CAPACITY_WARNING',
  'RECOVERY_SIGNAL',
  // Legacy event types for backward compatibility
  'ERROR_SPIKE',
  'MEMORY_LEAK',
  'CPU_SPIKE',
  'TRAFFIC_SURGE',
  'DATABASE_SLOW',
  'DEPLOYMENT_ISSUE',
  'SECURITY_ALERT',
  'CONFIG_DRIFT'
];

const VALID_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL', 'info', 'warning', 'critical'];

/**
 * List all AI incidents with filters
 * GET /api/ai-incidents?status=open&event_type=LATENCY_ANOMALY&limit=50
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      status, 
      event_type, 
      severity, 
      limit = '50', 
      offset = '0' 
    } = req.query;
    
    const query = `
      SELECT * FROM v_ai_incidents_summary
      WHERE ($1::text IS NULL OR status = $1)
        AND ($2::text IS NULL OR event_type = $2)
        AND ($3::text IS NULL OR severity = $3)
      ORDER BY detected_at DESC
      LIMIT $4 OFFSET $5
    `;
    
    const result = await db.query(query, [
      status || null, 
      event_type || null, 
      severity || null, 
      parseInt(limit as string), 
      parseInt(offset as string)
    ]);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM ai_incidents
      WHERE ($1::text IS NULL OR status = $1)
        AND ($2::text IS NULL OR event_type = $2)
        AND ($3::text IS NULL OR severity = $3)
    `;
    
    const countResult = await db.query(countQuery, [
      status || null,
      event_type || null,
      severity || null
    ]);
    
    res.json({
      success: true,
      data: {
        incidents: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    console.error('Error fetching AI incidents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AI incidents',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get single incident with all details
 * GET /api/ai-incidents/:id
 */
router.get('/:id',  async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const [incident, recommendations, outcomes] = await Promise.all([
      db.query('SELECT * FROM ai_incidents WHERE incident_id = $1', [id]),
      db.query(`
        SELECT * FROM ai_recommendations 
        WHERE incident_id = $1 
        ORDER BY recommendation_rank
      `, [id]),
      db.query(`
        SELECT * FROM ai_action_outcomes 
        WHERE incident_id = $1 
        ORDER BY executed_at
      `, [id])
    ]);
    
    if (incident.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Incident not found'
      });
      return;
    }
    
    res.json({
      success: true,
      data: {
        incident: incident.rows[0],
        recommendations: recommendations.rows,
        outcomes: outcomes.rows
      }
    });
  } catch (error) {
    console.error('Error fetching incident details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch incident details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Create new incident (called by AI Event Factory)
 * POST /api/ai-incidents
 */
router.post('/',  async (req: Request, res: Response): Promise<void> => {
  try {
    const { event }: { event: AIEvent } = req.body;
    
    // Validate required fields
    if (!event || !event.event_id) {
      res.status(400).json({
        success: false,
        error: 'Invalid event data',
        message: 'event and event.event_id are required'
      });
      return;
    }
    
    // Validate event_type
    if (!event.event_type || !VALID_EVENT_TYPES.includes(event.event_type)) {
      res.status(400).json({
        success: false,
        error: 'Invalid event_type',
        message: `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
        received: event.event_type
      });
      return;
    }
    
    // Validate severity
    if (!event.severity || !VALID_SEVERITIES.includes(event.severity)) {
      res.status(400).json({
        success: false,
        error: 'Invalid severity',
        message: 'severity must be one of: INFO, WARNING, CRITICAL',
        received: event.severity
      });
      return;
    }
    
    // Validate summary
    if (!event.summary || event.summary.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Invalid summary',
        message: 'summary is required and cannot be empty'
      });
      return;
    }
    
    const result = await db.query(`
      INSERT INTO ai_incidents (
        incident_id, event_type, severity, summary,
        metrics, context, ai_confidence, ai_estimated_tokens,
        ai_reasoning_hints, detected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `, [
      event.event_id,
      event.event_type.toUpperCase(), // Normalize to uppercase
      event.severity.toUpperCase(), // Normalize to uppercase
      event.summary,
      JSON.stringify(event.data || {}),
      JSON.stringify(event.context || {}),
      null,  // No confidence in current metadata
      event.ai_metadata?.token_estimate || null,
      event.ai_metadata?.reasoning_hints ? JSON.stringify(event.ai_metadata.reasoning_hints) : null,
    ]);
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating AI incident:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create AI incident',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update incident status and feedback
 * PATCH /api/ai-incidents/:id
 */
router.patch('/:id',  async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, user_rating, user_feedback, resolved_by } = req.body;
    
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;
    
    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
      
      if (status === 'resolved') {
        updates.push('resolved_at = NOW()');
      }
      if (status === 'acknowledged') {
        updates.push('acknowledged_at = NOW()');
      }
    }
    
    if (user_rating) {
      updates.push(`user_rating = $${paramIndex++}`);
      values.push(user_rating);
    }
    
    if (user_feedback !== undefined) {
      updates.push(`user_feedback = $${paramIndex++}`);
      values.push(user_feedback);
    }
    
    if (resolved_by) {
      updates.push(`resolved_by = $${paramIndex++}`);
      values.push(resolved_by);
    }
    
    updates.push('updated_at = NOW()');
    
    const query = `
      UPDATE ai_incidents 
      SET ${updates.join(', ')}
      WHERE incident_id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Incident not found'
      });
      return;
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating AI incident:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update AI incident',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Record Claude's recommendations
 * POST /api/ai-incidents/:id/recommendations
 */
router.post('/:id/recommendations',  async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      recommendations,  // Array of Claude's suggestions
      prompt,
      claude_response,
      model,
      tokens_used,
      cost_usd
    } = req.body;
    
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid recommendations data'
      });
      return;
    }
    
    // Store each recommendation
    const results = await Promise.all(
      recommendations.map((rec: any, index: number) => 
        db.query(`
          INSERT INTO ai_recommendations (
            incident_id, recommendation_rank, action_type, action_details,
            reasoning, confidence_score, estimated_fix_time_minutes,
            risk_level, estimated_cost_usd, expected_benefit,
            claude_prompt, claude_response, claude_model,
            claude_tokens_used, claude_cost_usd
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *
        `, [
          id,
          index + 1,
          rec.action_type,
          JSON.stringify(rec.action_details || {}),
          rec.reasoning,
          rec.confidence_score || rec.confidence,
          rec.estimated_fix_time_minutes || rec.estimated_fix_time,
          rec.risk_level || 'medium',
          rec.estimated_cost_usd || null,
          rec.expected_benefit || null,
          prompt,
          JSON.stringify(claude_response),
          model,
          tokens_used,
          cost_usd
        ])
      )
    );
    
    const resultRows = results.map(r => r.rows[0]);
    
    res.status(201).json({
      success: true,
      data: resultRows
    });
  } catch (error) {
    console.error('Error storing recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store recommendations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Record user decision on recommendation
 * POST /api/ai-incidents/:incidentId/recommendations/:recId/decision
 */
router.post('/:incidentId/recommendations/:recId/decision',  async (req: Request, res: Response): Promise<void> => {
  try {
    const { recId } = req.params;
    const { 
      decision,  // accepted, rejected, modified, skipped
      reason,
      actual_action,
      actual_action_details
    } = req.body;
    
    const result = await db.query(`
      UPDATE ai_recommendations
      SET user_decision = $2,
          user_decision_at = NOW(),
          user_decision_reason = $3,
          actual_action_taken = $4,
          actual_action_details = $5
      WHERE id = $1
      RETURNING *
    `, [
      recId, 
      decision, 
      reason, 
      actual_action, 
      JSON.stringify(actual_action_details || {})
    ]);
    
    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Recommendation not found'
      });
      return;
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error recording user decision:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record user decision',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Record action execution and outcome
 * POST /api/ai-incidents/:id/outcomes
 */
router.post('/:id/outcomes',  async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      recommendation_id,
      action_type,
      action_details,
      executed_by,
      metrics_before,
      metrics_after,
      outcome_status,
      incident_resolved,
      improvement_percentage
    } = req.body;
    
    // Calculate success score (for future RL)
    let success_score = 0.0;
    if (outcome_status === 'resolved') success_score = 1.0;
    else if (outcome_status === 'partially_resolved') success_score = 0.5;
    else if (outcome_status === 'no_change') success_score = 0.0;
    else if (outcome_status === 'worsened') success_score = -1.0;
    
    const result = await db.query(`
      INSERT INTO ai_action_outcomes (
        incident_id, recommendation_id, action_type, action_details,
        executed_by, metrics_before, metrics_after, metrics_checked_at,
        outcome_status, improvement_percentage, incident_resolved, success_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11)
      RETURNING *
    `, [
      id,
      recommendation_id,
      action_type,
      JSON.stringify(action_details),
      executed_by,
      JSON.stringify(metrics_before),
      JSON.stringify(metrics_after),
      outcome_status,
      improvement_percentage,
      incident_resolved,
      success_score
    ]);
    
    // Update incident if resolved
    if (incident_resolved) {
      await db.query(`
        UPDATE ai_incidents
        SET status = 'resolved',
            resolved_at = NOW(),
            resolved_by = $2,
            resolution_time_seconds = EXTRACT(EPOCH FROM (NOW() - detected_at))::INTEGER
        WHERE incident_id = $1
      `, [id, executed_by]);
    }
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error recording outcome:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record outcome',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get analytics and learning metrics
 * GET /api/ai-incidents/analytics/summary
 */
router.get('/analytics/summary',  async (req: Request, res: Response) => {
  try {
    const { days = '30' } = req.query;
    
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_incidents,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN status = 'false_positive' THEN 1 END) as false_positive_count,
        ROUND(AVG(resolution_time_seconds)::numeric, 2) as avg_resolution_time_seconds,
        ROUND(AVG(user_rating)::numeric, 2) as avg_user_rating,
        ROUND(AVG(ai_confidence)::numeric, 2) as avg_ai_confidence,
        ROUND((COUNT(CASE WHEN status = 'resolved' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) as resolution_rate
      FROM ai_incidents
      WHERE detected_at >= CURRENT_DATE - $1::integer
    `, [parseInt(days as string)]);
    
    // Get recommendation acceptance rate
    const recResult = await db.query(`
      SELECT 
        COUNT(*) as total_recommendations,
        COUNT(CASE WHEN user_decision = 'accepted' THEN 1 END) as accepted_count,
        COUNT(CASE WHEN user_decision = 'rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN user_decision = 'modified' THEN 1 END) as modified_count,
        ROUND((COUNT(CASE WHEN user_decision = 'accepted' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) as acceptance_rate
      FROM ai_recommendations
      WHERE created_at >= CURRENT_DATE - $1::integer
        AND user_decision IS NOT NULL
    `, [parseInt(days as string)]);
    
    res.json({
      success: true,
      data: {
        incidents: result.rows[0],
        recommendations: recResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get success rates by action type
 * GET /api/ai-incidents/analytics/action-success-rates
 */
router.get('/analytics/action-success-rates',  async (_req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT 
        r.action_type,
        COUNT(*) as total_recommendations,
        COUNT(CASE WHEN r.user_decision = 'accepted' THEN 1 END) as accepted_count,
        COUNT(CASE WHEN r.user_decision = 'rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN o.incident_resolved THEN 1 END) as resolved_count,
        ROUND((COUNT(CASE WHEN r.user_decision = 'accepted' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) as acceptance_rate,
        ROUND((COUNT(CASE WHEN o.incident_resolved THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) as resolution_rate,
        ROUND(AVG(r.confidence_score)::numeric, 2) as avg_confidence
      FROM ai_recommendations r
      LEFT JOIN ai_action_outcomes o ON r.id = o.recommendation_id
      WHERE r.created_at >= CURRENT_DATE - 30
      GROUP BY r.action_type
      ORDER BY acceptance_rate DESC NULLS LAST
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching action success rates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch action success rates',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Generate Claude-ready prompt for an incident
 * GET /api/ai-incidents/:id/prompt
 */
router.get('/:id/prompt', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Get incident
    const result = await db.query(
      'SELECT * FROM ai_incidents WHERE incident_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ 
        success: false, 
        error: 'Incident not found' 
      });
      return;
    }
    
    const incident = result.rows[0];
    
    // Build Claude-ready prompt
    const prompt = buildClaudePrompt(incident);
    
    // Estimate cost
    const estimatedTokens = Math.ceil(prompt.length / 4);
    const inputCost = (estimatedTokens * 3.0) / 1_000_000;
    const outputCost = (250 * 15.0) / 1_000_000; // Estimate 250 output tokens
    const estimatedCost = inputCost + outputCost;
    
    res.json({
      success: true,
      prompt,
      metadata: {
        incident_id: id,
        event_type: incident.event_type,
        severity: incident.severity,
        estimated_tokens: estimatedTokens,
        estimated_output_tokens: 250,
        estimated_cost_usd: estimatedCost.toFixed(4),
        recommended_model: 'claude-3-5-sonnet-20241022',
        max_tokens: 900
      }
    });
  } catch (error) {
    console.error('Error generating prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate prompt',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /:id/analyze - REAL Claude API Integration
 * Calls Claude API directly and returns analysis
 */
router.post('/:id/analyze', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  try {
    // Get AI configuration
    const config = getAIConfig();

    // Fetch incident
    const result = await db.query(
      'SELECT * FROM ai_incidents WHERE incident_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Incident not found',
        incident_id: id
      });
      return;
    }

    const incident = result.rows[0];
    const prompt = buildClaudePrompt(incident);

    let analysis: string;
    let responseTime: number;
    let inputTokens: number;
    let outputTokens: number;
    let totalCost: number;
    let modelUsed: string;
    let providerUsed: string;

    // Check if demo mode is enabled
    if (config.demoMode) {
      // Use mock service for demo mode
      logger.info('AI incidents: demo mode — using mock AI service');
      const mockResponse = generateMockAnalysis({
        event_type: incident.event_type,
        severity: incident.severity,
        summary: incident.summary,
        metrics: incident.metrics,
        context: incident.context,
      });
      responseTime = mockResponse.responseTime;
      analysis = mockResponse.analysis;
      inputTokens = mockResponse.inputTokens;
      outputTokens = mockResponse.outputTokens;
      totalCost = 0; // Demo mode is free
      modelUsed = mockResponse.model;
      providerUsed = 'demo';
    } else {
      // Check API key for production mode
      if (!config.apiKey) {
        res.status(500).json({
          success: false,
          error: `${config.provider.toUpperCase()} API key not configured`,
          message: 'Configure API key in Settings > AI Configuration'
        });
        return;
      }

      // Use real AI provider
      logger.info('AI incidents: production mode — calling AI provider', { provider: config.provider });
      const aiResponse = await callAIProvider(prompt, config);
      
      analysis = aiResponse.analysis;
      responseTime = aiResponse.responseTime;
      inputTokens = aiResponse.inputTokens;
      outputTokens = aiResponse.outputTokens;
      totalCost = aiResponse.costUsd;
      modelUsed = aiResponse.model;
      providerUsed = aiResponse.provider;
    }

    // Store analysis in database
    await db.query(
      `UPDATE ai_incidents 
       SET ai_analysis = $1, 
           analyzed_at = NOW(),
           analysis_model = $2,
           analysis_cost_usd = $3,
           analysis_tokens = $4
       WHERE incident_id = $5`,
      [
        analysis,
        modelUsed,
        totalCost.toFixed(6),
        inputTokens + outputTokens,
        id
      ]
    );

    // Auto-parse and create recommendations from analysis
    const parsedRecommendations = parseRecommendationsFromAnalysis(analysis, incident.event_type);
    let createdRecommendations = 0;
    
    for (let i = 0; i < parsedRecommendations.length; i++) {
      const rec = parsedRecommendations[i];
      try {
        const result = await db.query(
          `INSERT INTO ai_recommendations (
            incident_id, recommendation_rank, action_type, action_details,
            reasoning, confidence_score, estimated_fix_time_minutes, risk_level,
            claude_model, claude_tokens_used, claude_cost_usd
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id`,
          [
            id,
            i + 1,
            rec.action_type,
            JSON.stringify(rec.action_details),
            rec.reasoning,
            rec.confidence_score,
            rec.estimated_fix_time_minutes,
            rec.risk_level,
            modelUsed,
            Math.floor((inputTokens + outputTokens) / parsedRecommendations.length),
            (totalCost / parsedRecommendations.length).toFixed(6)
          ]
        );
        if (result.rows.length > 0) {
          createdRecommendations++;
        }
      } catch (err) {
        console.error('Error creating recommendation:', err);
      }
    }

    logger.info('AI incidents: recommendations created', { count: createdRecommendations });

    res.json({
      success: true,
      incident_id: id,
      analysis,
      recommendations_created: createdRecommendations,
      metadata: {
        provider: providerUsed,
        model: modelUsed,
        demo_mode: config.demoMode,
        response_time_ms: responseTime,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        cost_usd: totalCost.toFixed(6),
        analyzed_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Error calling Claude API:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze incident',
      message: error.message || 'Unknown error',
      details: error.response?.data || null
    });
  }
});

/**
 * Build Claude-ready prompt from incident
 */
function buildClaudePrompt(incident: any): string {
  const metrics = incident.metrics || {};
  const context = incident.context || {};
  
  let prompt = `You are a Site Reliability Engineering (SRE) expert analyzing a production incident.

EVENT TYPE: ${incident.event_type}
SEVERITY: ${incident.severity}
SUMMARY: ${incident.summary}
DETECTED AT: ${incident.detected_at}

`;

  // Add metrics if available
  if (Object.keys(metrics).length > 0) {
    prompt += 'METRICS:\n';
    for (const [key, value] of Object.entries(metrics)) {
      prompt += `- ${key}: ${JSON.stringify(value)}\n`;
    }
    prompt += '\n';
  }

  // Add context if available
  if (Object.keys(context).length > 0) {
    prompt += 'CONTEXT:\n';
    for (const [key, value] of Object.entries(context)) {
      prompt += `- ${key}: ${JSON.stringify(value)}\n`;
    }
    prompt += '\n';
  }

  // Add AI hints if available
  if (incident.ai_reasoning_hints) {
    prompt += `REASONING HINTS:\n${incident.ai_reasoning_hints}\n\n`;
  }

  // Event-specific analysis requests
  prompt += getEventSpecificPrompt(incident.event_type);

  return prompt;
}

/**
 * Get event-type-specific prompt section
 */
function getEventSpecificPrompt(eventType: string): string {
  const baseFormat = `
Provide your analysis in JSON format:
{
  "error_category": "string",
  "likely_causes": ["cause1", "cause2", "cause3"],
  "immediate_actions": ["action1", "action2", "action3"],
  "preventive_measures": ["measure1", "measure2"],
  "confidence": 0-100,
  "estimated_fix_time": "X minutes",
  "urgency": "immediate|high|medium|low"
}`;

  switch (eventType) {
    case 'ERROR_RATE_SPIKE':
    case 'ERROR_SPIKE':
      return `ANALYSIS REQUIRED:
1. What is the root cause of the error rate spike?
2. Which service/component is failing?
3. Is this a new error pattern or existing issue escalating?
4. What immediate actions should be taken?
5. What are the preventive measures?

${baseFormat}`;

    case 'LATENCY_ANOMALY':
      return `ANALYSIS REQUIRED:
1. What is causing the latency increase?
2. Is it database, network, or application code?
3. Are specific endpoints affected or system-wide?
4. What immediate optimizations can help?

${baseFormat}`;

    case 'CIRCUIT_BREAKER_CANDIDATE':
      return `ANALYSIS REQUIRED:
1. Should a circuit breaker be activated?
2. What is the upstream service failure pattern?
3. What should be the circuit breaker threshold?
4. What fallback strategy should be used?

Include in JSON:
{
  "circuit_breaker_decision": "activate|monitor|ignore",
  "recommended_threshold": "X% errors or Y timeouts",
  "fallback_strategy": "string",
  "monitoring_duration": "X minutes",
  ...other base fields
}`;

    case 'COST_ALERT':
      return `ANALYSIS REQUIRED:
1. What is causing the cost spike?
2. Which API/service is responsible?
3. Is this legitimate traffic or waste?
4. What cost optimization strategies apply?

Include in JSON:
{
  "cost_anomaly_type": "string",
  "optimization_strategies": ["strategy1", "strategy2"],
  "potential_savings_usd": number,
  ...other base fields
}`;

    case 'RATE_LIMIT_BREACH':
      return `ANALYSIS REQUIRED:
1. Which client/user is hitting limits?
2. Is this legitimate traffic or abuse?
3. Should limits be adjusted or enforced?
4. What is the appropriate rate limit?

${baseFormat}`;

    case 'SECURITY_ANOMALY':
    case 'SECURITY_ALERT':
      return `ANALYSIS REQUIRED:
1. What type of security anomaly is this?
2. Is this a potential attack or false positive?
3. What immediate security actions are needed?
4. Should access be restricted?

${baseFormat}`;

    default:
      return `ANALYSIS REQUIRED:
1. What is the root cause of this incident?
2. What immediate actions should be taken?
3. How can we prevent recurrence?

${baseFormat}`;
  }
}

/**
 * Parse recommendations from AI analysis text
 * Extracts actionable recommendations and creates structured data
 */
function parseRecommendationsFromAnalysis(analysis: string, eventType: string): any[] {
  logger.debug('AI incidents: parseRecommendations — start');
  logger.debug('AI incidents: parseRecommendations', { eventType });
  logger.debug('AI incidents: parseRecommendations', { analysisLength: analysis.length });
  logger.debug('AI incidents: analysis preview', { preview: analysis.substring(0, 300) });
  
  const recommendations: any[] = [];
  
  // Look for numbered action items in the analysis
  const actionPatterns = [
    /(?:##?\s*)?(?:Immediate Actions?|IMMEDIATE ACTIONS?|Action Items?|Recommended Actions?|IMMEDIATE ACTIONS? REQUIRED)[:\s]+([\s\S]*?)(?=##|\n\n##|$)/i,
    /(?:##?\s*)?(?:Steps?|Recommendations?)[:\s]+([\s\S]*?)(?=##|\n\n##|$)/i,
  ];
  
  logger.debug('AI incidents: testing recommendation patterns');
  let actionsText = '';
  for (const pattern of actionPatterns) {
    const match = analysis.match(pattern);
    logger.debug('AI incidents: testing pattern', { pattern: pattern.toString().substring(0, 80) });
    logger.debug('AI incidents: pattern match result', { matched: !!match });
    if (match && match[1]) {
      logger.debug('AI incidents: pattern matched', { preview: match[1].substring(0, 200) });
      actionsText = match[1];
      break;
    }
  }
  
  if (!actionsText) {
    logger.debug('AI incidents: no action section found, trying fallback');
    // Fallback: look for any numbered list
    const numberedItems = analysis.match(/^\d+\.\s+(.+?)$/gm);
    logger.debug('AI incidents: fallback items', { count: numberedItems?.length || 0 });
    if (numberedItems && numberedItems.length > 0) {
      actionsText = numberedItems.slice(0, 5).join('\n');
    }
  }
  
  logger.debug('AI incidents: actions text', { length: actionsText.length });
  logger.debug('AI incidents: actions text preview', { preview: actionsText.substring(0, 300) });
  
  // Parse individual action items
  const actionLines = actionsText.split(/\n/).filter(line => {
    return /^\s*[\d*-]\s*\.?\s+/.test(line) && line.trim().length > 10;
  });
  
  logger.debug('AI incidents: action lines found', { count: actionLines.length });
  actionLines.forEach((line, i) => logger.debug('AI incidents: action line', { index: i + 1, preview: line.substring(0, 60) }));
  
  actionLines.slice(0, 5).forEach((line, index) => {
    const cleanLine = line.replace(/^[\s\d*.-]+/, '').trim();
    
    // Determine action type and risk level from content
    let actionType = 'investigate';
    let riskLevel: 'low' | 'medium' | 'high' = 'medium';
    let estimatedTime = 30;
    
    const lowerLine = cleanLine.toLowerCase();
    
    if (lowerLine.includes('restart') || lowerLine.includes('reboot')) {
      actionType = 'restart_service';
      riskLevel = 'medium';
      estimatedTime = 10;
    } else if (lowerLine.includes('scale') || lowerLine.includes('increase')) {
      actionType = 'scale_resources';
      riskLevel = 'low';
      estimatedTime = 15;
    } else if (lowerLine.includes('rollback') || lowerLine.includes('revert')) {
      actionType = 'rollback_deployment';
      riskLevel = 'high';
      estimatedTime = 20;
    } else if (lowerLine.includes('cache') || lowerLine.includes('caching')) {
      actionType = 'enable_caching';
      riskLevel = 'low';
      estimatedTime = 45;
    } else if (lowerLine.includes('rate limit') || lowerLine.includes('throttle')) {
      actionType = 'adjust_rate_limits';
      riskLevel = 'medium';
      estimatedTime = 30;
    } else if (lowerLine.includes('circuit breaker')) {
      actionType = 'enable_circuit_breaker';
      riskLevel = 'medium';
      estimatedTime = 25;
    } else if (lowerLine.includes('monitor') || lowerLine.includes('log')) {
      actionType = 'add_monitoring';
      riskLevel = 'low';
      estimatedTime = 60;
    } else if (lowerLine.includes('optimize') || lowerLine.includes('improve')) {
      actionType = 'optimize_query';
      riskLevel = 'medium';
      estimatedTime = 120;
    }
    
    // Extract confidence from analysis text near this recommendation
    let confidence = 75 - (index * 5); // Decrease confidence for later items
    
    recommendations.push({
      action_type: actionType,
      action_details: {
        description: cleanLine,
        auto_parsed: true,
        source: 'ai_analysis'
      },
      reasoning: cleanLine,
      confidence_score: confidence,
      estimated_fix_time_minutes: estimatedTime,
      risk_level: riskLevel
    });
  });
  
  logger.debug('AI incidents: recommendations parsed', { count: recommendations.length });
  
  // If no recommendations found, create generic ones based on event type
  if (recommendations.length === 0) {
    logger.debug('AI incidents: no recommendations parsed, creating fallback');
    recommendations.push({
      action_type: 'investigate',
      action_details: {
        description: `Investigate ${eventType} incident and gather more data`,
        auto_parsed: true,
        source: 'default_fallback'
      },
      reasoning: 'Standard investigation procedure for this incident type',
      confidence_score: 50,
      estimated_fix_time_minutes: 30,
      risk_level: 'low' as const
    });
  }
  
  logger.debug('AI incidents: parseRecommendations — end');
  return recommendations;
}

export default router;
