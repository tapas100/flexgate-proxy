# Module 3 — Rule Engine: Part 4 of 5 — RuleEngine, Loader, Middleware, Router, Default Rules

---

## `RuleEngine.ts`

### Constructor

```typescript
new RuleEngine(rulesFilePath: string, config?: Partial<RuleEngineConfig>)
```

Default config: `{ watchIntervalMs: 2000, emitEvents: true, logMatches: true }`

### Internal fields

```typescript
private _ruleset: Ruleset
private _sortedRules: Rule[]          // sorted by priority asc, filtered to enabled only
private _cooldowns: Map<string, number> // key: `${signalKey}::${ruleId}` → lastFiredMs
private _stats: mutable RuleEngineStats
private _watcher: fs.FSWatcher | null
```

### `evaluate(key, context)` — step by step

```
1.  startNs = process.hrtime.bigint()
2.  _stats.totalEvaluations++
3.  Parse key format "METHOD:path:upstream" — split on first and last ':'
4.  upstream = last segment, path = middle segment
5.  matchedRules = [], stoppedEarly = false, winningAction = null, nowMs = Date.now()

6.  for each rule in _sortedRules:
    a. if !isRuleActive(rule, nowMs) → skip
    b. if !matchesScope(rule, upstream, path) → skip
    c. if !evaluateCondition(rule.condition, context) → skip
    d. cooldownKey = `${key}::${rule.id}`
       lastFired = _cooldowns.get(cooldownKey) ?? 0
       suppressed = rule.cooldownMs > 0 AND nowMs - lastFired < rule.cooldownMs
    e. if !suppressed: _cooldowns.set(cooldownKey, nowMs), _stats.totalMatches++
    f. push MatchedRule { ruleId, ruleName, ruleVersion, action, suppressedByCooldown: suppressed }
    g. if winningAction is null AND !suppressed: winningAction = rule.action
    h. if !suppressed AND rule.action.stopOnMatch: stoppedEarly = true, break

7.  evaluationTimeUs = Number(process.hrtime.bigint() - startNs) / 1000
8.  return EvaluationResult { key, evaluatedAtMs: nowMs, matchedRules, action: winningAction,
                              stoppedEarly, rulesetVersion: _ruleset.rulesetVersion,
                              context, evaluationTimeUs }

9.  Wrap EVERYTHING in try/catch — on error: return safe empty result with action: null
```

### `reload(ruleset)` — step by step

```
1. errors = validateRuleset(ruleset)
2. if errors.length > 0 → log each error, return false
3. if ruleset.rulesetVersion <= _ruleset.rulesetVersion → log "stale ruleset", return false
4. _ruleset = ruleset
5. _sortedRules = ruleset.rules
     .filter(r => r.enabled)
     .sort((a, b) => a.priority - b.priority)
6. _stats.activeRuleCount = _sortedRules.length
7. _stats.reloadCount++
8. _stats.lastReloadAt = Date.now()
9. _stats.rulesetVersion = ruleset.rulesetVersion
10. emit 'reload' event (if emitEvents is true)
11. return true
```

### File watcher `_startWatcher()`

```
Use fs.watch(rulesFilePath)
Debounce: ignore events within 200ms of the previous one (use a setTimeout/clearTimeout)

On 'change' event (debounced):
  try:
    content = fs.readFileSync(rulesFilePath, 'utf-8')
    parsed = JSON.parse(content)
    this.reload(parsed)        ← validates before applying
  catch (e):
    log warning "Failed to reload rules: <message>"
    DO NOT crash, DO NOT clear the watcher

On 'error' event:
  log warning, do not crash

ENOENT (file not found):
  log warning "Rules file not found: <path>", do not crash
```

### `shutdown()`

```
_watcher?.close()
_watcher = null
```

### Singleton exports

```typescript
export function getRuleEngine(filePath?: string, config?: Partial<RuleEngineConfig>): RuleEngine
export function resetRuleEngine(): void   // TEST USE ONLY — resets singleton to null
```

---

## `loader.ts`

### `loadRulesetFromFile(filePath): Promise<{ ruleset: Ruleset | null, errors: ValidationError[] }>`

```
try:
  content = await fs.promises.readFile(filePath, 'utf-8')
  parsed = JSON.parse(content)   ← catch JSON errors
  errors = validateRuleset(parsed)
  if errors.length > 0: return { ruleset: null, errors }
  return { ruleset: parsed as Ruleset, errors: [] }
catch (e):
  return { ruleset: null, errors: [{ path: 'file', message: e.message }] }
```

### `loadRulesetFromFileSync(filePath): { ruleset: Ruleset | null, errors: ValidationError[] }`

Same pattern using `fs.readFileSync`.

### `saveRuleset(filePath, ruleset): Promise<void>`

```
errors = validateRuleset(ruleset)
if errors.length > 0: throw errors   ← throws ValidationError[]

tmpPath = filePath + '.tmp'
await fs.promises.writeFile(tmpPath, JSON.stringify(ruleset, null, 2), 'utf-8')
await fs.promises.rename(tmpPath, filePath)
```

---

## `middleware.ts`

```typescript
export function ruleEngineMiddleware(options?: { engine?: IRuleEngine }): RequestHandler {
  return (_req, res, next) => {
    res.on('finish', () => {
      try {
        const req = _req;
        const upstream = (req as any).upstream ?? 'unknown';
        const key = `${req.method}:${req.path}:${upstream}`;
        const engine = options?.engine ?? getRuleEngine();

        const snapshot = getSignalEngine().snapshot(key);
        if (!snapshot) return;

        const signal = getAnomalyEngine().analyze(key, snapshot.rps, []);
        const context = buildContext(snapshot, signal);
        const result = engine.evaluate(key, context);

        res.locals.ruleEvaluation = result;

        if (result.action?.type === 'alert') {
          eventBus.emit(EventType.SYSTEM_ALERT, { result });
        }
      } catch (e) {
        // never throw from middleware
      }
    });
    next();
  };
}
```

