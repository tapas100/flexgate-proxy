/**
 * AI Incident Detail Page
 * 
 * Detailed view of a single incident with recommendations, decisions, and outcomes.
 */

// @ts-nocheck - MUI v7 Grid type compatibility
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Rating,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  ExpandMore as ExpandIcon,
  CheckCircle as AcceptIcon,
  Cancel as RejectIcon,
  Edit as ModifyIcon,
  SkipNext as SkipIcon,
} from '@mui/icons-material';
import incidentService, { IncidentDetail, AIRecommendation } from '../services/incidentService';

const AIIncidentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // State
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Decision dialog
  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean;
    recommendation: AIRecommendation | null;
    decision: 'accepted' | 'rejected' | 'modified' | 'skipped';
  }>({
    open: false,
    recommendation: null,
    decision: 'accepted',
  });
  const [decisionReason, setDecisionReason] = useState('');
  const [actualAction, setActualAction] = useState('');
  
  // Outcome dialog
  const [outcomeDialog, setOutcomeDialog] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState({
    action_type: '',
    metrics_before: '',
    metrics_after: '',
    outcome_status: 'resolved' as 'resolved' | 'partially_resolved' | 'no_change' | 'worsened',
    improvement_percentage: 0,
  });
  
  // Feedback
  const [statusUpdate, setStatusUpdate] = useState('');
  const [userRating, setUserRating] = useState<number | null>(null);
  const [userFeedback, setUserFeedback] = useState('');
  
  // AI analysis state (multi-provider)
  const [promptDialog, setPromptDialog] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [promptMeta, setPromptMeta] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<any>(null);
  const [aiProvider, setAiProvider] = useState('AI'); // Current AI provider name

  // Load incident detail
  const loadIncident = async () => {
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await incidentService.getIncident(id);
      setDetail(data);
      setStatusUpdate(data.incident.status);
      setUserRating(data.incident.user_rating || null);
      setUserFeedback(data.incident.user_feedback || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incident');
      console.error('Error loading incident:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load AI provider configuration
  const loadAIProvider = async () => {
    try {
      const response = await fetch('/api/settings/ai');
      const data = await response.json();
      if (data.success && data.config) {
        // Capitalize provider name for display
        const providerName = data.config.provider.charAt(0).toUpperCase() + data.config.provider.slice(1);
        setAiProvider(providerName);
      }
    } catch (err) {
      console.error('Error loading AI provider:', err);
      setAiProvider('AI'); // Fallback
    }
  };

  useEffect(() => {
    loadIncident();
    loadAIProvider(); // Load AI provider info
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  
  // Analyze with AI API (Multi-Provider Integration)
  const analyzeWithClaude = async () => {
    if (!id) return;
    
    setAnalyzing(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/ai-incidents/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setAnalysis(data.analysis);
        setAnalysisMeta(data.metadata);
        setPromptDialog(true);
        // Reload incident to show updated analysis
        await loadIncident();
      } else {
        setError(data.message || 'Failed to analyze incident');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze incident');
      console.error('Error analyzing:', err);
    } finally {
      setAnalyzing(false);
    }
  };
  
  // Load Claude prompt (for manual copy/paste)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const loadPrompt = async () => {
    if (!id) return;
    
    setError(null);
    
    try {
      const response = await fetch(`/api/ai-incidents/${id}/prompt`);
      const data = await response.json();
      
      if (data.success) {
        setPrompt(data.prompt);
        setPromptMeta(data.metadata);
        // Don't open dialog yet, just load it
      } else {
        setError('Failed to generate prompt');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate prompt');
      console.error('Error loading prompt:', err);
    }
  };
  
  const copyPrompt = () => {
    navigator.clipboard.writeText(prompt);
    // Could add a success toast here
  };
  
  const openClaude = () => {
    window.open('https://claude.ai', '_blank');
  };

  // Handle decision
  const openDecisionDialog = (recommendation: AIRecommendation, decision: typeof decisionDialog.decision) => {
    setDecisionDialog({ open: true, recommendation, decision });
    setDecisionReason('');
    setActualAction(recommendation.action_type);
  };

  const submitDecision = async () => {
    if (!decisionDialog.recommendation || !id) return;
    
    try {
      await incidentService.recordDecision(
        id,
        decisionDialog.recommendation.id,
        {
          decision: decisionDialog.decision,
          reason: decisionReason,
          actual_action: actualAction,
          actual_action_details: {},
        }
      );
      
      setDecisionDialog({ open: false, recommendation: null, decision: 'accepted' });
      loadIncident(); // Reload to show updated decision
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record decision');
    }
  };

  // Handle outcome submission
  const submitOutcome = async () => {
    if (!id) return;
    
    try {
      const metricsBeforeObj = outcomeForm.metrics_before ? JSON.parse(outcomeForm.metrics_before) : {};
      const metricsAfterObj = outcomeForm.metrics_after ? JSON.parse(outcomeForm.metrics_after) : {};
      
      await incidentService.recordOutcome(id, {
        action_type: outcomeForm.action_type,
        executed_by: 'current_user', // TODO: Get from auth context
        metrics_before: metricsBeforeObj,
        metrics_after: metricsAfterObj,
        outcome_status: outcomeForm.outcome_status,
        incident_resolved: outcomeForm.outcome_status === 'resolved',
        improvement_percentage: outcomeForm.improvement_percentage,
      });
      
      setOutcomeDialog(false);
      loadIncident(); // Reload to show outcome
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record outcome');
    }
  };

  // Handle status/feedback update
  const updateIncidentStatus = async () => {
    if (!id) return;
    
    try {
      await incidentService.updateIncident(id, {
        status: statusUpdate as any,
        user_rating: userRating || undefined,
        user_feedback: userFeedback || undefined,
        resolved_by: statusUpdate === 'resolved' ? 'current_user' : undefined,
      });
      
      loadIncident();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update incident');
    }
  };

  // Utility functions
  const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' => {
    switch (severity) {
      case 'critical': return 'error';
      case 'warning': return 'warning';
      default: return 'info';
    }
  };

  const getRiskColor = (risk: string): 'error' | 'warning' | 'success' => {
    switch (risk) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      default: return 'success';
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!detail) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Incident not found</Alert>
      </Box>
    );
  }

  const { incident, recommendations, outcomes } = detail;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={() => navigate('/ai-incidents')} sx={{ mr: 2 }}>
            <BackIcon />
          </IconButton>
          <Typography variant="h4" component="h1">
            Incident Detail
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="secondary"
          onClick={analyzeWithClaude}
          disabled={analyzing}
          sx={{ minWidth: 200 }}
        >
          {analyzing ? '⏳ Analyzing...' : '🤖 Analyze with AI'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left Column: Incident Info */}
        <Grid item xs={12} md={6}>
          {/* Incident Summary */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Incident Summary
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  Incident ID
                </Typography>
                <Typography variant="body1" fontFamily="monospace">
                  {incident.incident_id}
                </Typography>
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  Event Type
                </Typography>
                <Chip label={incident.event_type} variant="outlined" sx={{ mt: 0.5 }} />
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  Severity
                </Typography>
                <Chip 
                  label={incident.severity} 
                  color={getSeverityColor(incident.severity)} 
                  sx={{ mt: 0.5 }}
                />
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  Summary
                </Typography>
                <Typography variant="body1">
                  {incident.summary}
                </Typography>
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  Detected At
                </Typography>
                <Typography variant="body1">
                  {formatTimestamp(incident.detected_at)}
                </Typography>
              </Box>
              
              {incident.resolved_at && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="textSecondary">
                    Resolved At
                  </Typography>
                  <Typography variant="body1">
                    {formatTimestamp(incident.resolved_at)}
                  </Typography>
                </Box>
              )}
              
              {incident.resolution_time_seconds && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="textSecondary">
                    Resolution Time
                  </Typography>
                  <Typography variant="body1">
                    {Math.round(incident.resolution_time_seconds / 60)} minutes
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Metrics */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Metrics
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box
                component="pre"
                sx={{
                  backgroundColor: '#f5f5f5',
                  p: 2,
                  borderRadius: 1,
                  overflow: 'auto',
                  fontSize: '0.875rem',
                }}
              >
                {JSON.stringify(incident.metrics, null, 2)}
              </Box>
            </CardContent>
          </Card>

          {/* Context */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Context
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box
                component="pre"
                sx={{
                  backgroundColor: '#f5f5f5',
                  p: 2,
                  borderRadius: 1,
                  overflow: 'auto',
                  fontSize: '0.875rem',
                }}
              >
                {JSON.stringify(incident.context, null, 2)}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Recommendations & Actions */}
        <Grid item xs={12} md={6}>
          {/* Recommendations */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {aiProvider} Recommendations ({recommendations.length})
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              {recommendations.length === 0 ? (
                <Typography color="textSecondary" align="center" sx={{ py: 3 }}>
                  No recommendations yet
                </Typography>
              ) : (
                recommendations.map((rec) => (
                  <Accordion key={rec.id} sx={{ mb: 1 }}>
                    <AccordionSummary expandIcon={<ExpandIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                        <Typography sx={{ fontWeight: 'bold' }}>
                          #{rec.recommendation_rank}
                        </Typography>
                        <Chip label={rec.action_type} size="small" />
                        {rec.user_decision && (
                          <Chip 
                            label={rec.user_decision} 
                            size="small" 
                            color={rec.user_decision === 'accepted' ? 'success' : 'default'}
                          />
                        )}
                        <Box sx={{ flex: 1 }} />
                        <LinearProgress 
                          variant="determinate" 
                          value={rec.confidence_score * 100} 
                          sx={{ width: 80, mr: 1 }}
                        />
                        <Typography variant="body2" color="textSecondary">
                          {Math.round(rec.confidence_score * 100)}%
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box>
                        <Typography variant="body2" gutterBottom>
                          <strong>Reasoning:</strong> {rec.reasoning}
                        </Typography>
                        
                        <Box sx={{ display: 'flex', gap: 1, my: 2 }}>
                          <Chip 
                            label={`Risk: ${rec.risk_level}`} 
                            size="small" 
                            color={getRiskColor(rec.risk_level)}
                          />
                          {rec.estimated_fix_time_minutes && (
                            <Chip 
                              label={`~${rec.estimated_fix_time_minutes} min`} 
                              size="small" 
                              variant="outlined"
                            />
                          )}
                        </Box>
                        
                        {!rec.user_decision && (
                          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              startIcon={<AcceptIcon />}
                              onClick={() => openDecisionDialog(rec, 'accepted')}
                            >
                              Accept
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<RejectIcon />}
                              onClick={() => openDecisionDialog(rec, 'rejected')}
                            >
                              Reject
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<ModifyIcon />}
                              onClick={() => openDecisionDialog(rec, 'modified')}
                            >
                              Modify
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<SkipIcon />}
                              onClick={() => openDecisionDialog(rec, 'skipped')}
                            >
                              Skip
                            </Button>
                          </Box>
                        )}
                        
                        {rec.user_decision && (
                          <Box sx={{ mt: 2, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                            <Typography variant="body2">
                              <strong>Decision:</strong> {rec.user_decision}
                            </Typography>
                            {rec.user_decision_reason && (
                              <Typography variant="body2">
                                <strong>Reason:</strong> {rec.user_decision_reason}
                              </Typography>
                            )}
                            {rec.actual_action_taken && (
                              <Typography variant="body2">
                                <strong>Actual Action:</strong> {rec.actual_action_taken}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                ))
              )}
            </CardContent>
          </Card>

          {/* Outcomes */}
          {outcomes.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Action Outcomes ({outcomes.length})
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {outcomes.map((outcome) => (
                  <Box key={outcome.id} sx={{ mb: 2, p: 2, border: '1px solid #ddd', borderRadius: 1 }}>
                    <Typography variant="body2">
                      <strong>Action:</strong> {outcome.action_type}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Status:</strong> {outcome.outcome_status}
                    </Typography>
                    {outcome.improvement_percentage !== null && (
                      <Typography variant="body2">
                        <strong>Improvement:</strong> {outcome.improvement_percentage}%
                      </Typography>
                    )}
                    <Typography variant="body2" color="textSecondary">
                      {formatTimestamp(outcome.executed_at)}
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Record Outcome Button */}
          <Button
            fullWidth
            variant="contained"
            onClick={() => setOutcomeDialog(true)}
            sx={{ mb: 3 }}
          >
            Record Action Outcome
          </Button>

          {/* Status & Feedback */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Status & Feedback
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusUpdate}
                  label="Status"
                  onChange={(e) => setStatusUpdate(e.target.value)}
                >
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="acknowledged">Acknowledged</MenuItem>
                  <MenuItem value="investigating">Investigating</MenuItem>
                  <MenuItem value="resolved">Resolved</MenuItem>
                  <MenuItem value="false_positive">False Positive</MenuItem>
                </Select>
              </FormControl>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Rating
                </Typography>
                <Rating
                  value={userRating}
                  onChange={(_, newValue) => setUserRating(newValue)}
                />
              </Box>
              
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Feedback"
                value={userFeedback}
                onChange={(e) => setUserFeedback(e.target.value)}
                sx={{ mb: 2 }}
              />
              
              <Button
                fullWidth
                variant="contained"
                onClick={updateIncidentStatus}
              >
                Update Status & Feedback
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Decision Dialog */}
      <Dialog open={decisionDialog.open} onClose={() => setDecisionDialog({ ...decisionDialog, open: false })}>
        <DialogTitle>
          {decisionDialog.decision.charAt(0).toUpperCase() + decisionDialog.decision.slice(1)} Recommendation
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Reason"
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
            sx={{ mt: 2, mb: 2 }}
          />
          
          {(decisionDialog.decision === 'accepted' || decisionDialog.decision === 'modified') && (
            <TextField
              fullWidth
              label="Actual Action Taken"
              value={actualAction}
              onChange={(e) => setActualAction(e.target.value)}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecisionDialog({ ...decisionDialog, open: false })}>
            Cancel
          </Button>
          <Button onClick={submitDecision} variant="contained">
            Submit
          </Button>
        </DialogActions>
      </Dialog>

      {/* Outcome Dialog */}
      <Dialog open={outcomeDialog} onClose={() => setOutcomeDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Record Action Outcome</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Action Type"
            value={outcomeForm.action_type}
            onChange={(e) => setOutcomeForm({ ...outcomeForm, action_type: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
          />
          
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Metrics Before (JSON)"
            placeholder='{"latency_p95": 2500, "error_rate": 0.02}'
            value={outcomeForm.metrics_before}
            onChange={(e) => setOutcomeForm({ ...outcomeForm, metrics_before: e.target.value })}
            sx={{ mb: 2 }}
          />
          
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Metrics After (JSON)"
            placeholder='{"latency_p95": 950, "error_rate": 0.001}'
            value={outcomeForm.metrics_after}
            onChange={(e) => setOutcomeForm({ ...outcomeForm, metrics_after: e.target.value })}
            sx={{ mb: 2 }}
          />
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Outcome Status</InputLabel>
            <Select
              value={outcomeForm.outcome_status}
              label="Outcome Status"
              onChange={(e) => setOutcomeForm({ ...outcomeForm, outcome_status: e.target.value as any })}
            >
              <MenuItem value="resolved">Resolved</MenuItem>
              <MenuItem value="partially_resolved">Partially Resolved</MenuItem>
              <MenuItem value="no_change">No Change</MenuItem>
              <MenuItem value="worsened">Worsened</MenuItem>
            </Select>
          </FormControl>
          
          <TextField
            fullWidth
            type="number"
            label="Improvement Percentage"
            value={outcomeForm.improvement_percentage}
            onChange={(e) => setOutcomeForm({ ...outcomeForm, improvement_percentage: Number(e.target.value) })}
            inputProps={{ min: -100, max: 100 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOutcomeDialog(false)}>
            Cancel
          </Button>
          <Button onClick={submitOutcome} variant="contained">
            Submit Outcome
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* AI Analysis Dialog */}
      <Dialog 
        open={promptDialog} 
        onClose={() => setPromptDialog(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {analysis ? `✅ ${aiProvider} Analysis` : `${aiProvider} Prompt`}
            </Typography>
            {analysisMeta && (
              <Chip 
                label={`Actual Cost: $${analysisMeta.cost_usd} • ${analysisMeta.response_time_ms}ms`}
                color="success"
                size="small"
              />
            )}
            {!analysis && promptMeta && (
              <Chip 
                label={`Est. Cost: $${promptMeta.estimated_cost_usd}`}
                color="primary"
                size="small"
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {analysisMeta && (
            <Box sx={{ mb: 2, p: 2, bgcolor: '#e8f5e9', borderRadius: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Typography variant="caption" color="textSecondary">Model:</Typography>
                  <Typography variant="body2">{analysisMeta.model}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="textSecondary">Tokens:</Typography>
                  <Typography variant="body2">
                    {analysisMeta.input_tokens} in + {analysisMeta.output_tokens} out
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="textSecondary">Cost:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    ${analysisMeta.cost_usd}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}
          
          {!analysis && promptMeta && (
            <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Model:</Typography>
                  <Typography variant="body2">{promptMeta.recommended_model}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Est. Tokens:</Typography>
                  <Typography variant="body2">
                    {promptMeta.estimated_tokens} in + 250 out
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}
          
          <Box 
            sx={{ 
              bgcolor: analysis ? '#fff' : '#1e1e1e', 
              color: analysis ? '#000' : '#d4d4d4',
              p: 2, 
              borderRadius: 1, 
              fontFamily: analysis ? 'inherit' : '"Monaco", "Menlo", "Ubuntu Mono", monospace',
              fontSize: analysis ? '14px' : '13px',
              maxHeight: '500px',
              overflow: 'auto',
              border: analysis ? '1px solid #e0e0e0' : 'none'
            }}
          >
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
              {analysis || prompt}
            </pre>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setPromptDialog(false)}>
            Close
          </Button>
          {analysis && (
            <Button 
              onClick={() => {
                navigator.clipboard.writeText(analysis);
              }}
              variant="outlined"
            >
              📋 Copy Analysis
            </Button>
          )}
          {!analysis && (
            <>
              <Button 
                onClick={copyPrompt}
                variant="outlined"
              >
                📋 Copy Prompt
              </Button>
              <Button 
                onClick={openClaude}
                variant="contained"
                color="primary"
              >
                🤖 Open Claude.ai
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AIIncidentDetail;
