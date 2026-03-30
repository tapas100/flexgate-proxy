/**
 * Module 3: Rule Engine — Unit Tests
 *
 * Test strategy:
 *   1.  applyOperator()           — all six operators, edge cases
 *   2.  resolveMetric()           — present / missing keys
 *   3.  matchesScope()            — upstream + pathPrefix filters
 *   4.  evaluateCondition()       — threshold, and, or, not, nesting
 *   5.  evaluateRule()            — disabled rules, condition pass/fail
 *   6.  evaluateChain()           — priority ordering, short-circuit, continueOnMatch
 *   7.  validateCondition()       — unknown metric, bad operator
 *   8.  validateRule()            — missing required fields
 *   9.  RuleEngine CRUD           — add / update / delete / version bumping
 *  10.  RuleEngine history        — depth cap, reason tracking
 *  11.  RuleEngine loadRuleSet()  — hot-reload no-op on same version
 *  12.  parseRuleSetFile()        — valid JSON, missing rules array, bad rule
 *  13.  Full end-to-end scenario  — RPS spike triggers throttle
 */

import { resetRuleEngine } from '../RuleEngine';
import {
  applyOperator,
  resolveMetric,
  matchesScope,
  evaluateCondition,
  evaluateRule,
  evaluateChain,
  validateCondition,
  validateRule,
  computeStressScore,
} from '../math';
import { parseRuleSetFile } from '../loader';
import type {
  EvaluationInput,
  Rule,
  RuleSet,
  ThresholdCondition,
} from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput(
  metrics: Partial<EvaluationInput['metrics']> = {},
  overrides: Partial<EvaluationInput> = {},
): EvaluationInput {
  return {
    metrics,
    upstream: 'test-service',
    path: '/api/test',
    evaluatedAtMs: Date.now(),
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'r1',
    name: 'Test Rule',
    priority: 100,
    enabled: true,
    condition: {
      type: 'threshold',
      metric: 'rps',
      operator: '>',
      value: 1000,
    },
    action: { type: 'throttle', rps: 500 },
    continueOnMatch: false,
    version: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRuleSet(rules: Rule[] = []): RuleSet {
  return {
    name: 'test',
    version: 1,
    rules,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

// ─── 1. applyOperator ─────────────────────────────────────────────────────────

describe('applyOperator()', () => {
  test('> true when left > right', () => expect(applyOperator(10, '>', 9)).toBe(true));
  test('> false when left == right', () => expect(applyOperator(10, '>', 10)).toBe(false));
  test('>= true when equal', () => expect(applyOperator(10, '>=', 10)).toBe(true));
  test('< true when left < right', () => expect(applyOperator(5, '<', 6)).toBe(true));
  test('<= true when equal', () => expect(applyOperator(5, '<=', 5)).toBe(true));
  test('== true when equal', () => expect(applyOperator(0, '==', 0)).toBe(true));
  test('!= true when different', () => expect(applyOperator(1, '!=', 2)).toBe(true));
  test('!= false when equal', () => expect(applyOperator(2, '!=', 2)).toBe(false));
  test('handles floats', () => expect(applyOperator(0.1 + 0.2, '>', 0.2)).toBe(true));
});

// ─── 2. resolveMetric ─────────────────────────────────────────────────────────

describe('resolveMetric()', () => {
  const input = makeInput({ rps: 1500, errorRate: 0.05 });

  test('returns present key', () => expect(resolveMetric(input, 'rps')).toBe(1500));
  test('returns 0 for missing key', () => expect(resolveMetric(input, 'p99LatencyMs')).toBe(0));
});

// ─── 3. matchesScope ─────────────────────────────────────────────────────────

describe('matchesScope()', () => {
  const cond: ThresholdCondition = {
    type: 'threshold',
    metric: 'rps',
    operator: '>',
    value: 0,
  };

  test('no filters → always matches', () => {
    expect(matchesScope(cond, makeInput())).toBe(true);
  });

  test('matching upstream passes', () => {
    const c = { ...cond, upstream: 'test-service' };
    expect(matchesScope(c, makeInput({}, { upstream: 'test-service' }))).toBe(true);
  });

  test('non-matching upstream fails', () => {
    const c = { ...cond, upstream: 'other-service' };
    expect(matchesScope(c, makeInput({}, { upstream: 'test-service' }))).toBe(false);
  });

  test('matching pathPrefix passes', () => {
    const c = { ...cond, pathPrefix: '/api' };
    expect(matchesScope(c, makeInput({}, { path: '/api/users' }))).toBe(true);
  });

  test('non-matching pathPrefix fails', () => {
    const c = { ...cond, pathPrefix: '/admin' };
    expect(matchesScope(c, makeInput({}, { path: '/api/users' }))).toBe(false);
  });
});

// ─── 4. evaluateCondition ────────────────────────────────────────────────────

describe('evaluateCondition()', () => {
  const highRps = makeInput({ rps: 2000 });
  const lowRps = makeInput({ rps: 100 });

  test('threshold: rps > 1000 with rps=2000 → true', () => {
    expect(evaluateCondition({ type: 'threshold', metric: 'rps', operator: '>', value: 1000 }, highRps)).toBe(true);
  });

  test('threshold: rps > 1000 with rps=100 → false', () => {
    expect(evaluateCondition({ type: 'threshold', metric: 'rps', operator: '>', value: 1000 }, lowRps)).toBe(false);
  });

  test('and: both true → true', () => {
    expect(evaluateCondition({
      type: 'and',
      conditions: [
        { type: 'threshold', metric: 'rps', operator: '>', value: 1000 },
        { type: 'threshold', metric: 'errorRate', operator: '>', value: 0.01 },
      ],
    }, makeInput({ rps: 2000, errorRate: 0.05 }))).toBe(true);
  });

  test('and: one false → false (short-circuit)', () => {
    expect(evaluateCondition({
      type: 'and',
      conditions: [
        { type: 'threshold', metric: 'rps', operator: '>', value: 1000 },
        { type: 'threshold', metric: 'errorRate', operator: '>', value: 0.5 },
      ],
    }, makeInput({ rps: 2000, errorRate: 0.01 }))).toBe(false);
  });

  test('or: one true → true', () => {
    expect(evaluateCondition({
      type: 'or',
      conditions: [
        { type: 'threshold', metric: 'rps', operator: '>', value: 1000 },
        { type: 'threshold', metric: 'errorRate', operator: '>', value: 0.5 },
      ],
    }, makeInput({ rps: 2000, errorRate: 0.01 }))).toBe(true);
  });

  test('or: both false → false', () => {
    expect(evaluateCondition({
      type: 'or',
      conditions: [
        { type: 'threshold', metric: 'rps', operator: '>', value: 5000 },
        { type: 'threshold', metric: 'errorRate', operator: '>', value: 0.9 },
      ],
    }, makeInput({ rps: 100, errorRate: 0.01 }))).toBe(false);
  });

  test('not: inverts true → false', () => {
    expect(evaluateCondition({
      type: 'not',
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 1000 },
    }, makeInput({ rps: 2000 }))).toBe(false);
  });

  test('not: inverts false → true', () => {
    expect(evaluateCondition({
      type: 'not',
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 1000 },
    }, makeInput({ rps: 10 }))).toBe(true);
  });

  test('nested: and(threshold, or(threshold, threshold))', () => {
    const cond = {
      type: 'and' as const,
      conditions: [
        { type: 'threshold' as const, metric: 'rps' as const, operator: '>' as const, value: 100 },
        {
          type: 'or' as const,
          conditions: [
            { type: 'threshold' as const, metric: 'errorRate' as const, operator: '>' as const, value: 0.5 },
            { type: 'threshold' as const, metric: 'p95LatencyMs' as const, operator: '>' as const, value: 2000 },
          ],
        },
      ],
    };
    expect(evaluateCondition(cond, makeInput({ rps: 200, errorRate: 0.01, p95LatencyMs: 3000 }))).toBe(true);
    expect(evaluateCondition(cond, makeInput({ rps: 200, errorRate: 0.01, p95LatencyMs: 100 }))).toBe(false);
    expect(evaluateCondition(cond, makeInput({ rps: 50, errorRate: 0.8, p95LatencyMs: 3000 }))).toBe(false);
  });
});

// ─── 5. evaluateRule ─────────────────────────────────────────────────────────

describe('evaluateRule()', () => {
  test('returns null when rule is disabled', () => {
    const rule = makeRule({ enabled: false });
    expect(evaluateRule(rule, makeInput({ rps: 9999 }))).toBeNull();
  });

  test('returns null when condition is false', () => {
    const rule = makeRule();
    expect(evaluateRule(rule, makeInput({ rps: 10 }))).toBeNull();
  });

  test('returns RuleMatch when condition is true', () => {
    const rule = makeRule();
    const match = evaluateRule(rule, makeInput({ rps: 2000 }));
    expect(match).not.toBeNull();
    expect(match!.ruleId).toBe('r1');
    expect(match!.action.type).toBe('throttle');
  });
});

// ─── 6. evaluateChain ────────────────────────────────────────────────────────

describe('evaluateChain()', () => {
  test('returns triggered=false when no rules match', () => {
    const rs = makeRuleSet([makeRule()]);
    const result = evaluateChain(rs, makeInput({ rps: 10 }));
    expect(result.triggered).toBe(false);
    expect(result.decidingAction).toBeNull();
    expect(result.matches).toHaveLength(0);
  });

  test('returns first matching rule as decidingAction', () => {
    const r1 = makeRule({ id: 'r1', priority: 10, action: { type: 'block', statusCode: 503, message: 'blocked' } });
    const r2 = makeRule({ id: 'r2', priority: 20, action: { type: 'alert', severity: 'warning', message: 'alert' } });
    const rs = makeRuleSet([r2, r1]); // intentionally reversed
    const result = evaluateChain(rs, makeInput({ rps: 2000 }));
    expect(result.triggered).toBe(true);
    expect(result.decidingAction?.type).toBe('block'); // r1 has lower priority number → higher priority
    expect(result.matches).toHaveLength(1); // stops after first non-continue match
  });

  test('continues past alert rules when continueOnMatch=true', () => {
    const alert = makeRule({
      id: 'alert',
      priority: 10,
      action: { type: 'alert', severity: 'info', message: 'info' },
      continueOnMatch: true,
    });
    const block = makeRule({
      id: 'block',
      priority: 20,
      action: { type: 'block', statusCode: 503, message: 'blocked' },
      continueOnMatch: false,
    });
    const rs = makeRuleSet([alert, block]);
    const result = evaluateChain(rs, makeInput({ rps: 2000 }));
    expect(result.matches).toHaveLength(2);
    expect(result.decidingAction?.type).toBe('block');
  });

  test('skips disabled rules', () => {
    const disabled = makeRule({ id: 'off', enabled: false, priority: 1 });
    const active = makeRule({ id: 'on', priority: 50 });
    const rs = makeRuleSet([disabled, active]);
    const result = evaluateChain(rs, makeInput({ rps: 2000 }));
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.ruleId).toBe('on');
  });

  test('ruleSetVersion is set correctly', () => {
    const rs: RuleSet = { ...makeRuleSet([]), version: 42 };
    const result = evaluateChain(rs, makeInput());
    expect(result.ruleSetVersion).toBe(42);
  });
});

// ─── 7. validateCondition ────────────────────────────────────────────────────

describe('validateCondition()', () => {
  test('valid threshold returns empty errors', () => {
    expect(validateCondition({
      type: 'threshold', metric: 'rps', operator: '>', value: 100,
    })).toHaveLength(0);
  });

  test('unknown metric produces error', () => {
    const errs = validateCondition({
      type: 'threshold', metric: 'bogusMetric' as never, operator: '>', value: 0,
    });
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toContain('unknown metric');
  });

  test('empty and conditions produces error', () => {
    const errs = validateCondition({ type: 'and', conditions: [] });
    expect(errs.length).toBeGreaterThan(0);
  });
});

// ─── 8. validateRule ─────────────────────────────────────────────────────────

describe('validateRule()', () => {
  test('valid rule passes', () => {
    expect(validateRule(makeRule())).toHaveLength(0);
  });

  test('missing id produces error', () => {
    const errs = validateRule({ ...makeRule(), id: undefined as never });
    expect(errs.some((e) => e.includes('id'))).toBe(true);
  });

  test('priority out of range produces error', () => {
    const errs = validateRule({ ...makeRule(), priority: -1 });
    expect(errs.some((e) => e.includes('priority'))).toBe(true);
  });

  test('invalid action type produces error', () => {
    const errs = validateRule({ ...makeRule(), action: { type: 'throttle', rps: -1 } });
    expect(errs.some((e) => e.includes('rps'))).toBe(true);
  });
});

// ─── 9. RuleEngine CRUD ───────────────────────────────────────────────────────

describe('RuleEngine CRUD', () => {
  beforeEach(() => {
    resetRuleEngine(); // fresh instance for each test
  });

  test('addRule() adds a rule and bumps version', () => {
    const engine = resetRuleEngine();
    const v0 = engine.getRuleSet().version;
    engine.addRule({
      id: 'r1',
      name: 'Test',
      priority: 100,
      enabled: true,
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 1000 },
      action: { type: 'throttle', rps: 500 },
      continueOnMatch: false,
    });
    expect(engine.getRuleSet().version).toBe(v0 + 1);
    expect(engine.getRules()).toHaveLength(1);
  });

  test('addRule() rejects duplicate id', () => {
    const engine = resetRuleEngine();
    const rule = {
      id: 'dup',
      name: 'Dup',
      priority: 100,
      enabled: true,
      condition: { type: 'threshold' as const, metric: 'rps' as const, operator: '>' as const, value: 0 },
      action: { type: 'alert' as const, severity: 'info' as const, message: 'x' },
      continueOnMatch: false,
    };
    engine.addRule(rule);
    expect(() => engine.addRule(rule)).toThrow(/already exists/);
  });

  test('updateRule() patches the rule and bumps both rule and ruleset versions', () => {
    const engine = resetRuleEngine();
    engine.addRule({
      id: 'u1',
      name: 'Before',
      priority: 50,
      enabled: true,
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 100 },
      action: { type: 'alert', severity: 'info', message: 'hi' },
      continueOnMatch: false,
    });
    const setVersionBefore = engine.getRuleSet().version;
    const updated = engine.updateRule('u1', { name: 'After', priority: 10 });
    expect(updated.name).toBe('After');
    expect(updated.priority).toBe(10);
    expect(updated.version).toBe(2);
    expect(engine.getRuleSet().version).toBe(setVersionBefore + 1);
  });

  test('deleteRule() removes the rule and bumps version', () => {
    const engine = resetRuleEngine();
    engine.addRule({
      id: 'del',
      name: 'ToDelete',
      priority: 100,
      enabled: true,
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 0 },
      action: { type: 'alert', severity: 'info', message: 'bye' },
      continueOnMatch: false,
    });
    const v = engine.getRuleSet().version;
    engine.deleteRule('del');
    expect(engine.getRules()).toHaveLength(0);
    expect(engine.getRuleSet().version).toBe(v + 1);
  });

  test('deleteRule() throws on unknown id', () => {
    const engine = resetRuleEngine();
    expect(() => engine.deleteRule('nonexistent')).toThrow(/not found/);
  });
});

