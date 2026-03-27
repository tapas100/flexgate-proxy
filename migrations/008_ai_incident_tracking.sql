-- AI Incident Tracking System - Database Migration
-- Creates tables for tracking AI incidents, recommendations, outcomes, and learning metrics

-- Table 1: AI Incidents (Master incident tracking)
CREATE TABLE IF NOT EXISTS ai_incidents (
    -- Primary identification
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(255) UNIQUE NOT NULL,  -- evt_xxx from AI Event Factory
    
    -- Incident details
    event_type VARCHAR(100) NOT NULL,  -- LATENCY_ANOMALY, ERROR_RATE_SPIKE, etc.
    severity VARCHAR(50) NOT NULL,     -- critical, warning, info
    summary TEXT NOT NULL,
    
    -- Metrics & context
    metrics JSONB NOT NULL,            -- Current metrics, baseline, thresholds
    context JSONB NOT NULL,            -- Route, upstream, samples, etc.
    
    -- AI metadata
    ai_confidence DECIMAL(3,2),        -- 0.00 to 1.00
    ai_estimated_tokens INTEGER,
    ai_reasoning_hints TEXT[],
    
    -- Timestamps
    detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'open',  
    -- open, acknowledged, in_progress, resolved, escalated, false_positive
    
    -- Resolution tracking
    resolution_time_seconds INTEGER,
    resolved_by VARCHAR(50),  -- 'ai_auto', 'user_manual', 'user_with_ai'
    
    -- User feedback
    user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
    user_feedback TEXT,
    
    -- Correlation
    related_incident_ids VARCHAR(255)[],  -- Other incidents at same time
    root_cause_incident_id VARCHAR(255),  -- If this is symptom of another
    
    -- Audit timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_ai_incidents_event_type ON ai_incidents(event_type);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_status ON ai_incidents(status);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_detected_at ON ai_incidents(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_severity ON ai_incidents(severity);

-- Table 2: AI Recommendations (Claude's suggestions)
CREATE TABLE IF NOT EXISTS ai_recommendations (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(255) NOT NULL,
    
    -- Recommendation details
    recommendation_rank INTEGER NOT NULL,  -- 1 = top suggestion, 2 = second, etc.
    action_type VARCHAR(100) NOT NULL,     -- restart_cache, enable_circuit_breaker, etc.
    action_details JSONB NOT NULL,         -- Specific parameters for action
    
    -- Claude's reasoning
    reasoning TEXT NOT NULL,
    confidence_score DECIMAL(3,2) NOT NULL,
    estimated_fix_time_minutes INTEGER,
    risk_level VARCHAR(50) NOT NULL,  -- low, medium, high
    
    -- Cost estimates
    estimated_cost_usd DECIMAL(10,4),
    expected_benefit TEXT,
    
    -- Full Claude response
    claude_prompt TEXT NOT NULL,           -- What we sent to Claude
    claude_response JSONB NOT NULL,        -- Full JSON response from Claude
    claude_model VARCHAR(100),             -- claude-3-5-sonnet-20241022
    claude_tokens_used INTEGER,
    claude_cost_usd DECIMAL(10,4),
    
    -- User decision
    user_decision VARCHAR(50),  -- accepted, rejected, modified, skipped
    user_decision_at TIMESTAMP,
    user_decision_reason TEXT,
    
    -- If modified, what did user do instead
    actual_action_taken VARCHAR(100),
    actual_action_details JSONB,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (incident_id) REFERENCES ai_incidents(incident_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_incident ON ai_recommendations(incident_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_decision ON ai_recommendations(user_decision);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_action ON ai_recommendations(action_type);

-- Table 3: AI Action Outcomes (What actually happened)
CREATE TABLE IF NOT EXISTS ai_action_outcomes (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(255) NOT NULL,
    recommendation_id INTEGER,
    
    -- Action executed
    action_type VARCHAR(100) NOT NULL,
    action_details JSONB NOT NULL,
    executed_by VARCHAR(50) NOT NULL,  -- 'ai_auto', 'user_manual'
    executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Pre-execution state
    metrics_before JSONB NOT NULL,
    
    -- Post-execution state
    metrics_after JSONB NOT NULL,
    metrics_checked_at TIMESTAMP NOT NULL,
    
    -- Outcome evaluation
    outcome_status VARCHAR(50) NOT NULL,  
    -- resolved, partially_resolved, no_change, worsened, rolled_back
    
    improvement_percentage DECIMAL(5,2),  -- -100 to +100 (negative = worse)
    
    -- Rollback tracking
    rollback_needed BOOLEAN DEFAULT FALSE,
    rollback_executed_at TIMESTAMP,
    rollback_reason TEXT,
    
    -- Success metrics
    incident_resolved BOOLEAN NOT NULL,
    resolution_time_seconds INTEGER,
    
    -- Learning data
    success_score DECIMAL(3,2),  -- 0.00 to 1.00 (for RL reward)
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (incident_id) REFERENCES ai_incidents(incident_id) ON DELETE CASCADE,
    FOREIGN KEY (recommendation_id) REFERENCES ai_recommendations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_outcomes_incident ON ai_action_outcomes(incident_id);
CREATE INDEX IF NOT EXISTS idx_ai_outcomes_action ON ai_action_outcomes(action_type);
CREATE INDEX IF NOT EXISTS idx_ai_outcomes_status ON ai_action_outcomes(outcome_status);

-- Table 4: AI Learning Metrics (Aggregate learning data)
CREATE TABLE IF NOT EXISTS ai_learning_metrics (
    id SERIAL PRIMARY KEY,
    
    -- Aggregation period
    metric_date DATE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    
    -- Success metrics
    total_incidents INTEGER NOT NULL DEFAULT 0,
    auto_resolved_count INTEGER NOT NULL DEFAULT 0,
    user_accepted_count INTEGER NOT NULL DEFAULT 0,
    user_rejected_count INTEGER NOT NULL DEFAULT 0,
    user_modified_count INTEGER NOT NULL DEFAULT 0,
    false_positive_count INTEGER NOT NULL DEFAULT 0,
    
    -- Performance metrics
    avg_resolution_time_seconds INTEGER,
    avg_confidence_score DECIMAL(3,2),
    avg_user_rating DECIMAL(3,2),
    
    -- Success rates
    acceptance_rate DECIMAL(5,2),  -- user_accepted / total
    resolution_rate DECIMAL(5,2),  -- resolved / total
    false_positive_rate DECIMAL(5,2),
    
    -- Cost metrics
    total_ai_cost_usd DECIMAL(10,4),
    avg_cost_per_incident DECIMAL(10,4),
    estimated_human_hours_saved DECIMAL(10,2),
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(metric_date, event_type, action_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_learning_date ON ai_learning_metrics(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_learning_event ON ai_learning_metrics(event_type);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for ai_incidents
DROP TRIGGER IF EXISTS update_ai_incidents_updated_at ON ai_incidents;
CREATE TRIGGER update_ai_incidents_updated_at
    BEFORE UPDATE ON ai_incidents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View: Incident summary with recommendation stats
CREATE OR REPLACE VIEW v_ai_incidents_summary AS
SELECT 
    i.id,
    i.incident_id,
    i.event_type,
    i.severity,
    i.summary,
    i.status,
    i.detected_at,
    i.resolved_at,
    i.resolution_time_seconds,
    i.user_rating,
    i.ai_confidence,
    COUNT(DISTINCT r.id) as recommendation_count,
    COUNT(DISTINCT o.id) as action_count,
    MAX(r.confidence_score) as max_recommendation_confidence,
    STRING_AGG(DISTINCT r.action_type, ', ' ORDER BY r.action_type) as suggested_actions,
    MAX(CASE WHEN r.user_decision = 'accepted' THEN r.action_type END) as accepted_action
FROM ai_incidents i
LEFT JOIN ai_recommendations r ON i.incident_id = r.incident_id
LEFT JOIN ai_action_outcomes o ON i.incident_id = o.incident_id
GROUP BY i.id, i.incident_id, i.event_type, i.severity, i.summary, 
         i.status, i.detected_at, i.resolved_at, i.resolution_time_seconds,
         i.user_rating, i.ai_confidence;

-- Materialized view for analytics (refresh daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ai_analytics AS
SELECT 
    event_type,
    COUNT(*) as total_incidents,
    COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count,
    COUNT(CASE WHEN status = 'false_positive' THEN 1 END) as false_positive_count,
    AVG(resolution_time_seconds)::INTEGER as avg_resolution_time_seconds,
    AVG(user_rating) as avg_user_rating,
    AVG(ai_confidence) as avg_ai_confidence,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY resolution_time_seconds) as median_resolution_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY resolution_time_seconds) as p95_resolution_time
FROM ai_incidents
WHERE detected_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY event_type;

CREATE INDEX IF NOT EXISTS idx_mv_ai_analytics_event ON mv_ai_analytics(event_type);

-- Function to refresh analytics (run daily)
CREATE OR REPLACE FUNCTION refresh_ai_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ai_analytics;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE ai_incidents IS 'Master table for all AI-detected incidents';
COMMENT ON TABLE ai_recommendations IS 'Claude AI recommendations for each incident';
COMMENT ON TABLE ai_action_outcomes IS 'Outcomes of actions taken to resolve incidents';
COMMENT ON TABLE ai_learning_metrics IS 'Daily aggregated metrics for AI learning and improvement';

COMMENT ON COLUMN ai_incidents.incident_id IS 'Unique identifier from AI Event Factory (evt_xxx)';
COMMENT ON COLUMN ai_incidents.status IS 'Lifecycle: open → acknowledged → in_progress → resolved/escalated/false_positive';
COMMENT ON COLUMN ai_incidents.resolved_by IS 'How incident was resolved: ai_auto, user_manual, user_with_ai';

COMMENT ON COLUMN ai_recommendations.user_decision IS 'User response: accepted, rejected, modified, skipped';
COMMENT ON COLUMN ai_recommendations.claude_prompt IS 'Full prompt sent to Claude for audit trail';

COMMENT ON COLUMN ai_action_outcomes.success_score IS 'Reward signal for reinforcement learning: 1.0 = success, -1.0 = worsened';
COMMENT ON COLUMN ai_action_outcomes.improvement_percentage IS 'Metric improvement: (old-new)/old * 100';
