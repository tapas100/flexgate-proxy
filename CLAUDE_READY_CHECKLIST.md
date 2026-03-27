# 🎯 Claude-Ready Implementation Checklist

**Goal:** Make FlexGate Admin UI effortless for Claude AI integration

**Status:** ⏳ In Progress  
**Target:** 100% Claude-Ready  
**Current:** 65% Complete

---

## ✅ Phase 1: Core Infrastructure (COMPLETE)

### Backend API
- [x] AI Incidents database schema
- [x] POST /api/ai-incidents (create incident)
- [x] GET /api/ai-incidents (list incidents)
- [x] GET /api/ai-incidents/:id (get details)
- [x] PATCH /api/ai-incidents/:id/status (update status)
- [x] POST /api/ai-incidents/:id/recommendations (store Claude analysis)
- [x] Event type validation (18 types)
- [x] Severity validation (INFO, WARNING, CRITICAL)
- [x] Data normalization

### Admin UI Pages
- [x] AI Incidents list page (`/ai-incidents`)
- [x] AI Incident detail page (`/ai-incidents/:id`)
- [x] Filters (Status, Event Type, Severity, Search)
- [x] Pagination (10, 25, 50, 100 per page)
- [x] Quick stats cards
- [x] Responsive layout

### Data Quality
- [x] Backend validation prevents invalid data
- [x] Old invalid data cleaned up
- [x] Dropdown values match database
- [x] Case-insensitive color mapping

---

## 🔄 Phase 2: Claude Integration Features (IN PROGRESS)

### Prompt Generation
- [ ] **GET /api/ai-incidents/:id/prompt** - Generate Claude-ready prompt
  - [ ] Backend endpoint implementation
  - [ ] Prompt template library integration
  - [ ] Event type-specific templates
  - [ ] Cost estimation in response
  
- [ ] **Prompt Display in UI**
  - [ ] "View Prompt" button on incident detail page
  - [ ] Modal/drawer with formatted prompt
  - [ ] Syntax highlighting
  - [ ] Copy to clipboard button
  - [ ] "Send to Claude" button (opens claude.ai)

### One-Click Analysis
- [ ] **"Analyze with Claude" Button**
  - [ ] Location: Incident detail page, top-right
  - [ ] Opens modal with prompt
  - [ ] Shows estimated cost ($0.012)
  - [ ] Copy prompt or open Claude.ai directly

- [ ] **Analysis Results Display**
  - [ ] Recommendations section on detail page
  - [ ] Display root causes
  - [ ] Display recommended actions
  - [ ] Show confidence score
  - [ ] Show cost tracking

### AI Recommendations Storage
- [ ] **POST /api/ai-incidents/:id/recommendations** (Backend exists ✅)
- [ ] **UI for Adding Recommendations**
  - [ ] "Add Recommendations" button
  - [ ] Form with fields:
    - [ ] Recommendation text
    - [ ] Action type (IMMEDIATE, SHORT_TERM, LONG_TERM)
    - [ ] Confidence score
    - [ ] Estimated fix time
    - [ ] Risk level (LOW, MEDIUM, HIGH)
  - [ ] Parse from Claude response (paste JSON)
  - [ ] Manual entry option

### Cost Tracking
- [ ] **AI Cost Dashboard**
  - [ ] Total AI analyses count
  - [ ] Total cost (today, this month, all-time)
  - [ ] Average cost per analysis
  - [ ] Budget remaining
  - [ ] Cost by event type breakdown

- [ ] **GET /api/ai/costs** endpoint
  - [ ] Daily costs
  - [ ] Monthly costs
  - [ ] Per-event-type costs
  - [ ] Token usage statistics

---

## 🎨 Phase 3: UX Enhancements (PENDING)

### AI Testing Page
- [ ] **New page: `/ai-testing`**
  - [ ] Event type selector (dropdown with 10 types)
  - [ ] "Generate Sample Data" button
  - [ ] Auto-generated sample metrics
  - [ ] "Generate Prompt" button
  - [ ] Prompt display area
  - [ ] Copy to clipboard
  - [ ] "Open in Claude" button

### Incident Detail Enhancements
- [ ] **Timeline View**
  - [ ] Incident detected timestamp
  - [ ] Prompt generated timestamp
  - [ ] Analysis received timestamp
  - [ ] Actions applied timestamps
  - [ ] Status changes timeline

- [ ] **Related Incidents**
  - [ ] Show similar past incidents
  - [ ] How they were resolved
  - [ ] Time to resolution comparison
  - [ ] Learnings applied

### Batch Operations
- [ ] **Bulk Analyze**
  - [ ] Select multiple open incidents
  - [ ] "Analyze Selected" button
  - [ ] Shows total cost estimate
  - [ ] Generates all prompts
  - [ ] Downloads as text file or copies all

