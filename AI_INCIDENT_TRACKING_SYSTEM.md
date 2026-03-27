# AI Incident Tracking & Feedback System

## 🎯 Vision: Closed-Loop Learning from Human Feedback

Create a complete incident lifecycle tracking system that:
1. **Records all AI-detected incidents**
2. **Stores Claude's recommendations**
3. **Tracks user decisions** (accepted/rejected/modified)
4. **Learns from outcomes**
5. **Improves over time**

This enables the AI to get smarter with every incident! 🧠

---

## 📊 Current vs Enhanced Architecture

### Current Architecture (Phase 0)
```
Incident Detected → Claude Analyzes → User Sees Suggestion → [Manual Action]
                                                              ↓
                                                           [Lost Data!]
```

**Problem:** No tracking, no learning, no improvement

### Enhanced Architecture (Phase 1+)
```
┌─────────────────────────────────────────────────────────────────┐
│                    1. INCIDENT DETECTION                        │
├─────────────────────────────────────────────────────────────────┤
│  Prometheus/Logs → AI Event Factory → Creates Incident Record  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  2. AI ANALYSIS (Claude)                        │
├─────────────────────────────────────────────────────────────────┤
│  • Claude analyzes incident                                     │
│  • Suggests actions (A, B, C)                                   │
│  • Provides confidence scores                                   │
│  • Stores in ai_recommendations table                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              3. USER DECISION (Admin UI)                        │
├─────────────────────────────────────────────────────────────────┤
│  User Options:                                                  │
│  ✅ Accept recommendation (execute action A)                    │
│  ✏️  Modify recommendation (execute action B instead)           │
│  ❌ Reject recommendation (do something else)                   │
│  ⏭️  Skip (false positive, ignore)                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                4. ACTION EXECUTION                              │
├─────────────────────────────────────────────────────────────────┤
│  • Execute chosen action                                        │
│  • Monitor metrics for 5 minutes                                │
│  • Record outcome in ai_action_outcomes table                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  5. OUTCOME TRACKING                            │
├─────────────────────────────────────────────────────────────────┤
│  • Did incident resolve? ✅/❌                                  │
│  • Resolution time                                              │
│  • User satisfaction rating (1-5 stars)                         │
│  • Update ai_incidents table                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│               6. LEARNING & IMPROVEMENT                         │
├─────────────────────────────────────────────────────────────────┤
│  • Calculate success rate per action type                       │
│  • Identify patterns in accepted/rejected recommendations       │
│  • Fine-tune prompts based on feedback                          │
│  • Store embeddings in vector DB for future similarity search   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

### Table 1: `ai_incidents` (Master Incident Tracking)

```sql
CREATE TABLE ai_incidents (
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
    
    -- Indexes for fast queries
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_incidents_event_type ON ai_incidents(event_type);
CREATE INDEX idx_ai_incidents_status ON ai_incidents(status);
CREATE INDEX idx_ai_incidents_detected_at ON ai_incidents(detected_at);
CREATE INDEX idx_ai_incidents_severity ON ai_incidents(severity);
```

### Table 2: `ai_recommendations` (Claude's Suggestions)

```sql
CREATE TABLE ai_recommendations (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(255) NOT NULL REFERENCES ai_incidents(incident_id),
    
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
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_recommendations_incident ON ai_recommendations(incident_id);
CREATE INDEX idx_ai_recommendations_decision ON ai_recommendations(user_decision);
CREATE INDEX idx_ai_recommendations_action ON ai_recommendations(action_type);
```

### Table 3: `ai_action_outcomes` (What Actually Happened)

```sql
CREATE TABLE ai_action_outcomes (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(255) NOT NULL REFERENCES ai_incidents(incident_id),
    recommendation_id INTEGER REFERENCES ai_recommendations(id),
    
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
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_outcomes_incident ON ai_action_outcomes(incident_id);
CREATE INDEX idx_ai_outcomes_action ON ai_action_outcomes(action_type);
CREATE INDEX idx_ai_outcomes_status ON ai_action_outcomes(outcome_status);
```

### Table 4: `ai_learning_metrics` (Aggregate Learning Data)

```sql
CREATE TABLE ai_learning_metrics (
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

CREATE INDEX idx_ai_learning_date ON ai_learning_metrics(metric_date);
CREATE INDEX idx_ai_learning_event ON ai_learning_metrics(event_type);
```

---

## 📡 API Endpoints (Backend)

### 1. Incident Tracking Endpoints

```typescript
// routes/ai-incidents.ts

/**
 * List all AI incidents with filters
 * GET /api/ai/incidents?status=open&event_type=LATENCY_ANOMALY&limit=50
 */
router.get('/incidents', async (req, res) => {
  const { status, event_type, severity, limit = 50, offset = 0 } = req.query;
  
  const incidents = await db.query(`
    SELECT 
      i.*,
      COUNT(r.id) as recommendation_count,
      COUNT(o.id) as action_count
    FROM ai_incidents i
    LEFT JOIN ai_recommendations r ON i.incident_id = r.incident_id
    LEFT JOIN ai_action_outcomes o ON i.incident_id = o.incident_id
    WHERE ($1::text IS NULL OR i.status = $1)
      AND ($2::text IS NULL OR i.event_type = $2)
      AND ($3::text IS NULL OR i.severity = $3)
    GROUP BY i.id
    ORDER BY i.detected_at DESC
    LIMIT $4 OFFSET $5
  `, [status, event_type, severity, limit, offset]);
  
  res.json({ success: true, data: incidents.rows });
});

/**
 * Get single incident with all details
 * GET /api/ai/incidents/:id
 */
router.get('/incidents/:id', async (req, res) => {
  const { id } = req.params;
  
  const [incident, recommendations, outcomes] = await Promise.all([
    db.query('SELECT * FROM ai_incidents WHERE incident_id = $1', [id]),
    db.query('SELECT * FROM ai_recommendations WHERE incident_id = $1 ORDER BY recommendation_rank', [id]),
    db.query('SELECT * FROM ai_action_outcomes WHERE incident_id = $1 ORDER BY executed_at', [id])
  ]);
  
  res.json({
    success: true,
    data: {
      incident: incident.rows[0],
      recommendations: recommendations.rows,
      outcomes: outcomes.rows
    }
  });
});

/**
 * Create new incident (called by AI Event Factory)
 * POST /api/ai/incidents
 */
router.post('/incidents', async (req, res) => {
  const { event } = req.body;  // AI event from event factory
  
  const result = await db.query(`
    INSERT INTO ai_incidents (
      incident_id, event_type, severity, summary,
      metrics, context, ai_confidence, ai_estimated_tokens,
      ai_reasoning_hints, detected_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    RETURNING *
  `, [
    event.event_id,
    event.event_type,
    event.severity,
    event.summary,
    JSON.stringify(event.data),
    JSON.stringify(event.context),
    event.ai_metadata.confidence,
    event.ai_metadata.estimated_tokens,
    event.ai_metadata.reasoning_hints,
  ]);
  
  res.json({ success: true, data: result.rows[0] });
});

/**
 * Update incident status
 * PATCH /api/ai/incidents/:id
 */
router.patch('/incidents/:id', async (req, res) => {
  const { id } = req.params;
  const { status, user_rating, user_feedback, resolved_by } = req.body;
  
  const result = await db.query(`
    UPDATE ai_incidents 
    SET status = COALESCE($2, status),
        user_rating = COALESCE($3, user_rating),
        user_feedback = COALESCE($4, user_feedback),
        resolved_by = COALESCE($5, resolved_by),
        resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE resolved_at END,
        acknowledged_at = CASE WHEN $2 = 'acknowledged' THEN NOW() ELSE acknowledged_at END,
        updated_at = NOW()
    WHERE incident_id = $1
    RETURNING *
  `, [id, status, user_rating, user_feedback, resolved_by]);
  
  res.json({ success: true, data: result.rows[0] });
});
```

### 2. Recommendation Endpoints

```typescript
/**
 * Record Claude's recommendation
 * POST /api/ai/recommendations
 */
router.post('/recommendations', async (req, res) => {
  const {
    incident_id,
    recommendations,  // Array of Claude's suggestions
    prompt,
    claude_response,
    model,
    tokens_used,
    cost_usd
  } = req.body;
  
  // Store each recommendation
  const results = await Promise.all(
    recommendations.map((rec, index) => 
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
        incident_id,
        index + 1,
        rec.action_type,
        JSON.stringify(rec.action_details),
        rec.reasoning,
        rec.confidence_score,
        rec.estimated_fix_time_minutes,
        rec.risk_level,
        rec.estimated_cost_usd,
        rec.expected_benefit,
        prompt,
        JSON.stringify(claude_response),
        model,
        tokens_used,
        cost_usd
      ])
    )
  );
  
  res.json({ success: true, data: results.map(r => r.rows[0]) });
});

/**
 * Record user decision on recommendation
 * POST /api/ai/recommendations/:id/decision
 */
router.post('/recommendations/:id/decision', async (req, res) => {
  const { id } = req.params;
  const { 
    decision,  // accepted, rejected, modified, skipped
    reason,
    actual_action,  // If modified, what did they do?
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
  `, [id, decision, reason, actual_action, JSON.stringify(actual_action_details)]);
  
  res.json({ success: true, data: result.rows[0] });
});
```

### 3. Outcome Tracking Endpoints

```typescript
/**
 * Record action execution and outcome
 * POST /api/ai/outcomes
 */
router.post('/outcomes', async (req, res) => {
  const {
    incident_id,
    recommendation_id,
    action_type,
    action_details,
    executed_by,
    metrics_before,
    metrics_after,
    outcome_status,
    incident_resolved
  } = req.body;
  
  // Calculate improvement
  const improvement = calculateImprovement(metrics_before, metrics_after);
  
  // Calculate success score (for RL)
  const success_score = outcome_status === 'resolved' ? 1.0 :
                       outcome_status === 'partially_resolved' ? 0.5 :
                       outcome_status === 'no_change' ? 0.0 :
                       outcome_status === 'worsened' ? -1.0 : 0.0;
  
  const result = await db.query(`
    INSERT INTO ai_action_outcomes (
      incident_id, recommendation_id, action_type, action_details,
      executed_by, metrics_before, metrics_after, metrics_checked_at,
      outcome_status, improvement_percentage, incident_resolved, success_score
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11)
    RETURNING *
  `, [
    incident_id, recommendation_id, action_type, JSON.stringify(action_details),
    executed_by, JSON.stringify(metrics_before), JSON.stringify(metrics_after),
    outcome_status, improvement, incident_resolved, success_score
  ]);
  
  // Update incident status if resolved
  if (incident_resolved) {
    await db.query(`
      UPDATE ai_incidents
      SET status = 'resolved',
          resolved_at = NOW(),
          resolved_by = $2
      WHERE incident_id = $1
    `, [incident_id, executed_by]);
  }
  
  res.json({ success: true, data: result.rows[0] });
});
```

### 4. Analytics Endpoints

```typescript
/**
 * Get learning metrics and success rates
 * GET /api/ai/analytics/learning-metrics
 */
router.get('/analytics/learning-metrics', async (req, res) => {
  const { event_type, days = 30 } = req.query;
  
  const metrics = await db.query(`
    SELECT 
      event_type,
      action_type,
      SUM(total_incidents) as total,
      AVG(acceptance_rate) as avg_acceptance_rate,
      AVG(resolution_rate) as avg_resolution_rate,
      AVG(false_positive_rate) as avg_false_positive_rate,
      AVG(avg_user_rating) as overall_rating,
      SUM(estimated_human_hours_saved) as total_hours_saved
    FROM ai_learning_metrics
    WHERE metric_date >= CURRENT_DATE - $1::integer
      AND ($2::text IS NULL OR event_type = $2)
    GROUP BY event_type, action_type
    ORDER BY total DESC
  `, [days, event_type]);
  
  res.json({ success: true, data: metrics.rows });
});

/**
 * Get success rate per action type
 * GET /api/ai/analytics/action-success-rates
 */
router.get('/analytics/action-success-rates', async (req, res) => {
  const success_rates = await db.query(`
    SELECT 
      r.action_type,
      COUNT(*) as total_recommendations,
      SUM(CASE WHEN r.user_decision = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
      SUM(CASE WHEN r.user_decision = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
      SUM(CASE WHEN o.incident_resolved THEN 1 ELSE 0 END) as resolved_count,
      ROUND(100.0 * SUM(CASE WHEN r.user_decision = 'accepted' THEN 1 ELSE 0 END) / COUNT(*), 2) as acceptance_rate,
      ROUND(100.0 * SUM(CASE WHEN o.incident_resolved THEN 1 ELSE 0 END) / COUNT(*), 2) as resolution_rate
    FROM ai_recommendations r
    LEFT JOIN ai_action_outcomes o ON r.id = o.recommendation_id
    WHERE r.created_at >= CURRENT_DATE - 30
    GROUP BY r.action_type
    ORDER BY acceptance_rate DESC
  `);
  
  res.json({ success: true, data: success_rates.rows });
});
```

---

## 🎨 Admin UI Pages

### Page 1: AI Incidents Dashboard

**Route:** `/ai-incidents`

**Features:**
1. **List View** - All incidents in table
2. **Filters** - By status, event type, severity, date range
3. **Quick Stats** - Total open, resolved today, avg resolution time
4. **Status Colors** - Red (critical), Orange (warning), Green (resolved)

**UI Components:**
```typescript
interface IncidentListItem {
  id: string;
  event_type: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  status: 'open' | 'acknowledged' | 'resolved';
  detected_at: string;
  claude_recommendation: string;  // Top recommendation
  user_decision: 'pending' | 'accepted' | 'rejected';
}
```

**Table Columns:**
- Status badge
- Event type (with icon)
- Summary (truncated)
- Detected time (relative: "2 hours ago")
- Claude's suggestion (preview)
- User decision badge
- Actions (View, Resolve, Dismiss)

### Page 2: Incident Detail Page

**Route:** `/ai-incidents/:id`

**Sections:**

1. **Incident Overview**
   - Event type, severity, status
   - Detection timestamp
   - Current metrics vs baseline
   - Affected route/service

2. **Claude's Analysis**
   - Full reasoning text
   - Top 3 recommendations (ranked)
   - Each recommendation shows:
     - Action type
     - Confidence score
     - Estimated fix time
     - Risk level
     - Cost estimate

3. **User Decision Panel**
   ```typescript
   <RecommendationCard>
     <h3>Recommendation #1 (Confidence: 85%)</h3>
     <p><strong>Action:</strong> Enable circuit breaker on /api/users</p>
     <p><strong>Reasoning:</strong> Error rate is 15% (3x baseline)...</p>
     <p><strong>Risk:</strong> Low | <strong>Time:</strong> ~2 min</p>
     
     <ButtonGroup>
       <Button color="success" onClick={acceptRecommendation}>
         ✅ Accept & Execute
       </Button>
       <Button color="warning" onClick={modifyRecommendation}>
         ✏️ Modify
       </Button>
       <Button color="error" onClick={rejectRecommendation}>
         ❌ Reject
       </Button>
       <Button onClick={skipRecommendation}>
         ⏭️ Skip (False Positive)
       </Button>
     </ButtonGroup>
     
     {showModifyPanel && (
       <ModifyPanel>
         <Select label="Alternative Action">
           <option>Restart service</option>
           <option>Clear cache</option>
           <option>Manual investigation</option>
         </Select>
         <TextField label="Reason for modification" multiline />
         <Button onClick={executeModified}>Execute Modified Action</Button>
       </ModifyPanel>
     )}
   </RecommendationCard>
   ```

4. **Action History**
   - Timeline of all actions taken
   - Metrics before/after each action
   - Outcome status (resolved, no change, worsened)
   - Rollback buttons if needed

5. **Outcome Rating**
   ```typescript
   <OutcomePanel>
     <h3>How helpful was Claude's recommendation?</h3>
     <Rating value={rating} onChange={setRating} max={5} />
     <TextField 
       label="Feedback (optional)" 
       placeholder="What worked well? What could be improved?"
       multiline
       rows={3}
     />
     <Button onClick={submitFeedback}>Submit Feedback</Button>
   </OutcomePanel>
   ```

### Page 3: AI Analytics Dashboard

**Route:** `/ai-analytics`

**Widgets:**

1. **Success Metrics Card**
   ```
   ┌─────────────────────────────────────┐
   │  Claude Acceptance Rate: 78%        │
   │  ────────────────────────────────   │
   │  Incidents Auto-Resolved: 45%       │
   │  False Positive Rate: 8%            │
   │  Avg Resolution Time: 4.2 min       │
   │  Human Hours Saved: 127h this month │
   └─────────────────────────────────────┘
   ```

2. **Success Rate by Event Type** (Bar Chart)
   - X-axis: Event types
   - Y-axis: Acceptance rate %
   - Bars colored by rate (green >80%, yellow 60-80%, red <60%)

3. **Action Performance Table**
   | Action Type | Times Suggested | Accepted | Rejected | Success Rate |
   |-------------|----------------|----------|----------|--------------|
   | Enable Circuit Breaker | 45 | 38 | 7 | 84% |
   | Restart Service | 32 | 20 | 12 | 63% |
   | Clear Cache | 28 | 25 | 3 | 89% |

4. **Learning Trend** (Line Chart)
   - X-axis: Weeks
   - Lines: Acceptance rate, Resolution rate, False positive rate
   - Shows improvement over time

5. **Top Insights Panel**
   ```
   💡 Insights:
   - Circuit breaker recommendations have 89% acceptance rate
   - Latency anomalies resolve 2.3x faster with AI suggestions
   - Error spike detection improved 40% this month
   - Users modify recommendations 12% of the time (usually scaling decisions)
   ```

---

## 🔄 User Workflow Example

### Scenario: Latency Spike Detected

**Step 1: Incident Created** (Automatic)
```sql
-- AI Event Factory detects latency spike
INSERT INTO ai_incidents (
  incident_id: 'evt_abc123',
  event_type: 'LATENCY_ANOMALY',
  severity: 'warning',
  summary: 'Route /api/users latency increased to 2500ms (250% of baseline)',
  status: 'open'
)
```

**Step 2: Claude Analyzes** (Automatic)
```typescript
// Backend calls Claude API
const prompt = buildPrompt(incident);
const claude_response = await callClaude(prompt);

// Store recommendations
INSERT INTO ai_recommendations (
  incident_id: 'evt_abc123',
  recommendation_rank: 1,
  action_type: 'enable_cache',
  reasoning: 'Database queries are slow. Cache will reduce load by 60-80%.',
  confidence_score: 0.85,
  risk_level: 'low'
)
```

**Step 3: User Sees Alert** (Admin UI)
```
🔔 New AI Incident: Latency Spike on /api/users

Claude's Recommendation:
✅ Enable query result caching (Confidence: 85%)
   Reasoning: Database queries are slow...
   Estimated fix time: 2-3 minutes
   Risk: Low
   
[Accept & Execute] [Modify] [Reject] [Skip]
```

**Step 4: User Accepts** (User Action)
```typescript
// User clicks "Accept & Execute"
POST /api/ai/recommendations/123/decision
{
  "decision": "accepted",
  "reason": "Looks good, executing"
}

// Backend executes action
executeAction({
  type: 'enable_cache',
  route: '/api/users',
  ttl: 300
});

// Record metrics before
const metrics_before = getCurrentMetrics();
```

**Step 5: Monitor Outcome** (Automatic, 5 min later)
```typescript
// After 5 minutes, check metrics
const metrics_after = getCurrentMetrics();

// Latency dropped from 2500ms to 450ms ✅
INSERT INTO ai_action_outcomes (
  incident_id: 'evt_abc123',
  outcome_status: 'resolved',
  improvement_percentage: 82,  // (2500-450)/2500 = 82%
  incident_resolved: true,
  success_score: 1.0  // Full reward for RL
)

// Update incident
UPDATE ai_incidents 
SET status = 'resolved', 
    resolved_by = 'user_with_ai',
    resolved_at = NOW()
WHERE incident_id = 'evt_abc123'
```

**Step 6: User Rates** (Optional)
```typescript
// User gives 5-star rating
UPDATE ai_incidents
SET user_rating = 5,
    user_feedback = 'Worked perfectly! Resolved in 2 minutes.'
WHERE incident_id = 'evt_abc123'
```

**Step 7: Learning** (Automatic, Daily)
```sql
-- Aggregate metrics for the day
INSERT INTO ai_learning_metrics (
  metric_date: '2026-02-15',
  event_type: 'LATENCY_ANOMALY',
  action_type: 'enable_cache',
  total_incidents: 5,
  user_accepted_count: 4,
  acceptance_rate: 80,
  resolution_rate: 100,
  avg_user_rating: 4.5
)
```

---

## 🧠 How This Enables Learning

### 1. Pattern Recognition
```python
# When new LATENCY_ANOMALY occurs:
similar_incidents = vector_db.search(
    query=current_incident.summary,
    filter={
        "event_type": "LATENCY_ANOMALY",
        "user_decision": "accepted",
        "outcome_status": "resolved"
    },
    limit=5
)

# Extract what worked before
successful_actions = [inc.action_type for inc in similar_incidents]
# Result: ['enable_cache', 'enable_cache', 'restart_service', 'enable_cache']

# Claude's prompt now includes:
"Historical context: Similar incidents were resolved by enabling cache (75% success rate)"
```

### 2. Confidence Calibration
```python
# Track Claude's confidence vs actual success
accuracy_by_confidence = {
    "90-100%": 0.92,  # When Claude says 95% confident, it's right 92% of time
    "80-90%": 0.85,
    "70-80%": 0.73,
    "60-70%": 0.58
}

# Adjust decision thresholds:
if claude_confidence > 0.90 and historical_success_rate > 0.85:
    auto_execute = True  # High confidence in both → auto-execute
```

### 3. Prompt Improvement
```python
# Analyze rejected recommendations
rejected = db.query("""
    SELECT reasoning, user_decision_reason 
    FROM ai_recommendations 
    WHERE user_decision = 'rejected' AND event_type = 'ERROR_RATE_SPIKE'
""")

# Common rejection reasons: "Too aggressive", "Wrong diagnosis"
# Improve prompt:
new_prompt = f"""
{original_prompt}

IMPORTANT: 
- Users rejected aggressive actions 60% of time
- Start with least disruptive actions first
- Verify error pattern before suggesting restart
"""
```

### 4. Cost-Benefit Learning
```python
# Track ROI per action type
action_roi = db.query("""
    SELECT 
        action_type,
        AVG(estimated_cost_usd) as avg_cost,
        AVG(CASE WHEN incident_resolved THEN 100 ELSE 0 END) as success_rate,
        AVG(resolution_time_seconds) as avg_time
    FROM ai_recommendations r
    JOIN ai_action_outcomes o ON r.id = o.recommendation_id
    GROUP BY action_type
""")

# Result: 
# enable_cache: $5, 89% success, 120s
# restart_service: $0, 65% success, 300s

# Prefer cache over restart (higher success, faster, worth the cost)
```

---

## 📊 What You Achieve

### Immediate Benefits (Week 1)
✅ **Visibility** - See all AI incidents in one place  
✅ **Accountability** - Track what Claude suggested vs what happened  
✅ **Feedback Loop** - Users rate recommendations  
✅ **Audit Trail** - Complete history of all decisions

### Short-term Benefits (Month 1)
✅ **Pattern Detection** - "Cache fixes latency 80% of the time"  
✅ **Confidence Calibration** - Know when to trust Claude  
✅ **False Positive Tracking** - Reduce alert fatigue  
✅ **Performance Metrics** - Measure AI effectiveness

### Long-term Benefits (6+ Months)
✅ **Continuous Improvement** - AI gets smarter every week  
✅ **Personalized Learning** - Adapts to YOUR infrastructure  
✅ **Predictive Accuracy** - Better at preventing incidents  
✅ **Auto-Resolution** - Can safely auto-execute proven actions  
✅ **Cost Savings** - Reduce MTTR from 30min to 2min

### Ultimate Goal (12 Months)
🎯 **95% Auto-Resolution Rate**  
🎯 **99% Decision Accuracy**  
🎯 **$50K+ Annual Savings** (engineer time)  
🎯 **2-minute Mean Time to Resolution**  
🎯 **Zero Human Intervention for Known Patterns**

---

## 🚀 Implementation Priority

### Phase 1: Database & Basic Tracking (Week 1)
1. Create database tables ✅
2. Add incident creation endpoint ✅
3. Store Claude recommendations ✅
4. Basic incident list page ✅

### Phase 2: User Decision Workflow (Week 2)
1. Incident detail page ✅
2. Accept/Reject/Modify UI ✅
3. Outcome tracking ✅
4. User rating system ✅

### Phase 3: Analytics & Learning (Week 3)
1. Analytics dashboard ✅
2. Success rate calculations ✅
3. Learning metrics aggregation ✅
4. Trend visualizations ✅

### Phase 4: Automated Actions (Week 4)
1. Auto-execute low-risk actions ✅
2. Rollback on failure ✅
3. Notify users of auto-actions ✅
4. Safety checks ✅

---

## 💡 Next Steps

**Would you like me to:**
1. ✅ Create the SQL migration files for these tables?
2. ✅ Implement the API endpoints in routes/ai-incidents.ts?
3. ✅ Build the Admin UI incident list page?
4. ✅ Create the incident detail page with decision workflow?
5. ✅ Set up the analytics dashboard?

**This system will transform FlexGate into a self-learning, continuously improving AI-native platform!** 🚀
