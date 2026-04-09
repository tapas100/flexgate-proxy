/**
 * AI Analytics Dashboard
 * 
 * Analytics and insights for AI incident tracking system.
 */

// @ts-nocheck - MUI v7 Grid type compatibility
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  CheckCircle as SuccessIcon,
  Timer as TimerIcon,
  ThumbUp as AcceptIcon,
} from '@mui/icons-material';
import incidentService, { AnalyticsSummary, ActionSuccessRate } from '../services/incidentService';

const AIAnalytics: React.FC = () => {
  // State
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [actionRates, setActionRates] = useState<ActionSuccessRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(30);

  // Load analytics data
  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [summaryData, ratesData] = await Promise.all([
        incidentService.getAnalyticsSummary(timeRange),
        incidentService.getActionSuccessRates(),
      ]);
      
      setSummary(summaryData);
      setActionRates(ratesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  // Utility functions
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const formatPercentage = (value: number | string | null): string => {
    if (value === null || value === undefined) return '0%';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${num.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          AI Analytics
        </Typography>
        
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            label="Time Range"
            onChange={(e) => setTimeRange(Number(e.target.value))}
          >
            <MenuItem value={7}>Last 7 days</MenuItem>
            <MenuItem value={14}>Last 14 days</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={60}>Last 60 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {summary && (
        <>
          {/* Summary Stats */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <TrendingUpIcon color="primary" sx={{ mr: 1 }} />
                    <Typography color="textSecondary" variant="body2">
                      Total Incidents
                    </Typography>
                  </Box>
                  <Typography variant="h4">
                    {summary.incidents.total_incidents}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {summary.incidents.open_count} open, {summary.incidents.resolved_count} resolved
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <SuccessIcon color="success" sx={{ mr: 1 }} />
                    <Typography color="textSecondary" variant="body2">
                      Resolution Rate
                    </Typography>
                  </Box>
                  <Typography variant="h4">
                    {formatPercentage(summary.incidents.resolution_rate)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    of all incidents
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <TimerIcon color="info" sx={{ mr: 1 }} />
                    <Typography color="textSecondary" variant="body2">
                      Avg Resolution Time
                    </Typography>
                  </Box>
                  <Typography variant="h4">
                    {formatDuration(summary.incidents.avg_resolution_time_seconds || 0)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    from detection
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <AcceptIcon color="success" sx={{ mr: 1 }} />
                    <Typography color="textSecondary" variant="body2">
                      Acceptance Rate
                    </Typography>
                  </Box>
                  <Typography variant="h4">
                    {formatPercentage(summary.recommendations.acceptance_rate)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {summary.recommendations.accepted_count} of {summary.recommendations.total_recommendations} recommendations
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Additional Metrics */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Incident Breakdown
                  </Typography>
                  
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">Resolved</Typography>
                      <Typography variant="body2">
                        {summary.incidents.resolved_count} ({formatPercentage(summary.incidents.resolution_rate)})
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={Number(summary.incidents.resolution_rate) || 0} 
                      color="success"
                    />
                  </Box>
                  
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">Open</Typography>
                      <Typography variant="body2">
                        {summary.incidents.open_count}
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={(Number(summary.incidents.open_count) / Number(summary.incidents.total_incidents)) * 100} 
                      color="error"
                    />
                  </Box>
                  
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">False Positives</Typography>
                      <Typography variant="body2">
                        {summary.incidents.false_positive_count}
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={(Number(summary.incidents.false_positive_count) / Number(summary.incidents.total_incidents)) * 100} 
                      color="warning"
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Recommendation Decisions
                  </Typography>
                  
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">Accepted</Typography>
                      <Typography variant="body2">
                        {summary.recommendations.accepted_count} ({formatPercentage(summary.recommendations.acceptance_rate)})
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={Number(summary.recommendations.acceptance_rate) || 0} 
                      color="success"
                    />
                  </Box>
                  
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">Rejected</Typography>
                      <Typography variant="body2">
                        {summary.recommendations.rejected_count}
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={(Number(summary.recommendations.rejected_count) / Number(summary.recommendations.total_recommendations)) * 100} 
                      color="error"
                    />
                  </Box>
                  
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">Modified</Typography>
                      <Typography variant="body2">
                        {summary.recommendations.modified_count}
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={(Number(summary.recommendations.modified_count) / Number(summary.recommendations.total_recommendations)) * 100} 
                      color="primary"
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Quality Metrics */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Average User Rating
                  </Typography>
                  <Typography variant="h3">
                    {(parseFloat(summary.incidents.avg_user_rating) || 0).toFixed(1)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    out of 5.0
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Average AI Confidence
                  </Typography>
                  <Typography variant="h3">
                    {formatPercentage((summary.incidents.avg_ai_confidence || 0) * 100)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    confidence score
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Total Recommendations
                  </Typography>
                  <Typography variant="h3">
                    {summary.recommendations.total_recommendations}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    suggestions provided
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

      {/* Action Success Rates Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Action Type Performance
          </Typography>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Action Type</TableCell>
                  <TableCell align="right">Recommendations</TableCell>
                  <TableCell align="right">Acceptance Rate</TableCell>
                  <TableCell align="right">Resolution Rate</TableCell>
                  <TableCell align="right">Avg Confidence</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {actionRates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="textSecondary">
                        No action data available yet
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  actionRates.map((rate) => (
                    <TableRow key={rate.action_type}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {rate.action_type}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {rate.total_recommendations}
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={Number(rate.acceptance_rate) || 0}
                            sx={{ width: 60 }}
                            color="success"
                          />
                          <Typography variant="body2">
                            {formatPercentage(rate.acceptance_rate)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={Number(rate.resolution_rate) || 0}
                            sx={{ width: 60 }}
                            color="primary"
                          />
                          <Typography variant="body2">
                            {formatPercentage(rate.resolution_rate)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {formatPercentage((rate.avg_confidence || 0) * 100)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* ROI Calculation */}
      {summary && summary.incidents.total_incidents > 0 && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Estimated ROI
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="textSecondary">
                  Time Saved (vs Manual)
                </Typography>
                <Typography variant="h5">
                  {formatDuration(
                    Number(summary.incidents.resolved_count) * 
                    (1800 - (Number(summary.incidents.avg_resolution_time_seconds) || 0)) // Assuming 30min manual avg
                  )}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Assuming 30min manual troubleshooting
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="textSecondary">
                  Incidents Prevented
                </Typography>
                <Typography variant="h5">
                  {summary.incidents.false_positive_count}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  False alarms caught by AI
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="textSecondary">
                  Automation Level
                </Typography>
                <Typography variant="h5">
                  {formatPercentage(summary.recommendations.acceptance_rate)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Recommendations accepted
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default AIAnalytics;