### Keyboard Shortcuts
- [ ] `Cmd/Ctrl + K` - Quick search incidents
- [ ] `Cmd/Ctrl + C` - Copy prompt from detail page
- [ ] `Cmd/Ctrl + Enter` - Send to Claude
- [ ] `Cmd/Ctrl + R` - Refresh incident list

---

## 🚀 Phase 4: Automation Features (FUTURE)

### Auto-Analysis
- [ ] **Background Worker**
  - [ ] Monitors for new CRITICAL incidents
  - [ ] Auto-generates prompts
  - [ ] Auto-sends to Claude API
  - [ ] Stores recommendations
  - [ ] Posts to Slack/Teams

- [ ] **Configuration UI**
  - [ ] Enable/disable auto-analysis
  - [ ] Set severity threshold (only CRITICAL, or WARNING+)
  - [ ] Set event type filters
  - [ ] Set cost budget per day/month

### Webhooks
- [ ] **Incident Webhooks**
  - [ ] POST to URL when incident created
  - [ ] Payload includes Claude prompt
  - [ ] Response can include recommendations
  - [ ] Retry on failure

- [ ] **Webhook Configuration UI**
  - [ ] Add/edit/delete webhooks
  - [ ] Test webhook
  - [ ] View delivery logs
  - [ ] Retry failed deliveries

### Smart Actions
- [ ] **Auto-Apply Safe Fixes**
  - [ ] Circuit breaker activation
  - [ ] Cache enablement
  - [ ] Rate limit adjustments
  - [ ] Require confidence > 90%
  - [ ] Require risk_level = LOW
  - [ ] Log all auto-applied actions

---

## 📋 Immediate Next Steps (This Week)

### 1. Add Prompt Generation Endpoint ⏰ 2 hours
```typescript
// src/routes/ai-incidents.ts

router.get('/:id/prompt', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Get incident
    const result = await db.query(
      'SELECT * FROM ai_incidents WHERE incident_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Incident not found' });
      return;
    }
    
    const incident = result.rows[0];
    
    // Build Claude-ready prompt
    const prompt = buildClaudePrompt(incident);
    
    // Estimate cost
    const estimatedTokens = Math.ceil(prompt.length / 4);
    const estimatedCost = (estimatedTokens * 3.0) / 1_000_000;
    
    res.json({
      success: true,
      prompt,
      metadata: {
        incident_id: id,
        event_type: incident.event_type,
        severity: incident.severity,
        estimated_tokens: estimatedTokens,
        estimated_cost_usd: estimatedCost.toFixed(4),
        recommended_model: 'claude-3-5-sonnet-20241022',
        max_tokens: 900
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function buildClaudePrompt(incident: any): string {
  return `You are a Site Reliability Engineering (SRE) expert. Analyze this incident:

EVENT: ${incident.event_type}
SEVERITY: ${incident.severity}
SUMMARY: ${incident.summary}

METRICS:
${JSON.stringify(incident.metrics, null, 2)}

CONTEXT:
${JSON.stringify(incident.context, null, 2)}

DETECTED AT: ${incident.detected_at}

Provide analysis in JSON format:
{
  "error_category": "string",
  "likely_causes": ["cause1", "cause2", "cause3"],
  "actions": ["action1", "action2", "action3"],
  "confidence": 0-100,
  "estimated_fix_time": "X minutes",
  "urgency": "immediate|high|medium|low"
}`;
}
```

### 2. Add Prompt Display in UI ⏰ 1 hour
```typescript
// admin-ui/src/pages/AIIncidentDetail.tsx

// Add state
const [promptOpen, setPromptOpen] = useState(false);
const [prompt, setPrompt] = useState<string>('');
const [promptMeta, setPromptMeta] = useState<any>(null);

// Add function
const loadPrompt = async () => {
  const response = await fetch(
    `http://localhost:8080/api/ai-incidents/${id}/prompt`
  );
  const data = await response.json();
  setPrompt(data.prompt);
  setPromptMeta(data.metadata);
  setPromptOpen(true);
};

// Add button
<Button
  variant="contained"
  color="secondary"
  startIcon={<SmartToyIcon />}
  onClick={loadPrompt}
>
  Analyze with Claude
</Button>

// Add dialog
<Dialog open={promptOpen} onClose={() => setPromptOpen(false)} maxWidth="md" fullWidth>
  <DialogTitle>
    Claude Analysis Prompt
    <Chip 
      label={`Est. Cost: $${promptMeta?.estimated_cost_usd}`}
      size="small"
      sx={{ ml: 2 }}
    />
  </DialogTitle>
  <DialogContent>
    <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 1, fontFamily: 'monospace' }}>
      <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
        {prompt}
      </pre>
    </Box>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => navigator.clipboard.writeText(prompt)}>
      Copy to Clipboard
    </Button>
    <Button onClick={() => window.open('https://claude.ai', '_blank')}>
      Open Claude.ai
    </Button>
    <Button onClick={() => setPromptOpen(false)}>Close</Button>
  </DialogActions>
