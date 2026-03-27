// @ts-nocheck
/**
 * AI Testing Page
 * 
 * Interactive testing interface for AI features:
 * - Generate AI events for all 10 event types
 * - Build Claude-ready prompts
 * - View token and cost estimates
 * - Copy prompts to clipboard for manual Claude testing
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  Chip,
  Alert,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
  SelectChangeEvent,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  PlayArrow as GenerateIcon,
  Build as BuildIcon,
  TrackChanges as TrackIcon,
  Refresh as RefreshIcon,
  Send as SendIcon,
  Psychology as BrainIcon,
  Event as EventIcon,
  Code as CodeIcon,
} from '@mui/icons-material';
import incidentService from '../services/incidentService';

// Event type definitions
const EVENT_TYPES = [
  {
    type: 'LATENCY_ANOMALY',
    name: 'Latency Degradation',
    description: 'Response time degradation affecting user experience',
    color: '#ff9800',
  },
  {
    type: 'ERROR_RATE_SPIKE',
    name: 'Error Rate Spike',
    description: 'Sudden increase in API error rates',
    color: '#f44336',
  },
  {
    type: 'COST_ALERT',
    name: 'Cost Alert',
    description: 'High-cost route usage detected',
    color: '#9c27b0',
  },
  {
    type: 'RETRY_STORM',
    name: 'Retry Storm',
    description: 'Excessive retry attempts causing cascading failures',
    color: '#ff5722',
  },
  {
    type: 'CIRCUIT_BREAKER_CANDIDATE',
    name: 'Circuit Breaker Candidate',
    description: 'Service instability requiring circuit breaker',
    color: '#e91e63',
  },
  {
    type: 'RATE_LIMIT_BREACH',
    name: 'Rate Limit Breach',
    description: 'Traffic exceeding configured rate limits',
    color: '#f44336',
  },
  {
    type: 'UPSTREAM_DEGRADATION',
    name: 'Upstream Degradation',
    description: 'Upstream service health degradation',
    color: '#ff9800',
  },
  {
    type: 'SECURITY_ANOMALY',
    name: 'Security Anomaly',
    description: 'Unusual access patterns or security concerns',
    color: '#d32f2f',
  },
  {
    type: 'CAPACITY_WARNING',
    name: 'Capacity Warning',
    description: 'Resource saturation warning',
    color: '#ff9800',
  },
  {
    type: 'RECOVERY_SIGNAL',
    name: 'Recovery Signal',
    description: 'System auto-healing or recovery event',
    color: '#4caf50',
  },
];

interface AIEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  summary: string;
  severity: string;
  data: any;
  context: any;
  ai_metadata: {
    confidence: number;
    estimated_tokens: number;
    reasoning_hints: string[];
  };
}

interface PromptData {
  event: AIEvent;
  prompt: string;
  template: {
    name: string;
    event_type: string;
    max_tokens: number;
  };
  recommendations: {
    model: string;
    max_tokens: number;
    estimated_cost_usd: number;
  };
}

const AITesting: React.FC = () => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<string>('LATENCY_ANOMALY');
  const [event, setEvent] = useState<AIEvent | null>(null);
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Handle event type selection
  const handleTypeChange = (e: SelectChangeEvent<string>) => {
    setSelectedType(e.target.value);
    setEvent(null);
    setPromptData(null);
    setError(null);
  };

  // Generate sample event
  const handleGenerateEvent = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/ai/events/sample?type=${selectedType}`);
      const data = await response.json();
      
      if (data.success) {
        setEvent(data.data.event);
      } else {
        setError(data.error || 'Failed to generate event');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate event');
    } finally {
      setLoading(false);
    }
  };

  // Build Claude prompt
  const handleBuildPrompt = async () => {
    if (!event) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/ai/prompts/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPromptData(data.data);
      } else {
        setError(data.error || 'Failed to build prompt');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build prompt');
    } finally {
      setLoading(false);
    }
  };

  // Copy prompt to clipboard
  const handleCopyPrompt = async () => {
    if (!promptData?.prompt) return;
    
    try {
      await navigator.clipboard.writeText(promptData.prompt);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  // Create incident from current event
  const handleCreateIncident = async () => {
    if (!event) {
      setError('Generate an event first');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const incident = await incidentService.createIncident(event);
      
      // Optionally store Claude recommendations if we have prompt data
      if (promptData) {
        await incidentService.addRecommendations(incident.incident_id, {
          recommendations: [], // Empty for now - can parse Claude response later
          prompt: promptData.prompt,
          model: promptData.model,
          tokens_used: promptData.tokens,
          cost_usd: promptData.cost,
        });
      }
      
      // Navigate to incident detail page
      navigate(`/ai-incidents/${incident.incident_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create incident');
      console.error('Error creating incident:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get selected event type details
  const selectedEventType = EVENT_TYPES.find((t) => t.type === selectedType);

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BrainIcon fontSize="large" />
          AI Features Testing
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Test AI event generation and Claude prompt building. Generate events, view prompts, and copy to Claude for testing.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {copySuccess && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Prompt copied to clipboard! Paste into Claude.ai to test.
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left Panel: Event Generation */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EventIcon />
              1. Generate AI Event
            </Typography>
            
            <FormControl fullWidth sx={{ mt: 2, mb: 3 }}>
              <InputLabel>Event Type</InputLabel>
              <Select value={selectedType} onChange={handleTypeChange} label="Event Type">
                {EVENT_TYPES.map((type) => (
                  <MenuItem key={type.type} value={type.type}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: type.color,
                        }}
                      />
                      {type.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedEventType && (
              <Card variant="outlined" sx={{ mb: 3, backgroundColor: '#f5f5f5' }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Selected Event Type
                  </Typography>
                  <Typography variant="h6" gutterBottom>
                    {selectedEventType.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedEventType.description}
                  </Typography>
                </CardContent>
              </Card>
            )}

            <Button
              variant="contained"
              fullWidth
              startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
              onClick={handleGenerateEvent}
              disabled={loading}
              size="large"
            >
              Generate Sample Event
            </Button>

            {event && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Generated Event:
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    backgroundColor: '#1e1e1e',
                    color: '#d4d4d4',
                    maxHeight: 400,
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }}
                >
                  <pre style={{ margin: 0 }}>
                    {JSON.stringify(event, null, 2)}
                  </pre>
                </Paper>

                <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={`Confidence: ${(event.ai_metadata.confidence * 100).toFixed(0)}%`}
                    color="primary"
                    size="small"
                  />
                  <Chip
                    label={`Tokens: ~${event.ai_metadata.estimated_tokens}`}
                    color="secondary"
                    size="small"
                  />
                  <Chip
                    label={`Severity: ${event.severity.toUpperCase()}`}
                    color={event.severity === 'critical' ? 'error' : 'warning'}
                    size="small"
                  />
                </Box>

                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<SendIcon />}
                  onClick={handleBuildPrompt}
                  disabled={loading}
                  sx={{ mt: 2 }}
                >
                  Build Claude Prompt →
                </Button>
                
                {/* Create Incident Button */}
                <Button
                  variant="contained"
                  color="success"
                  fullWidth
                  startIcon={<TrackIcon />}
                  onClick={handleCreateIncident}
                  disabled={!event || loading}
                  sx={{ mt: 2 }}
                >
                  Create Incident & Track →
                </Button>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Right Panel: Prompt Display */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CodeIcon />
              2. Claude Prompt
            </Typography>

            {!promptData ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 400,
                  color: 'text.secondary',
                }}
              >
                <BrainIcon sx={{ fontSize: 80, mb: 2, opacity: 0.3 }} />
                <Typography variant="body1">
                  Generate an event and build a prompt to see the Claude-ready output
                </Typography>
              </Box>
            ) : (
              <Box>
                <Card variant="outlined" sx={{ mb: 2, backgroundColor: '#f5f5f5' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Template
                    </Typography>
                    <Typography variant="h6" gutterBottom>
                      {promptData.template.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                      <Chip
                        label={`Model: ${promptData.recommendations.model.split('-').slice(0, 3).join('-')}`}
                        size="small"
                      />
                      <Chip
                        label={`Cost: $${promptData.recommendations.estimated_cost_usd.toFixed(5)}`}
                        size="small"
                        color="secondary"
                      />
                      <Chip
                        label={`Max Tokens: ${promptData.recommendations.max_tokens}`}
                        size="small"
                        color="primary"
                      />
                    </Box>
                  </CardContent>
                </Card>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">
                    Prompt for Claude:
                  </Typography>
                  <Tooltip title={copySuccess ? 'Copied!' : 'Copy to clipboard'}>
                    <IconButton onClick={handleCopyPrompt} size="small" color="primary">
                      <CopyIcon />
                    </IconButton>
                  </Tooltip>
                </Box>

                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    backgroundColor: '#1e1e1e',
                    color: '#d4d4d4',
                    maxHeight: 500,
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {promptData.prompt}
                </Paper>

                <Divider sx={{ my: 2 }} />

                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Next Steps:
                  </Typography>
                  <Typography variant="body2">
                    1. Click the copy icon above to copy the prompt
                    <br />
                    2. Open <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">Claude.ai</a>
                    <br />
                    3. Paste the prompt and send
                    <br />
                    4. Claude will respond with structured JSON analysis!
                  </Typography>
                </Alert>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Bottom Panel: Quick Reference */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Quick Reference: 10 AI Event Types
            </Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {EVENT_TYPES.map((type) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={type.type}>
                  <Card
                    variant="outlined"
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      borderColor: selectedType === type.type ? type.color : 'divider',
                      '&:hover': {
                        borderColor: type.color,
                        boxShadow: 2,
                      },
                    }}
                    onClick={() => {
                      setSelectedType(type.type);
                      setEvent(null);
                      setPromptData(null);
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: type.color,
                          }}
                        />
                        <Typography variant="subtitle2">{type.name}</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {type.description}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default AITesting;
