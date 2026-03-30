import { apiService } from './api';
import { ApiResponse } from '../types';

// ── Types mirrored from backend ───────────────────────────────────────────────

export type MetricKey =
  | 'rps'
  | 'errorRate'
  | 'clientErrorRate'
  | 'meanLatencyMs'
  | 'p50LatencyMs'
  | 'p95LatencyMs'
  | 'p99LatencyMs'
  | 'maxLatencyMs'
  | 'requestCount'
  | 'avgRequestBytes'
  | 'avgResponseBytes';

export type RuleOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

export interface ThresholdCondition {
  type: 'threshold';
  metric: MetricKey;
  operator: RuleOperator;
  value: number;
  upstream?: string;
  pathPrefix?: string;
}

export interface AndCondition {
  type: 'and';
  conditions: RuleCondition[];
}

export interface OrCondition {
  type: 'or';
  conditions: RuleCondition[];
}

export interface NotCondition {
  type: 'not';
  condition: RuleCondition;
}

export type RuleCondition = ThresholdCondition | AndCondition | OrCondition | NotCondition;

export interface ThrottleAction {
  type: 'throttle';
  rps: number;
  message?: string;
}

export interface BlockAction {
  type: 'block';
  statusCode: number;
  message: string;
}

export interface AlertAction {
  type: 'alert';
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface RedirectAction {
  type: 'redirect';
  upstream: string;
}

export type RuleAction = ThrottleAction | BlockAction | AlertAction | RedirectAction;

export interface Rule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  condition: RuleCondition;
  action: RuleAction;
  continueOnMatch: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuleSet {
  name: string;
  version: number;
  rules: Rule[];
  createdAt: string;
  updatedAt: string;
}

export interface RuleSetHistoryEntry {
  version: number;
  rules: Rule[];
  replacedAt: string;
  reason: 'mutation' | 'hot-reload';
}

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  priority: number;
  action: RuleAction;
}

export interface EvaluationResult {
  matches: RuleMatch[];
  decidingAction: RuleAction | null;
  triggered: boolean;
  ruleSetVersion: number;
  evaluatedAtMs: number;
}

export interface EvaluationInput {
  metrics: Partial<Record<MetricKey, number>>;
  upstream?: string;
  path?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

class RulesService {
  async getRules(): Promise<ApiResponse<Rule[]>> {
    const res = await apiService.get<{ count: number; rules: Rule[] }>('/api/intelligence/rules');
    if (res.success && res.data) {
      return { success: true, data: (res.data as any).rules ?? [] };
    }
    return { success: false, error: res.error ?? 'Failed to load rules' };
  }

  async getRule(id: string): Promise<ApiResponse<Rule>> {
    return apiService.get<Rule>(`/api/intelligence/rules/${id}`);
  }

  async getRuleSet(): Promise<ApiResponse<RuleSet>> {
    return apiService.get<RuleSet>('/api/intelligence/rules/ruleset');
  }

  async getHistory(): Promise<ApiResponse<{ count: number; history: RuleSetHistoryEntry[] }>> {
    return apiService.get('/api/intelligence/rules/history');
  }

  async createRule(rule: Omit<Rule, 'version' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Rule>> {
    const res = await apiService.post<Rule>('/api/intelligence/rules', rule);
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    // Unwrap nested error messages from the server
    const errData = (res as any).error;
    return { success: false, error: typeof errData === 'string' ? errData : 'Failed to create rule' };
  }

  async updateRule(id: string, patch: Partial<Omit<Rule, 'id' | 'version' | 'createdAt' | 'updatedAt'>>): Promise<ApiResponse<Rule>> {
    return apiService.put<Rule>(`/api/intelligence/rules/${id}`, patch);
  }

  async deleteRule(id: string): Promise<ApiResponse<void>> {
    return apiService.delete<void>(`/api/intelligence/rules/${id}`);
  }

  async forceReload(): Promise<ApiResponse<{ message: string; currentVersion: number }>> {
    return apiService.post('/api/intelligence/rules/reload');
  }

  async evaluate(input: EvaluationInput): Promise<ApiResponse<EvaluationResult>> {
    return apiService.post<EvaluationResult>('/api/intelligence/rules/evaluate', input);
  }
}

export const rulesService = new RulesService();
export default rulesService;