</Dialog>
```

### 3. Add AI Testing Page ⏰ 2 hours
```typescript
// admin-ui/src/pages/AITesting.tsx

import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Select, MenuItem,
  FormControl, InputLabel, Button, TextField
} from '@mui/material';

const AITesting: React.FC = () => {
  const [eventType, setEventType] = useState('ERROR_RATE_SPIKE');
  const [prompt, setPrompt] = useState('');

  const eventTypes = [
    'ERROR_RATE_SPIKE',
    'LATENCY_ANOMALY',
    'CIRCUIT_BREAKER_CANDIDATE',
    'RATE_LIMIT_BREACH',
    'COST_ALERT',
    'RETRY_STORM',
    'UPSTREAM_DEGRADATION',
    'SECURITY_ANOMALY',
    'CAPACITY_WARNING',
    'RECOVERY_SIGNAL'
  ];

  const generateSampleEvent = async () => {
    const response = await fetch('http://localhost:8080/api/ai/generate-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType })
    });
    const data = await response.json();
    
    // Get prompt
    const promptResponse = await fetch(
      `http://localhost:8080/api/ai-incidents/${data.incident.incident_id}/prompt`
    );
    const promptData = await promptResponse.json();
    setPrompt(promptData.prompt);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        AI Testing Playground
      </Typography>
      
      <Card>
        <CardContent>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Event Type</InputLabel>
            <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {eventTypes.map(type => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Button 
            variant="contained" 
            onClick={generateSampleEvent}
            fullWidth
          >
            Generate Sample Event
          </Button>
          
          {prompt && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" gutterBottom>
                Claude-Ready Prompt
              </Typography>
              <TextField
                multiline
                rows={15}
                fullWidth
                value={prompt}
                InputProps={{ readOnly: true }}
                sx={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button onClick={() => navigator.clipboard.writeText(prompt)}>
                  Copy Prompt
                </Button>
                <Button onClick={() => window.open('https://claude.ai', '_blank')}>
                  Open in Claude
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default AITesting;
```

### 4. Update Navigation ⏰ 15 minutes
```typescript
// admin-ui/src/components/Layout.tsx

// Add to menu items
{
  label: 'AI Testing',
  path: '/ai-testing',
  icon: <SmartToyIcon />
}
```

---

## 📊 Progress Tracking

### Overall Completion: 65%

| Category | Complete | In Progress | Pending | Total |
|----------|----------|-------------|---------|-------|
| Backend API | 8 | 2 | 0 | 10 |
| UI Pages | 2 | 1 | 1 | 4 |
| UX Features | 4 | 3 | 8 | 15 |
| Automation | 0 | 0 | 6 | 6 |
| **TOTAL** | **14** | **6** | **15** | **35** |

### By Priority

**P0 - Critical (Must Have):** 80% Complete ✅
- Incidents API ✅
- List/Detail pages ✅
- Validation ✅
- Prompt generation ⏳

**P1 - High (Should Have):** 50% Complete ⏳
- Prompt display UI ⏳
- Copy to clipboard ⏳
- Cost tracking ⏳
- AI Testing page ⏳

**P2 - Medium (Nice to Have):** 20% Complete
- Batch operations
- Webhooks
- Timeline view

**P3 - Low (Future):** 0% Complete
- Auto-analysis
- Smart actions
- Advanced automation

---

## 🎯 This Week's Goals

### Monday-Tuesday
- [ ] Implement prompt generation endpoint
- [ ] Add prompt display dialog to incident detail page
- [ ] Add copy to clipboard functionality

### Wednesday-Thursday
- [ ] Create AI Testing page
- [ ] Add event type selector
- [ ] Implement sample data generation
- [ ] Add navigation menu item

### Friday
- [ ] Testing and bug fixes
- [ ] Documentation updates
- [ ] Demo video recording

---

## 🚀 Success Criteria

### Definition of "Claude-Ready"

A FlexGate installation is "Claude-Ready" when:

1. ✅ **Zero-Config Detection**
   - Incidents auto-detected from metrics
   - No manual event creation needed

2. ⏳ **One-Click Prompts**
   - Any incident → Click "Analyze" → Get prompt
   - Copy to clipboard in 1 click
   - Open Claude.ai in 1 click

3. ⏳ **Cost Transparency**
   - Show estimated cost before analysis
   - Track actual costs after
   - Budget alerts when approaching limits

4. ⏳ **Seamless Results**
   - Paste Claude response back into UI
   - Auto-parse JSON recommendations
   - Display in structured format

5. ⏳ **Full Audit Trail**
   - Who analyzed what, when
   - What Claude recommended
   - What actions were taken
   - What was the outcome

---

**Last Updated:** February 16, 2026  
**Next Review:** February 17, 2026  
**Owner:** FlexGate Development Team