// ─── 10. RuleEngine history ────────────────────────────────────────────────────

describe('RuleEngine history', () => {
  test('history grows on each mutation', () => {
    const engine = resetRuleEngine({ maxHistoryDepth: 5 });
    const rule = {
      id: 'h1',
      name: 'H',
      priority: 100,
      enabled: true,
      condition: { type: 'threshold' as const, metric: 'rps' as const, operator: '>' as const, value: 0 },
      action: { type: 'alert' as const, severity: 'info' as const, message: 'x' },
      continueOnMatch: false,
    };
    engine.addRule(rule);
    engine.updateRule('h1', { name: 'H2' });
    expect(engine.getHistory().length).toBe(2);
  });

  test('history is capped at maxHistoryDepth', () => {
    const engine = resetRuleEngine({ maxHistoryDepth: 3 });
    const base = {
      name: 'X',
      priority: 100,
      enabled: true,
      condition: { type: 'threshold' as const, metric: 'rps' as const, operator: '>' as const, value: 0 },
      action: { type: 'alert' as const, severity: 'info' as const, message: 'x' },
      continueOnMatch: false,
    };
    engine.addRule({ id: 'x1', ...base });
    engine.updateRule('x1', { name: 'X2' });
    engine.updateRule('x1', { name: 'X3' });
    engine.updateRule('x1', { name: 'X4' });
    expect(engine.getHistory().length).toBeLessThanOrEqual(3);
  });

  test('history entries carry correct reason', () => {
    const engine = resetRuleEngine();
    engine.addRule({
      id: 'r',
      name: 'R',
      priority: 100,
      enabled: true,
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 0 },
      action: { type: 'alert', severity: 'info', message: 'x' },
      continueOnMatch: false,
    });
    const hist = engine.getHistory();
    expect(hist[0]!.reason).toBe('mutation');
  });
});

