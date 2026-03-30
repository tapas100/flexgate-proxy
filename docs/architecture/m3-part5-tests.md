# Module 3 — Rule Engine: Part 5 of 5 — Tests & Constraints

Write all tests in `src/intelligence/rules/__tests__/RuleEngine.test.ts`.
Use `describe()` blocks. No `.skip`, no stubs. All must pass.

---

## Helpers to define at the top of the test file

```typescript
import { evaluateLeaf, evaluateCondition, matchesScope, isRuleActive,
         buildStressScore, buildContext, validateRuleset } from '../math';
import { RuleEngine, getRuleEngine, resetRuleEngine } from '../RuleEngine';
import type { Rule, Ruleset, RuleContext, LeafCondition, Condition } from '../types';

const SCHEMA_VERSION = 1;

function makeRuleset(overrides: Partial<Ruleset> = {}, rules: Rule[] = []): Ruleset {
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesetVersion: 1,
    updatedAt: new Date().toISOString(),
    rules,
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'test-rule',
    version: 1,
    enabled: true,
    priority: 10,
    name: 'Test Rule',
    condition: { type: 'leaf', field: 'rps', op: 'gt', value: 100 },
    action: { type: 'throttle', params: { maxRps: 50 }, stopOnMatch: true },
    ...overrides,
  };
}

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    rps: 0, requestCount: 0, errorRate: 0, clientErrorRate: 0,
    meanLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0, p99LatencyMs: 0,
    maxLatencyMs: 0, isRepetitive: 0, dominanceRatio: 0,
    avgRequestBytes: 0, avgResponseBytes: 0,
    isAnomaly: 0, zScore: 0, trendRising: 0, trendFalling: 0,
    anomalyConfidence: 0, stressScore: 0,
    ...overrides,
  };
}
```

---

## Group 1: `validateRuleset()` — 12 tests

```typescript
describe('validateRuleset()', () => {
  test('valid minimal ruleset → no errors', () => {
    expect(validateRuleset(makeRuleset({}, [makeRule()]))).toEqual([]);
  });

  test('missing schemaVersion → error', () => {
    const r = makeRuleset() as any;
    delete r.schemaVersion;
    expect(validateRuleset(r).some(e => e.path === 'schemaVersion')).toBe(true);
  });

  test('schemaVersion: 2 (unknown) → error', () => {
    expect(validateRuleset({ ...makeRuleset(), schemaVersion: 2 })
      .some(e => e.path === 'schemaVersion')).toBe(true);
  });

  test('rules not an array → error', () => {
    expect(validateRuleset({ ...makeRuleset(), rules: 'bad' as any })
      .some(e => e.path === 'rules')).toBe(true);
  });

  test('rule missing id → error at rules[0].id', () => {
    const rule = { ...makeRule(), id: '' };
    expect(validateRuleset(makeRuleset({}, [rule]))
      .some(e => e.path.includes('id'))).toBe(true);
  });

  test('duplicate rule ids → error at second rule', () => {
    const r1 = makeRule({ id: 'dup' });
    const r2 = makeRule({ id: 'dup', priority: 20 });
    expect(validateRuleset(makeRuleset({}, [r1, r2]))
      .some(e => e.path.includes('id'))).toBe(true);
  });

  test('unknown action.type → error', () => {
    const rule = makeRule({ action: { type: 'explode' as any, params: {}, stopOnMatch: true } });
    expect(validateRuleset(makeRuleset({}, [rule]))
      .some(e => e.path.includes('action.type'))).toBe(true);
  });

  test('unknown condition field → error', () => {
    const rule = makeRule({
      condition: { type: 'leaf', field: 'unknownField' as any, op: 'gt', value: 0 },
    });
    expect(validateRuleset(makeRuleset({}, [rule]))
      .some(e => e.message.toLowerCase().includes('field'))).toBe(true);
  });

  test('unknown condition op → error', () => {
    const rule = makeRule({
      condition: { type: 'leaf', field: 'rps', op: 'between' as any, value: 0 },
    });
    expect(validateRuleset(makeRuleset({}, [rule])).length).toBeGreaterThan(0);
  });

  test('compound not with 2 children → error', () => {
    const rule = makeRule({
      condition: {
        type: 'compound', op: 'not',
        conditions: [
          { type: 'leaf', field: 'rps', op: 'gt', value: 0 },
          { type: 'leaf', field: 'rps', op: 'gt', value: 0 },
        ],
      },
    });
    expect(validateRuleset(makeRuleset({}, [rule])).length).toBeGreaterThan(0);
  });

  test('compound and with empty children → valid (vacuous truth)', () => {
    const rule = makeRule({
      condition: { type: 'compound', op: 'and', conditions: [] },
    });
    expect(validateRuleset(makeRuleset({}, [rule]))).toEqual([]);
  });

  test('expiresAt non-ISO string → error', () => {
    const rule = makeRule({ expiresAt: 'not-a-date' });
    expect(validateRuleset(makeRuleset({}, [rule]))
      .some(e => e.path.includes('expiresAt'))).toBe(true);
  });
});
```

