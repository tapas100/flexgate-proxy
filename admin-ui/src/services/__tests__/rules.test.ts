import { rulesService } from '../rules';
import { apiService } from '../api';

jest.mock('../api');

const mockedApiService = apiService as jest.Mocked<typeof apiService>;

const mockRule = {
  id: 'rps-throttle',
  name: 'High RPS Throttle',
  priority: 10,
  enabled: true,
  continueOnMatch: false,
  condition: { type: 'threshold' as const, metric: 'rps' as const, operator: '>' as const, value: 1000 },
  action: { type: 'throttle' as const, rps: 500 },
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockRuleSet = {
  name: 'default',
  version: 2,
  rules: [mockRule],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('RulesService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getRules', () => {
    it('returns rules array on success', async () => {
      mockedApiService.get.mockResolvedValue({ success: true, data: { count: 1, rules: [mockRule] } });
      const result = await rulesService.getRules();
      expect(result.success).toBe(true);
      expect(result.data).toEqual([mockRule]);
      expect(mockedApiService.get).toHaveBeenCalledWith('/api/intelligence/rules');
    });

    it('returns error on failure', async () => {
      mockedApiService.get.mockResolvedValue({ success: false, error: 'Network error' });
      const result = await rulesService.getRules();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('getRule', () => {
    it('returns a single rule', async () => {
      mockedApiService.get.mockResolvedValue({ success: true, data: mockRule });
      const result = await rulesService.getRule('rps-throttle');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockRule);
      expect(mockedApiService.get).toHaveBeenCalledWith('/api/intelligence/rules/rps-throttle');
    });
  });

  describe('getRuleSet', () => {
    it('returns the current ruleset', async () => {
      mockedApiService.get.mockResolvedValue({ success: true, data: mockRuleSet });
      const result = await rulesService.getRuleSet();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockRuleSet);
      expect(mockedApiService.get).toHaveBeenCalledWith('/api/intelligence/rules/ruleset');
    });
  });

  describe('getHistory', () => {
    it('returns history entries', async () => {
      const mockHistory = { count: 1, history: [{ version: 1, rules: [], replacedAt: '2026-01-01T00:00:00.000Z', reason: 'mutation' }] };
      mockedApiService.get.mockResolvedValue({ success: true, data: mockHistory });
      const result = await rulesService.getHistory();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockHistory);
    });
  });

  describe('createRule', () => {
    it('creates a rule and returns it', async () => {
      mockedApiService.post.mockResolvedValue({ success: true, data: mockRule });
      const payload = { id: mockRule.id, name: mockRule.name, priority: mockRule.priority, enabled: mockRule.enabled, continueOnMatch: mockRule.continueOnMatch, condition: mockRule.condition, action: mockRule.action };
      const result = await rulesService.createRule(payload);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockRule);
      expect(mockedApiService.post).toHaveBeenCalledWith('/api/intelligence/rules', payload);
    });

    it('returns error when server rejects the rule', async () => {
      mockedApiService.post.mockResolvedValue({ success: false, error: 'Validation failed' });
      const result = await rulesService.createRule({ id: 'x', name: 'x', priority: 0, enabled: true, continueOnMatch: false, condition: mockRule.condition, action: mockRule.action });
      expect(result.success).toBe(false);
    });
  });

  describe('updateRule', () => {
    it('updates a rule', async () => {
      const updated = { ...mockRule, enabled: false };
      mockedApiService.put.mockResolvedValue({ success: true, data: updated });
      const result = await rulesService.updateRule('rps-throttle', { enabled: false });
      expect(result.success).toBe(true);
      expect(mockedApiService.put).toHaveBeenCalledWith('/api/intelligence/rules/rps-throttle', { enabled: false });
    });
  });

  describe('deleteRule', () => {
    it('deletes a rule', async () => {
      mockedApiService.delete.mockResolvedValue({ success: true });
      const result = await rulesService.deleteRule('rps-throttle');
      expect(result.success).toBe(true);
      expect(mockedApiService.delete).toHaveBeenCalledWith('/api/intelligence/rules/rps-throttle');
    });
  });

  describe('forceReload', () => {
    it('calls the reload endpoint', async () => {
      mockedApiService.post.mockResolvedValue({ success: true, data: { message: 'Reload triggered', currentVersion: 3 } });
      const result = await rulesService.forceReload();
      expect(result.success).toBe(true);
      expect(mockedApiService.post).toHaveBeenCalledWith('/api/intelligence/rules/reload');
    });
  });

  describe('evaluate', () => {
    it('sends evaluation input and returns result', async () => {
      const input = { metrics: { rps: 1500 }, upstream: 'api', path: '/v1', evaluatedAtMs: Date.now() };
      const mockResult = { matches: [{ ruleId: 'rps-throttle', ruleName: 'High RPS Throttle', priority: 10, action: { type: 'throttle', rps: 500 } }], decidingAction: { type: 'throttle', rps: 500 }, triggered: true, ruleSetVersion: 2, evaluatedAtMs: input.evaluatedAtMs };
      mockedApiService.post.mockResolvedValue({ success: true, data: mockResult });
      const result = await rulesService.evaluate(input);
      expect(result.success).toBe(true);
      expect(result.data?.triggered).toBe(true);
      expect(mockedApiService.post).toHaveBeenCalledWith('/api/intelligence/rules/evaluate', input);
    });
  });
});