// ─── 11. loadRuleSet no-op on same version ────────────────────────────────────

describe('RuleEngine.loadRuleSet()', () => {
  test('no-op when incoming version matches current', () => {
    const engine = resetRuleEngine();
    const rs = engine.getRuleSet();
    const histBefore = engine.getHistory().length;
    engine.loadRuleSet(rs); // same object, same version
    expect(engine.getHistory().length).toBe(histBefore); // no history entry pushed
  });

  test('replaces ruleset and pushes history when version differs', () => {
    const engine = resetRuleEngine();
    const incoming: RuleSet = {
      name: 'reloaded',
      version: 999,
      rules: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    engine.loadRuleSet(incoming);
    expect(engine.getRuleSet().version).toBe(999);
    expect(engine.getHistory().length).toBe(1);
    expect(engine.getHistory()[0]!.reason).toBe('hot-reload');
  });
});

// ─── 12. parseRuleSetFile ─────────────────────────────────────────────────────

describe('parseRuleSetFile()', () => {
  test('parses a valid JSON rules file', () => {
    const json = JSON.stringify({
      name: 'prod',
      version: 7,
      rules: [
        {
          id: 'rps-throttle',
          name: 'RPS Throttle',
          priority: 10,
          enabled: true,
          condition: { type: 'threshold', metric: 'rps', operator: '>', value: 1000 },
          action: { type: 'throttle', rps: 500 },
          continueOnMatch: false,
        },
      ],
    });
    const rs = parseRuleSetFile('rules.json', json);
    expect(rs.name).toBe('prod');
    expect(rs.version).toBe(7);
    expect(rs.rules).toHaveLength(1);
    expect(rs.rules[0]!.id).toBe('rps-throttle');
  });

  test('throws when "rules" array is missing', () => {
    const json = JSON.stringify({ name: 'x' });
    expect(() => parseRuleSetFile('rules.json', json)).toThrow(/"rules" array/);
  });

  test('throws on invalid JSON', () => {
    expect(() => parseRuleSetFile('rules.json', '{ bad json')).toThrow();
  });

  test('throws when a rule fails validation', () => {
    const json = JSON.stringify({
      rules: [
        { id: 'bad', name: 'Bad', priority: -1, enabled: true,
          condition: { type: 'threshold', metric: 'rps', operator: '>', value: 0 },
          action: { type: 'alert', severity: 'info', message: 'x' } },
      ],
    });
    expect(() => parseRuleSetFile('rules.json', json)).toThrow(/Validation failed/);
  });

  test('auto-assigns version when omitted', () => {
    const json = JSON.stringify({
      rules: [
        { id: 'auto', name: 'Auto', priority: 100, enabled: true,
          condition: { type: 'threshold', metric: 'rps', operator: '>', value: 0 },
          action: { type: 'alert', severity: 'info', message: 'ok' } },
      ],
    });
    const rs = parseRuleSetFile('rules.json', json);
    expect(typeof rs.version).toBe('number');
    expect(rs.version).toBeGreaterThan(0);
  });
});

// ─── 13. End-to-end: RPS spike triggers throttle ──────────────────────────────

describe('End-to-end: RPS spike throttle', () => {
  test('block action fires when rps exceeds threshold', () => {
    const engine = resetRuleEngine();
    engine.addRule({
      id: 'spike-block',
      name: 'Block on RPS > 1000',
      priority: 10,
      enabled: true,
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 1000 },
      action: { type: 'block', statusCode: 503, message: 'Traffic spike — service protected' },
      continueOnMatch: false,
    });

    const highLoad = makeInput({ rps: 1500, errorRate: 0.02 });
    const result = engine.evaluate(highLoad);

    expect(result.triggered).toBe(true);
    expect(result.decidingAction?.type).toBe('block');

    const normalLoad = makeInput({ rps: 200 });
    const ok = engine.evaluate(normalLoad);
    expect(ok.triggered).toBe(false);
  });

  test('alert fires on high error rate without blocking', () => {
    const engine = resetRuleEngine();
    engine.addRule({
      id: 'error-alert',
      name: 'Alert on high error rate',
      priority: 20,
      enabled: true,
      condition: { type: 'threshold', metric: 'errorRate', operator: '>=', value: 0.1 },
      action: { type: 'alert', severity: 'critical', message: 'Error rate >= 10%' },
      continueOnMatch: true,
    });
    engine.addRule({
      id: 'latency-throttle',
      name: 'Throttle on high latency',
      priority: 30,
      enabled: true,
      condition: { type: 'threshold', metric: 'p95LatencyMs', operator: '>', value: 2000 },
      action: { type: 'throttle', rps: 100 },
      continueOnMatch: false,
    });

    const badInput = makeInput({ errorRate: 0.15, p95LatencyMs: 3000 });
    const result = engine.evaluate(badInput);

    expect(result.triggered).toBe(true);
    expect(result.matches).toHaveLength(2); // both fired
    expect(result.matches[0]!.ruleId).toBe('error-alert');
    expect(result.decidingAction?.type).toBe('throttle');
  });
});