---

## Group 2: `evaluateLeaf()` — 8 tests

```typescript
describe('evaluateLeaf()', () => {
  const ctx = makeContext({ rps: 1001, errorRate: 0.5, isRepetitive: 1 });

  test('gt: value above threshold → true',  () =>
    expect(evaluateLeaf({ type: 'leaf', field: 'rps', op: 'gt',  value: 1000 }, ctx)).toBe(true));
  test('gt: value at threshold → false',    () =>
    expect(evaluateLeaf({ type: 'leaf', field: 'rps', op: 'gt',  value: 1001 }, ctx)).toBe(false));
  test('gte: value at threshold → true',    () =>
    expect(evaluateLeaf({ type: 'leaf', field: 'rps', op: 'gte', value: 1001 }, ctx)).toBe(true));
  test('lt: value below threshold → true',  () =>
    expect(evaluateLeaf({ type: 'leaf', field: 'errorRate', op: 'lt', value: 1.0 }, ctx)).toBe(true));
  test('lte: value at threshold → true',    () =>
    expect(evaluateLeaf({ type: 'leaf', field: 'errorRate', op: 'lte', value: 0.5 }, ctx)).toBe(true));
  test('eq: exact match → true',            () =>
    expect(evaluateLeaf({ type: 'leaf', field: 'isRepetitive', op: 'eq', value: 1 }, ctx)).toBe(true));
  test('neq: different value → true',       () =>
    expect(evaluateLeaf({ type: 'leaf', field: 'isRepetitive', op: 'neq', value: 0 }, ctx)).toBe(true));
  test('unknown field → false (no throw)',  () =>
    expect(evaluateLeaf({ type: 'leaf', field: 'nonExistent' as any, op: 'gt', value: 0 }, ctx)).toBe(false));
});
```

---

## Group 3: `evaluateCondition()` — 10 tests