---

## `router.ts`

Mount under `/api/intelligence/rules`.

```
GET  /api/intelligence/rules
     Response: { ...ruleset, stats: RuleEngineStats }

GET  /api/intelligence/rules/stats
     Response: RuleEngineStats

GET  /api/intelligence/rules/:ruleId
     Response: Rule | 404 JSON

POST /api/intelligence/rules/evaluate
     Body: { key: string, context: RuleContext }
     Response: EvaluationResult
     Validation: if key or context missing → 400

POST /api/intelligence/rules/reload
     Force reload from disk
     Response: { success: true, rulesetVersion: number }
            or { success: false, errors: ValidationError[] }

POST /api/intelligence/rules/validate
     Body: any Ruleset object
     Response: { valid: true, errors: [] }
            or { valid: false, errors: ValidationError[] }
```

---

## `default-rules.json`

```json
{
  "schemaVersion": 1,
  "rulesetVersion": 1,
  "updatedAt": "2026-03-30T00:00:00Z",
  "description": "FlexGate default intelligence rules",
  "rules": [
    {
      "id": "block-catastrophic-errors",
      "version": 1, "enabled": true, "priority": 0,
      "name": "Block on total failure",
      "condition": {
        "type": "compound", "op": "and",
        "conditions": [
          { "type": "leaf", "field": "errorRate",     "op": "gte", "value": 0.95 },
          { "type": "leaf", "field": "requestCount",  "op": "gte", "value": 10 }
        ]
      },
      "action": { "type": "block", "params": { "statusCode": 503, "message": "Service temporarily unavailable" }, "stopOnMatch": true }
    },
    {
      "id": "throttle-high-rps",
      "version": 1, "enabled": true, "priority": 10,
      "name": "Throttle when RPS exceeds 1000",
      "condition": { "type": "leaf", "field": "rps", "op": "gt", "value": 1000 },
      "action": { "type": "throttle", "params": { "maxRps": 800, "statusCode": 429 }, "stopOnMatch": true }
    },
    {
      "id": "throttle-anomalous-rps",
      "version": 1, "enabled": true, "priority": 20,
      "name": "Throttle confirmed RPS spike",
      "condition": {
        "type": "compound", "op": "and",
        "conditions": [
          { "type": "leaf", "field": "isAnomaly",   "op": "eq", "value": 1 },
          { "type": "leaf", "field": "trendRising", "op": "eq", "value": 1 },
          { "type": "leaf", "field": "rps",         "op": "gt", "value": 500 }
        ]
      },
      "action": { "type": "throttle", "params": { "maxRps": 400, "retryAfterSecs": 5 }, "stopOnMatch": true }
    },
    {
      "id": "alert-high-p95-latency",
      "version": 1, "enabled": true, "priority": 30,
      "name": "Alert on p95 latency spike",
      "cooldownMs": 30000,
      "condition": {
        "type": "compound", "op": "and",
        "conditions": [
          { "type": "leaf", "field": "p95LatencyMs", "op": "gt",  "value": 2000 },
          { "type": "leaf", "field": "requestCount", "op": "gte", "value": 5 }
        ]
      },
      "action": { "type": "alert", "params": { "severity": "critical", "message": "p95 latency exceeded 2000ms" }, "stopOnMatch": true }
    },
    {
      "id": "alert-confirmed-anomaly",
      "version": 1, "enabled": true, "priority": 40,
      "name": "Alert on confirmed anomaly",
      "condition": {
        "type": "compound", "op": "and",
        "conditions": [
          { "type": "leaf", "field": "isAnomaly",         "op": "eq",  "value": 1 },
          { "type": "leaf", "field": "anomalyConfidence", "op": "gte", "value": 0.7 }
        ]
      },
      "action": { "type": "alert", "params": { "severity": "warning", "message": "Confirmed anomaly detected" }, "stopOnMatch": false }
    },
    {
      "id": "reroute-on-stress",
      "version": 1, "enabled": true, "priority": 50,
      "name": "Reroute on high stress score",
      "condition": { "type": "leaf", "field": "stressScore", "op": "gt", "value": 0.8 },
      "action": { "type": "reroute", "params": { "targetUpstream": "fallback-service" }, "stopOnMatch": true }
    },
    {
      "id": "cache-hint-repetitive",
      "version": 1, "enabled": true, "priority": 60,
      "name": "Suggest caching for repetitive requests",
      "condition": {
        "type": "compound", "op": "and",
        "conditions": [
          { "type": "leaf", "field": "isRepetitive",   "op": "eq",  "value": 1 },
          { "type": "leaf", "field": "dominanceRatio", "op": "gte", "value": 0.4 }
        ]
      },
      "action": { "type": "cache_hint", "params": { "ttlSeconds": 30 }, "stopOnMatch": false }
    },
    {
      "id": "log-elevated-client-errors",
      "version": 1, "enabled": true, "priority": 100,
      "name": "Log elevated 4xx rate",
      "condition": {
        "type": "compound", "op": "and",
        "conditions": [
          { "type": "leaf", "field": "clientErrorRate", "op": "gt",  "value": 0.3 },
          { "type": "leaf", "field": "requestCount",    "op": "gte", "value": 10 }
        ]
      },
      "action": { "type": "log", "params": { "level": "warn", "message": "Elevated client error rate detected" }, "stopOnMatch": true }
    }
  ]
}
```