// Auto-expiry

describe('evaluateRule() auto-expiry', () => {
  test('expired rule returns null', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const rule = makeRule({ expiresAt: past });
    const input = makeInput({ rps: 2000 });
    expect(evaluateRule(rule, input)).toBeNull();
  });

  test('non-expired rule still fires', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const rule = makeRule({ expiresAt: future });
    const input = makeInput({ rps: 2000 });
    expect(evaluateRule(rule, input)).not.toBeNull();
  });

  test('rule without expiresAt fires normally', () => {
    const rule = makeRule();
    const input = makeInput({ rps: 2000 });
    expect(evaluateRule(rule, input)).not.toBeNull();
  });

  test('expired rules are skipped in evaluateChain', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const rs = makeRuleSet([makeRule({ id: 'expired', expiresAt: past })]);
    const result = evaluateChain(rs, makeInput({ rps: 2000 }));
    expect(result.triggered).toBe(false);
  });
});

// Cooldown

describe('RuleEngine cooldown', () => {
  test('rule does not re-fire within cooldown window', () => {
    const engine = resetRuleEngine();
    engine.addRule({
      id: 'cd-rule',
      name: 'Cooldown test',
      priority: 10,
      enabled: true,
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 100 },
      action: { type: 'alert', severity: 'info', message: 'rps spike' },
      continueOnMatch: true,
      cooldownMs: 30_000,
    });

    const input = makeInput({ rps: 500 });

    const first = engine.evaluate(input);
    expect(first.triggered).toBe(true);

    // Second call within cooldown  same scope keywindow 
    const second = engine.evaluate(input);
    expect(second.triggered).toBe(false);
  });

  test('rule fires again after cooldown expires', () => {
    const engine = resetRuleEngine();
    engine.addRule({
      id: 'cd-rule2',
      name: 'Cooldown expiry test',
      priority: 10,
      enabled: true,
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 100 },
      action: { type: 'alert', severity: 'info', message: 'rps spike' },
      continueOnMatch: true,
      cooldownMs: 100, // 100 ms cooldown
    });

    const nowMs = Date.now();
    const first = engine.evaluate(makeInput({ rps: 500 }, { evaluatedAtMs: nowMs }));
    expect(first.triggered).toBe(true);

    // Still within cooldown
    const second = engine.evaluate(makeInput({ rps: 500 }, { evaluatedAtMs: nowMs + 50 }));
    expect(second.triggered).toBe(false);

    // After cooldown has elapsed
    const third = engine.evaluate(makeInput({ rps: 500 }, { evaluatedAtMs: nowMs + 200 }));
    expect(third.triggered).toBe(true);
  });

  test('cooldown is scoped per upstream+path', () => {
    const engine = resetRuleEngine();
    engine.addRule({
      id: 'cd-scope',
      name: 'Scope test',
      priority: 10,
      enabled: true,
      condition: { type: 'threshold', metric: 'rps', operator: '>', value: 100 },
      action: { type: 'alert', severity: 'info', message: 'rps spike' },
      continueOnMatch: true,
      cooldownMs: 30_000,
    });

    const svcA = makeInput({ rps: 500 }, { upstream: 'svc-a', path: '/api/a' });
    const svcB = makeInput({ rps: 500 }, { upstream: 'svc-b', path: '/api/b' });

    const firstA = engine.evaluate(svcA);
    expect(firstA.triggered).toBe(true);

    // Different  should fire despite cooldown on svc-ascope 
    const firstB = engine.evaluate(svcB);
    expect(firstB.triggered).toBe(true);

    // svc-a still in cooldown
    const secondA = engine.evaluate(svcA);
    expect(secondA.triggered).toBe(false);
  });

  test('parseRuleSetFile preserves cooldownMs and expiresAt', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const json = JSON.stringify({
      rules: [{
        id: 'r1',
        name: 'R1',
        priority: 100,
        enabled: true,
        condition: { type: 'threshold', metric: 'rps', operator: '>', value: 0 },
        action: { type: 'alert', severity: 'info', message: 'ok' },
        cooldownMs: 5000,
        expiresAt: future,
      }],
    });
    const rs = parseRuleSetFile('rules.json', json);
    expect(rs.rules[0]!.cooldownMs).toBe(5000);
    expect(rs.rules[0]!.expiresAt).toBe(future);
  });
});