```typescript
describe('evaluateCondition()', () => {
  const high = makeContext({ rps: 2000, errorRate: 0.8, isAnomaly: 1 });
  const low  = makeContext({ rps: 10,   errorRate: 0.1, isAnomaly: 0 });
  const leaf = (f: keyof RuleContext, op: any, v: number): Condition =>
    ({ type: 'leaf', field: f, op, value: v });

  test('leaf true',  () => expect(evaluateCondition(leaf('rps', 'gt', 100), high)).toBe(true));
  test('leaf false', () => expect(evaluateCondition(leaf('rps', 'gt', 100), low)).toBe(false));
  test('and: both true → true',   () => expect(evaluateCondition({ type: 'compound', op: 'and', conditions: [leaf('rps', 'gt', 100), leaf('errorRate', 'gt', 0.5)] }, high)).toBe(true));
  test('and: one false → false',  () => expect(evaluateCondition({ type: 'compound', op: 'and', conditions: [leaf('rps', 'gt', 100), leaf('errorRate', 'gt', 0.5)] }, low)).toBe(false));
  test('or: one true → true',     () => expect(evaluateCondition({ type: 'compound', op: 'or',  conditions: [leaf('rps', 'gt', 100), leaf('errorRate', 'gt', 0.5)] }, low)).toBe(false));
  test('or: both false → false',  () => expect(evaluateCondition({ type: 'compound', op: 'or',  conditions: [leaf('rps', 'gt', 9999), leaf('errorRate', 'gt', 0.9)] }, low)).toBe(false));
  test('not: false child → true', () => expect(evaluateCondition({ type: 'compound', op: 'not', conditions: [leaf('rps', 'gt', 9999)] }, low)).toBe(true));
  test('not: true child → false', () => expect(evaluateCondition({ type: 'compound', op: 'not', conditions: [leaf('rps', 'gt', 100)] }, high)).toBe(false));
  test('and [] → true',           () => expect(evaluateCondition({ type: 'compound', op: 'and', conditions: [] }, low)).toBe(true));
  test('nested: (rps>100 AND err>0.5) OR isAnomaly=1 — high context → true', () =>
    expect(evaluateCondition({
      type: 'compound', op: 'or',
      conditions: [
        { type: 'compound', op: 'and', conditions: [leaf('rps', 'gt', 100), leaf('errorRate', 'gt', 0.5)] },
        leaf('isAnomaly', 'eq', 1),
      ],
    }, high)).toBe(true));
});
```

---

## Group 4: `matchesScope()` — 6 tests

```typescript
describe('matchesScope()', () => {
  const rule = makeRule({ scope: undefined });
  test('no scope → always matches', () =>
    expect(matchesScope(rule, 'any-service', '/any/path')).toBe(true));
  test('upstream in list → true', () =>
    expect(matchesScope(makeRule({ scope: { upstreams: ['pay'] } }), 'pay', '/a')).toBe(true));
  test('upstream not in list → false', () =>
    expect(matchesScope(makeRule({ scope: { upstreams: ['pay'] } }), 'auth', '/a')).toBe(false));
  test('path matches prefix → true', () =>
    expect(matchesScope(makeRule({ scope: { pathPrefixes: ['/api/pay'] } }), 'x', '/api/payments/charge')).toBe(true));
  test('path does not match prefix → false', () =>
    expect(matchesScope(makeRule({ scope: { pathPrefixes: ['/api/pay'] } }), 'x', '/api/users')).toBe(false));
  test('both scope fields set: upstream matches, path does not → false', () =>
    expect(matchesScope(makeRule({ scope: { upstreams: ['pay'], pathPrefixes: ['/api/pay'] } }), 'pay', '/api/users')).toBe(false));
});
```

---

## Group 5: `buildStressScore()` — 6 tests

```typescript
describe('buildStressScore()', () => {
  test('all zeros → 0',               () => expect(buildStressScore(0,   0, 0)).toBe(0));
  test('errorRate=1 only → 0.5',      () => expect(buildStressScore(1,   0, 0)).toBeCloseTo(0.5));
  test('p95ZScore=3 only → 0.3',      () => expect(buildStressScore(0,   3, 0)).toBeCloseTo(0.3));
  test('rpsZScore=3 only → 0.2',      () => expect(buildStressScore(0,   0, 3)).toBeCloseTo(0.2));
  test('all maxed → 1.0',             () => expect(buildStressScore(1,   3, 3)).toBeCloseTo(1.0));
  test('NaN p95ZScore → 0 for that component, others unaffected', () =>
    expect(buildStressScore(1, NaN, 0)).toBeCloseTo(0.5));
});
```

---

## Group 6: `buildContext()` — 4 tests

```typescript
describe('buildContext()', () => {
  // Build a mock WindowSnapshot and AnomalySignal matching the actual interfaces
  // then verify the context fields are mapped correctly.
  test('Module 1 fields mapped correctly from WindowSnapshot', ...);
  test('Module 2 fields mapped correctly from non-null AnomalySignal', ...);
  test('null AnomalySignal → all anomaly fields = 0', ...);
  test('stressScore is non-zero when errorRate > 0', ...);
});
```

---

## Group 7: `isRuleActive()` — 4 tests

