/**
 * AI Incident Tracking Service
 * 
 * Client-side service for interacting with AI incident tracking API endpoints.
 * Handles incidents, recommendations, outcomes, and analytics.
 */

const API_BASE = '/api/ai-incidents';

export interface AIIncident {
  incident_id: string;
  event_type: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  metrics: Record<string, any>;
  context: Record<string, any>;
  status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';
  user_rating?: number;
  user_feedback?: string;
  detected_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_time_seconds?: number;
}

export interface AIRecommendation {
  id: number;
  incident_id: string;
  recommendation_rank: number;
  action_type: string;
  action_details: Record<string, any>;
  reasoning: string;
  confidence_score: number;
  estimated_fix_time_minutes?: number;
  risk_level: 'low' | 'medium' | 'high';
  user_decision?: 'accepted' | 'rejected' | 'modified' | 'skipped';
  user_decision_at?: string;
  user_decision_reason?: string;
  actual_action_taken?: string;
  actual_action_details?: Record<string, any>;
  claude_prompt?: string;
  claude_response?: Record<string, any>;
  claude_model?: string;
  claude_tokens_used?: number;
  claude_cost_usd?: number;
  created_at: string;
}

export interface AIActionOutcome {
  id: number;
  incident_id: string;
  recommendation_id: number;
  action_type: string;
  action_details: Record<string, any>;
  executed_by: string;
  metrics_before?: Record<string, any>;
  metrics_after?: Record<string, any>;
  metrics_checked_at?: string;
  outcome_status: 'resolved' | 'partially_resolved' | 'no_change' | 'worsened';
  improvement_percentage?: number;
  incident_resolved: boolean;
  success_score: number;
  executed_at: string;
}

export interface IncidentDetail {
  incident: AIIncident;
  recommendations: AIRecommendation[];
  outcomes: AIActionOutcome[];
}

export interface IncidentListParams {
  status?: string;
  event_type?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}

export interface IncidentListResponse {
  incidents: AIIncident[];
  total: number;
  limit: number;
  offset: number;
}

export interface AnalyticsSummary {
  incidents: {
    total_incidents: number;
    resolved_count: number;
    open_count: number;
    false_positive_count: number;
    avg_resolution_time_seconds: number;
    avg_user_rating: number;
    avg_ai_confidence: number;
    resolution_rate: number;
  };
  recommendations: {
    total_recommendations: number;
    accepted_count: number;
    rejected_count: number;
    modified_count: number;
    acceptance_rate: number;
  };
}

export interface ActionSuccessRate {
  action_type: string;
  total_recommendations: number;
  accepted_count: number;
  rejected_count: number;
  resolved_count: number;
  acceptance_rate: number;
  resolution_rate: number;
  avg_confidence: number;
}

class IncidentService {
  /**
   * List incidents with optional filtering
   */
  async listIncidents(params: IncidentListParams = {}): Promise<IncidentListResponse> {
    const queryParams = new URLSearchParams();
    
    if (params.status) queryParams.append('status', params.status);
    if (params.event_type) queryParams.append('event_type', params.event_type);
    if (params.severity) queryParams.append('severity', params.severity);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    
    const url = `${API_BASE}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch incidents: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }

  /**
   * Get incident detail with recommendations and outcomes
   */
  async getIncident(incidentId: string): Promise<IncidentDetail> {
    const response = await fetch(`${API_BASE}/${incidentId}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch incident: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }

  /**
   * Create new incident from AI event
   */
  async createIncident(event: any): Promise<AIIncident> {
    const response = await fetch(API_BASE, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create incident: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }

  /**
   * Update incident status and feedback
   */
  async updateIncident(
    incidentId: string,
    updates: {
      status?: AIIncident['status'];
      user_rating?: number;
      user_feedback?: string;
      resolved_by?: string;
    }
  ): Promise<AIIncident> {
    const response = await fetch(`${API_BASE}/${incidentId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update incident: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }

  /**
   * Add Claude recommendations to an incident
   */
  async addRecommendations(
    incidentId: string,
    data: {
      recommendations: Array<{
        action_type: string;
        action_details?: Record<string, any>;
        reasoning: string;
        confidence_score?: number;
        estimated_fix_time_minutes?: number;
        risk_level?: 'low' | 'medium' | 'high';
        estimated_cost_usd?: number;
        expected_benefit?: string;
      }>;
      prompt?: string;
      claude_response?: Record<string, any>;
      model?: string;
      tokens_used?: number;
      cost_usd?: number;
    }
  ): Promise<AIRecommendation[]> {
    const response = await fetch(`${API_BASE}/${incidentId}/recommendations`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add recommendations: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }

  /**
   * Record user decision on a recommendation
   */
  async recordDecision(
    incidentId: string,
    recommendationId: number,
    data: {
      decision: 'accepted' | 'rejected' | 'modified' | 'skipped';
      reason?: string;
      actual_action?: string;
      actual_action_details?: Record<string, any>;
    }
  ): Promise<AIRecommendation> {
    const response = await fetch(
      `${API_BASE}/${incidentId}/recommendations/${recommendationId}/decision`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to record decision: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }

  /**
   * Record action outcome with metrics
   */
  async recordOutcome(
    incidentId: string,
    data: {
      recommendation_id?: number;
      action_type: string;
      action_details?: Record<string, any>;
      executed_by: string;
      metrics_before?: Record<string, any>;
      metrics_after?: Record<string, any>;
      outcome_status: 'resolved' | 'partially_resolved' | 'no_change' | 'worsened';
      incident_resolved: boolean;
      improvement_percentage?: number;
    }
  ): Promise<AIActionOutcome> {
    const response = await fetch(`${API_BASE}/${incidentId}/outcomes`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to record outcome: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }

  /**
   * Get analytics summary
   */
  async getAnalyticsSummary(days: number = 30): Promise<AnalyticsSummary> {
    const response = await fetch(`${API_BASE}/analytics/summary?days=${days}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch analytics: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }

  /**
   * Get action success rates by action type
   */
  async getActionSuccessRates(): Promise<ActionSuccessRate[]> {
    const response = await fetch(`${API_BASE}/analytics/action-success-rates`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch success rates: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }
}

export const incidentService = new IncidentService();
export default incidentService;