// Stress score

describe('computeStressScore()', () => {
  test('all zeros produce 0', () => {
    expect(computeStressScore(0, 0, 0)).toBe(0);
  });

  test('max values produce 1', () => {
    expect(computeStressScore(1, 3, 3)).toBeCloseTo(1.0);
  });

  test('only error rate contributes (50% weight)', () => {
    expect(computeStressScore(1, 0, 0)).toBeCloseTo(0.5);
  });

  test('only p95 z-score at 3 contributes (30% weight)', () => {
    expect(computeStressScore(0, 3, 0)).toBeCloseTo(0.3);
  });

  test('only rps z-score at 3 contributes (20% weight)', () => {
    expect(computeStressScore(0, 0, 3)).toBeCloseTo(0.2);
  });

  test('negative z-scores are clamped to 0', () => {
    expect(computeStressScore(0, -5, -5)).toBe(0);
  });

  test('z-scores > 3 are clamped to contribution ceiling', () => {
    expect(computeStressScore(0, 99, 99)).toBeCloseTo(0.5); // 0.3 + 0.2
  });

  test('stressScore rule condition works end-to-end', () => {
    const engine = resetRuleEngine();
    engine.addRule({
      id: 'stress-alert',
      name: 'High stress',
      priority: 10,
      enabled: true,
      condition: { type: 'threshold', metric: 'stressScore', operator: '>', value: 0.4 },
      action: { type: 'alert', severity: 'critical', message: 'high stress' },
      continueOnMatch: true,
    });
    const score = computeStressScore(1, 0, 0); // 0.5
    const result = engine.evaluate(makeInput({ stressScore: score }));
    expect(result.triggered).toBe(true);
  });
});