```typescript
describe('isRuleActive()', () => {
  const now = Date.now();
  test('enabled, no expiresAt → true',           () => expect(isRuleActive(makeRule(), now)).toBe(true));
  test('disabled → false',                       () => expect(isRuleActive(makeRule({ enabled: false }), now)).toBe(false));
  test('expiresAt in future → true',             () => expect(isRuleActive(makeRule({ expiresAt: new Date(now + 100000).toISOString() }), now)).toBe(true));
  test('expiresAt in past → false',              () => expect(isRuleActive(makeRule({ expiresAt: new Date(now - 100000).toISOString() }), now)).toBe(false));
});
```

---

## Groups 8–10: `RuleEngine.evaluate()`, `reload()`, Singleton

```typescript
describe('RuleEngine.evaluate()', () => {
  // Use beforeEach: resetRuleEngine(), create new RuleEngine with in-memory ruleset
  // (pass a temp file path that doesn't exist, or mock fs — simplest: use
  //  a temp file created in beforeEach with fs.writeFileSync)

  test('no matching rules → action: null');
  test('single matching rule → correct action returned');
  test('lower priority number wins (priority 5 over priority 10)');
  test('stopOnMatch: true → only first match, stoppedEarly: true');
  test('stopOnMatch: false → both matches accumulated');
  test('scope filter: wrong upstream → not matched');
  test('scope filter: correct upstream → matched');
  test('cooldown: second call within cooldownMs → suppressedByCooldown: true');
  test('cooldown: call after cooldownMs → fires again');
  test('rulesetVersion in result matches active ruleset');
  test('evaluationTimeUs is a finite positive number');
  test('context field in result is verbatim copy of input');
});

describe('RuleEngine.reload()', () => {
  test('valid higher-version ruleset → accepted, returns true');
  test('invalid ruleset → rejected, old ruleset unchanged, returns false');
  test('stale version (lower) → rejected, returns false');
  test('stats().reloadCount increments on success');
});

describe('Singleton', () => {
  test('getRuleEngine() × 2 → same instance');
  test('resetRuleEngine() then getRuleEngine() → new instance');
  test('after resetRuleEngine(), stats start from zero');
});
```

---

## Hard Constraints

1. No `eval()` or `new Function()` anywhere in the implementation
2. No LLM calls in `evaluate()` — fully synchronous, pure, deterministic
3. File watcher debounce: 200ms — use `clearTimeout/setTimeout` pattern
4. Atomic write: `.tmp` + `fs.rename` — never write directly to the target file
5. Validate before apply — `reload()` always runs `validateRuleset()` first
6. `rulesetVersion` is monotonically increasing — reject equal or lower versions
7. Cooldown map key format: `${signalKey}::${ruleId}` (double colon)
8. `evaluate()` never throws — full try/catch, returns safe empty result on error
9. `evaluationTimeUs` uses `process.hrtime.bigint()` divided by `1000`
10. `_sortedRules` is cached — recomputed only on `reload()`, not on every call
11. Import paths: no `.js` extension (Jest/ts-jest CommonJS compatibility)
12. Export: `RuleEngine` class + `getRuleEngine()` + `resetRuleEngine()`

---

## Completion Command

```bash
npx jest src/intelligence/rules/__tests__/RuleEngine.test.ts --no-coverage
```

All tests must pass. Then commit:

```
feat(intelligence): Module 3 — Rule Engine

- JSON predicate rules (no eval), condition tree: leaf + and/or/not
- 6 action types: throttle, block, reroute, alert, log, cache_hint
- Priority-ordered chain, stopOnMatch per rule
- Per-rule cooldownMs (prevents alert storms)
- Per-rule expiresAt (ISO 8601 auto-expiry)
- Scope: per-upstream, per-path-prefix (AND semantics when both set)
- stressScore: 0.5*errorRate + 0.3*p95z + 0.2*rpsz
- Hot-reload via fs.watch + 200ms debounce, validate-before-apply
- Atomic write (.tmp + rename)
- REST: GET/POST /api/intelligence/rules[/:id]
- Express middleware on res.on('finish')
- 8 default production rules in default-rules.json
- >= 60/60 unit tests passing
```
