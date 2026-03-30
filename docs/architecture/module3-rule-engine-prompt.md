# Module 3 — Rule Engine: Complete Design & Implementation Prompt

## Context

You are building **Module 3: Rule Engine** of a production-grade **Runtime Intelligence Layer** for a Node.js/TypeScript/Express API Gateway called `flexgate-proxy`.

The two modules already built and committed are:

### Module 1 — Metrics & Signal Engine (`src/intelligence/signals/`)

- Sliding window (default 10s, 1-second buckets) per route+upstream key
- Outputs a `WindowSnapshot` with: `rps`, `requestCount`, `errorRate`, `clientErrorRate`, `meanLatencyMs`, `p50/p95/p99LatencyMs`, `maxLatencyMs`, `minLatencyMs`, `avgRequestBytes`, `avgResponseBytes`, `repetition` (fingerprint-based repetition detection)

### Module 2 — Math/Anomaly Engine (`src/intelligence/anomaly/`)

- Welford's online rolling baseline per metric
- Z-score anomaly detection (configurable threshold, default 2.5σ)
- Linear regression + R² for trend detection (`rising` / `falling` / `flat`)
- 3-component confidence scoring: sample volume + baseline stability + signal agreement
- Outputs an `AnomalySignal` with: `zScore`, `trend`, `confidence`, `isConfirmedAnomaly`

**Module 3 must consume both of these and produce actionable decisions.**

---

## Project Stack

- **Runtime**: Node.js ≥ 18, TypeScript (strict mode)
- **Framework**: Express.js
- **Test runner**: Jest with `ts-jest`
- **Module format**: CommonJS — no `.js` extensions in import paths
- **Directory**: `src/intelligence/rules/`
- **No external runtime dependencies** beyond what already exists in the project

---

## What Module 3 Must Do

Build a complete, production-ready Rule Engine with these capabilities:

1. **Threshold-based rules** — structured JSON predicates, not `eval()`. Examples:
   - `if rps > 1000 → throttle`
   - `if errorRate > 0.5 AND p95LatencyMs > 2000 → block`
   - `if isAnomaly = 1 AND trendRising = 1 → alert`
   - `if stressScore > 0.8 → reroute`

2. **Rule evaluation chain** — rules are prioritised (lower number = higher priority), evaluated in order, with configurable `stopOnMatch` per rule (default `true`)

3. **Rule versioning** — every rule has a `version` field; every `EvaluationResult` records the active `rulesetVersion` for a full audit trail

4. **Hot-reload without restart** — the engine watches a JSON file on disk using `fs.watch`. When the file changes, it validates the new ruleset before applying it. If validation fails, the old ruleset remains active. Reload is atomic.

5. **Scope filtering** — rules can be scoped to specific upstreams or path prefixes. A global rule (no scope) matches all traffic.

6. **Cooldown** — optional per-rule `cooldownMs` field prevents the same rule from firing more than once per interval for the same key (prevents alert storms)

7. **Rule expiry** — optional `expiresAt` ISO 8601 timestamp. Expired rules are treated as disabled without editing the file.

8. **Stress score** — a single derived numeric `stressScore` in [0, 1] that combines `errorRate`, `p95` latency z-score, and `rps` z-score. Allows simple single-field rules like `stressScore > 0.8`.

---

## File Structure to Create

```
src/intelligence/rules/
  types.ts                     — all type definitions (pure data, JSON-serialisable)
  math.ts                      — pure math functions (condition eval, context building)
  RuleEngine.ts                — stateful engine (file watch, reload, evaluate)
  loader.ts                    — file I/O + validation (reads/parses/validates JSON)
  middleware.ts                — Express middleware that runs evaluate() on every request
  router.ts                    — REST API endpoints
  index.ts                     — barrel export
  __tests__/
    RuleEngine.test.ts         — unit tests (≥ 60 tests)
  default-rules.json           — default ruleset with 8 realistic example rules
```

---

## Type Definitions (`types.ts`)

Define all types as `readonly` interfaces, fully JSON-serialisable.

### Condition Types

```typescript
type ComparisonOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'

interface LeafCondition {
  type: 'leaf'
  field: keyof RuleContext   // only fields that exist on RuleContext are valid
  op: ComparisonOperator
  value: number
}

interface CompoundCondition {
  type: 'compound'
  op: 'and' | 'or' | 'not'
  conditions: Condition[]
}

type Condition = LeafCondition | CompoundCondition
```

### Action Types

```typescript
type ActionType = 'throttle' | 'block' | 'reroute' | 'alert' | 'log' | 'cache_hint' | 'noop'

interface ThrottleParams { maxRps: number; burstSize?: number; statusCode?: number; retryAfterSecs?: number }
interface BlockParams    { statusCode?: number; message?: string }
interface RerouteParams  { targetUpstream: string; pathRewrite?: string }
interface AlertParams    { severity: 'info' | 'warning' | 'critical'; message: string; channel?: string }
interface LogParams      { level: 'debug' | 'info' | 'warn' | 'error'; message: string; fields?: Record<string, unknown> }
interface CacheHintParams { ttlSeconds: number }

interface RuleAction {
  type: ActionType
  params: ActionParams       // discriminated by type
  stopOnMatch: boolean       // default true
}
```

### Rule Definition

```typescript
interface Rule {
  id: string             // unique, stable across reloads
  version: number        // min 1, increment on each change
  enabled: boolean
  priority: number       // lower = higher priority, min 0
  name: string
  description?: string
  scope?: {
    upstreams?: string[]       // matches if upstream is in this list
    pathPrefixes?: string[]    // matches if path starts with any prefix
  }
  condition: Condition
  action: RuleAction
  cooldownMs?: number    // min 0, prevents re-fire within this interval per key
  expiresAt?: string     // ISO 8601, rule auto-disables after this time
  tags?: string[]
}
```

### Ruleset (file-level container)

```typescript
interface Ruleset {
  schemaVersion: number    // engine rejects unknown versions (current: 1)
  rulesetVersion: number   // monotonically increasing, for audit trail
  updatedAt: string        // ISO 8601
  description?: string
  rules: Rule[]
}
```

### RuleContext — flat numeric-only evaluation target

```typescript
interface RuleContext {
  // From Module 1 WindowSnapshot:
  rps: number
  requestCount: number
  errorRate: number           // [0, 1]
  clientErrorRate: number     // [0, 1]
  meanLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
  maxLatencyMs: number
  isRepetitive: number        // 0 or 1
  dominanceRatio: number      // [0, 1]
  avgRequestBytes: number
  avgResponseBytes: number

  // From Module 2 AnomalySignal:
  isAnomaly: number           // 0 or 1
  zScore: number
  trendRising: number         // 0 or 1
  trendFalling: number        // 0 or 1
  anomalyConfidence: number   // [0, 1]

  // Derived cross-signal:
  stressScore: number         // [0, 1] weighted combo
}
```

> **Important**: All fields in `RuleContext` are numeric. Booleans are represented as `0` or `1`. This allows all conditions to use the same `ComparisonOperator` type — no special boolean handling needed.

### EvaluationResult

```typescript
interface EvaluationResult {
  key: string
  evaluatedAtMs: number
  matchedRules: MatchedRule[]
  action: RuleAction | null          // from highest-priority matched rule
  stoppedEarly: boolean
  rulesetVersion: number             // for audit trail
  context: RuleContext               // copy of input context
  evaluationTimeUs: number           // microseconds via process.hrtime.bigint()
}

interface MatchedRule {
  ruleId: string
  ruleName: string
  ruleVersion: number
  action: RuleAction
  suppressedByCooldown: boolean      // true if cooldown prevented firing
}
```

### Engine Interface

```typescript
interface IRuleEngine {
  evaluate(key: string, context: RuleContext): EvaluationResult
  getRuleset(): Ruleset
  reload(ruleset: Ruleset): boolean  // returns false if invalid or stale
  stats(): RuleEngineStats
  shutdown(): void
}

interface RuleEngineStats {
  activeRuleCount: number
  totalEvaluations: number
  totalMatches: number
  reloadCount: number
  rulesetVersion: number
  lastReloadAt: number | null
}

interface ValidationError {
  path: string
  message: string
}
```

---

## Pure Math Functions (`math.ts`)

All functions must be **pure** — no side effects, no I/O, no state.

### `evaluateLeaf(condition: LeafCondition, context: RuleContext): boolean`

- Look up `context[condition.field]`
- If the value is not a finite number → return `false` (never throw)
- Apply operator:
  - `gt`  → `value > threshold`
  - `gte` → `value >= threshold`
  - `lt`  → `value < threshold`
  - `lte` → `value <= threshold`
  - `eq`  → `value === threshold`
  - `neq` → `value !== threshold`

### `evaluateCondition(condition: Condition, context: RuleContext): boolean`

Recursively evaluate the condition tree:

- `and`: all children must return true. Empty `and []` → true (vacuous truth)
- `or`: at least one child must return true. Empty `or []` → false
- `not`: exactly one child, result negated. `not` with 0 or >1 children → false

### `matchesScope(rule: Rule, upstream: string, path: string): boolean`

- No scope at all → always true
- `scope.upstreams` present and non-empty → upstream must be in the list
- `scope.pathPrefixes` present and non-empty → path must start with at least one prefix
- If **both** are specified → both must match (AND semantics)

### `isRuleActive(rule: Rule, nowMs: number): boolean`

- Returns `rule.enabled && !isExpired(rule, nowMs)`
- Parse `rule.expiresAt` with `Date.parse()` — returns true if parse fails (treat as no expiry)

### `buildStressScore(errorRate: number, p95ZScore: number, rpsZScore: number): number`

```
stressScore = 0.5 * clamp(errorRate, 0, 1)
            + 0.3 * clamp(p95ZScore / 3, 0, 1)
            + 0.2 * clamp(rpsZScore / 3, 0, 1)
```

- Result is always in [0, 1]
- NaN or Infinity inputs → treat that component as 0 (do not corrupt the total)
- Dividing z-scores by 3 normalises: a 3σ anomaly contributes full weight

### `buildContext(snapshot: WindowSnapshot, signal: AnomalySignal | null): RuleContext`

- Map every field from `WindowSnapshot` to `RuleContext`
- Map every field from `AnomalySignal` (use 0 defaults for all anomaly fields if `signal` is null)
- Compute `stressScore` using `buildStressScore(errorRate, signal?.zScore.zScore ?? 0, 0)`
- Always return a fully populated `RuleContext` — no missing or undefined keys

### `validateRuleset(ruleset: unknown): ValidationError[]`

Returns `[]` if valid. Returns structured errors if invalid.

Must check:

| Check | Error path example |
|---|---|
| `schemaVersion` exists and equals `1` | `"schemaVersion"` |
| `rulesetVersion` is a positive integer | `"rulesetVersion"` |
| `rules` is an array | `"rules"` |
| Each rule has non-empty string `id` | `"rules[0].id"` |
| Rule IDs are unique within the ruleset | `"rules[2].id"` |
| Each rule has `version >= 1` | `"rules[0].version"` |
| Each rule has boolean `enabled` | `"rules[0].enabled"` |
| Each rule has `priority >= 0` | `"rules[0].priority"` |
| Each rule has non-empty string `name` | `"rules[0].name"` |
| Each rule `action.type` is a known `ActionType` | `"rules[0].action.type"` |
| Each condition `field` is a key of `RuleContext` | `"rules[0].condition.field"` |
| Each condition `op` is a known `ComparisonOperator` | `"rules[0].condition.op"` |
| Compound `not` has exactly 1 child | `"rules[0].condition.conditions"` |
| `cooldownMs` if present is `>= 0` | `"rules[0].cooldownMs"` |
| `expiresAt` if present parses as ISO 8601 | `"rules[0].expiresAt"` |

---

## RuleEngine Class (`RuleEngine.ts`)

### Constructor

```typescript
new RuleEngine(rulesFilePath: string, config?: Partial<RuleEngineConfig>)
```

```typescript
interface RuleEngineConfig {
  watchIntervalMs: number   // file change poll interval, default 2000
  emitEvents: boolean       // emit EventEmitter events on match/reload, default true
  logMatches: boolean       // write structured log on each rule match, default true
}
```

### Internal State

```typescript
private _ruleset: Ruleset                              // currently active ruleset
private _sortedRules: Rule[]                           // sorted by priority, filtered to active, cached
private _cooldowns: Map<string, number>                // key: `${signalKey}::${ruleId}` → lastFiredMs
private _stats: mutable RuleEngineStats
private _watcher: fs.FSWatcher | null
```

### `evaluate(key, context)` — Algorithm

```
1. startNs = process.hrtime.bigint()
2. _stats.totalEvaluations++
3. Parse upstream and path from key (format: "METHOD:path:upstream")
4. matchedRules = []
5. stoppedEarly = false
6. winningAction = null

7. For each rule in _sortedRules (already sorted by priority asc):
   a. if !isRuleActive(rule, Date.now()) → skip
   b. if !matchesScope(rule, upstream, path) → skip
   c. matched = evaluateCondition(rule.condition, context)
   d. if !matched → skip
   e. cooldownKey = `${key}::${rule.id}`
      if rule.cooldownMs > 0 AND lastFiredMs + cooldownMs > now:
        push MatchedRule with suppressedByCooldown = true
        continue  ← do NOT stop on cooldown
      else:
        update _cooldowns.set(cooldownKey, now)
        push MatchedRule with suppressedByCooldown = false
        _stats.totalMatches++
        if winningAction is null: winningAction = rule.action
        if rule.action.stopOnMatch:
          stoppedEarly = true
          break

8. evaluationTimeUs = Number(process.hrtime.bigint() - startNs) / 1000
9. return EvaluationResult
```

### `reload(ruleset)` — Algorithm

```
1. errors = validateRuleset(ruleset)
2. if errors.length > 0 → log warnings, return false
3. if ruleset.rulesetVersion <= _ruleset.rulesetVersion → log "stale ruleset", return false
4. _ruleset = ruleset
5. _sortedRules = ruleset.rules
     .filter(r => r.enabled)
     .sort((a, b) => a.priority - b.priority)
6. _stats.reloadCount++
7. _stats.lastReloadAt = Date.now()
8. _stats.rulesetVersion = ruleset.rulesetVersion
9. emit 'reload' event
10. return true
```

### File Watching — `_startWatcher()`

```
- Use fs.watch(rulesFilePath)
- Debounce: ignore change events within 200ms of the previous one
- On change:
    content = fs.readFileSync(rulesFilePath, 'utf-8')   (sync is fine in watch callback)
    parsed = JSON.parse(content)                         (catch parse errors)
    this.reload(parsed)                                  (validates before applying)
- On error: log warning, do NOT crash, do NOT clear _watcher
- ENOENT: log warning "rules file not found", do not crash
```

### Singleton

```typescript
export function getRuleEngine(filePath?: string, config?: Partial<RuleEngineConfig>): RuleEngine
export function resetRuleEngine(): void   // test use only
```

---

## File Loader (`loader.ts`)

### `loadRulesetFromFile(filePath: string): Promise<{ ruleset: Ruleset | null, errors: ValidationError[] }>`

- Read with `fs.promises.readFile(filePath, 'utf-8')`
- `JSON.parse` in try/catch → return parse error as `ValidationError` if it throws
- Run `validateRuleset(parsed)`
- Return `{ ruleset: parsed, errors: [] }` on success
- Return `{ ruleset: null, errors }` on any failure
- Never throws

### `loadRulesetFromFileSync(filePath: string): { ruleset: Ruleset | null, errors: ValidationError[] }`

- Synchronous version for startup
- Uses `fs.readFileSync`
- Same error handling pattern

### `saveRuleset(filePath: string, ruleset: Ruleset): Promise<void>`

- Validate before writing — throw `ValidationError[]` if invalid
- Atomic write pattern:
  ```
  tmpPath = `${filePath}.tmp`
  await fs.promises.writeFile(tmpPath, JSON.stringify(ruleset, null, 2), 'utf-8')
  await fs.promises.rename(tmpPath, filePath)
  ```

---

## Express Middleware (`middleware.ts`)

```typescript
function ruleEngineMiddleware(options?: { engine?: IRuleEngine }): RequestHandler
```

- All work done inside `res.on('finish')` — **zero impact on request latency**
- Build signal key: `${req.method}:${req.path}:${req.upstream ?? 'unknown'}`
- Get `WindowSnapshot` from `getSignalEngine().snapshot(key)`
- Get `AnomalySignal` from `getAnomalyEngine().analyze(key, snapshot.rps, [])`
- Build `RuleContext` using `buildContext(snapshot, signal)`
- Call `engine.evaluate(key, context)`
- Store result in `res.locals.ruleEvaluation`
- If matched action type is `'alert'` → emit to `eventBus`
- Wrap everything in try/catch — never throws, only logs errors

---

## REST API (`router.ts`)

Mount all routes under `/api/intelligence/rules`:

### `GET /api/intelligence/rules`
Response:
```json
{
  "schemaVersion": 1,
  "rulesetVersion": 4,
  "updatedAt": "2026-03-30T12:00:00Z",
  "description": "...",
  "rules": [...],
  "stats": { "activeRuleCount": 8, "totalEvaluations": 14392, ... }
}
```

### `GET /api/intelligence/rules/stats`
Response: `RuleEngineStats`

### `POST /api/intelligence/rules/evaluate`
Request body:
```json
{ "key": "GET:/api/payments:payments-service", "context": { ...RuleContext } }
```
Response: `EvaluationResult`
Use case: manual testing and debugging from admin UI.

### `GET /api/intelligence/rules/:ruleId`
Response: `Rule` or `404`

### `POST /api/intelligence/rules/reload`
Force reload from disk (admin use). Response:
```json
{ "success": true, "rulesetVersion": 5 }
// or on failure:
{ "success": false, "errors": [{ "path": "...", "message": "..." }] }
```

### `POST /api/intelligence/rules/validate`
Request body: any `Ruleset` object (for pre-flight validation from admin UI).
Response:
```json
{ "valid": true, "errors": [] }
// or:
{ "valid": false, "errors": [{ "path": "...", "message": "..." }] }
```

---

## Default Rules File (`default-rules.json`)

Create a complete valid `Ruleset` with `schemaVersion: 1`, `rulesetVersion: 1`, containing exactly these 8 rules:

| Priority | ID | Name | Condition | Action |
|---|---|---|---|---|
| 0 | `block-catastrophic-errors` | Block on total failure | `errorRate >= 0.95 AND requestCount >= 10` | `block` (503, "Service temporarily unavailable") |
| 10 | `throttle-high-rps` | Throttle when RPS exceeds 1000 | `rps > 1000` | `throttle` (maxRps: 800, statusCode: 429) |
| 20 | `throttle-anomalous-rps` | Throttle confirmed RPS spike | `isAnomaly = 1 AND trendRising = 1 AND rps > 500` | `throttle` (maxRps: 400, retryAfterSecs: 5) |
| 30 | `alert-high-p95-latency` | Alert on p95 latency spike | `p95LatencyMs > 2000 AND requestCount >= 5` | `alert` (critical, cooldownMs: 30000) |
| 40 | `alert-confirmed-anomaly` | Alert on confirmed anomaly | `isAnomaly = 1 AND anomalyConfidence >= 0.7` | `alert` (warning), `stopOnMatch: false` |
| 50 | `reroute-on-stress` | Reroute on high stress score | `stressScore > 0.8` | `reroute` (targetUpstream: "fallback-service") |
| 60 | `cache-hint-repetitive` | Suggest caching for repetitive requests | `isRepetitive = 1 AND dominanceRatio >= 0.4` | `cache_hint` (ttlSeconds: 30), `stopOnMatch: false` |
| 100 | `log-elevated-client-errors` | Log elevated 4xx rate | `clientErrorRate > 0.3 AND requestCount >= 10` | `log` (warn) |

All rules: `enabled: true`. All actions default `stopOnMatch: true` unless otherwise noted.

---

## Unit Tests (`__tests__/RuleEngine.test.ts`)

Write **≥ 60 tests** in these groups. Each group uses `describe()`. Do not skip any test.

### Group 1: `validateRuleset()` — 12 tests

1. Valid minimal ruleset (1 rule) passes with `[]`
2. Missing `schemaVersion` → error at `"schemaVersion"`
3. `schemaVersion: 2` (unknown version) → error
4. Non-array `rules` field → error at `"rules"`
5. Rule with missing `id` → error at `"rules[0].id"`
6. Two rules with same `id` → error at `"rules[1].id"`
7. Rule with unknown `action.type` → error at `"rules[0].action.type"`
8. LeafCondition with unknown `field` → error at `"rules[0].condition.field"`
9. LeafCondition with unknown `op` → error
10. Compound `not` with 2 children → error at `"rules[0].condition.conditions"`
11. Compound `and []` (empty children) → valid (vacuous truth)
12. `expiresAt` with non-ISO string (e.g. `"not-a-date"`) → error

### Group 2: `evaluateLeaf()` — 8 tests

1. `gt`: `rps: 1001` vs threshold `1000` → `true`
2. `gt`: `rps: 1000` vs threshold `1000` → `false` (strictly greater)
3. `gte`: `rps: 1000` vs threshold `1000` → `true`
4. `lt`: `errorRate: 0.1` vs `0.5` → `true`
5. `lte`: `errorRate: 0.5` vs `0.5` → `true`
6. `eq`: `isRepetitive: 1` vs `1` → `true`
7. `neq`: `isRepetitive: 0` vs `1` → `true`
8. Unknown field `"nonExistentField"` (cast) → `false` (no throw)

### Group 3: `evaluateCondition()` — 10 tests

1. Leaf: condition matches → `true`
2. Leaf: condition does not match → `false`
3. `and` — both children true → `true`
4. `and` — one child false → `false`
5. `or` — one child true → `true`
6. `or` — both children false → `false`
7. `not` — false child → `true`
8. `not` — true child → `false`
9. `and []` (empty) → `true`
10. Nested: `(rps > 100 AND errorRate > 0.5) OR (isAnomaly = 1)` — verify both branches

### Group 4: `matchesScope()` — 6 tests

1. No scope → always matches any upstream/path
2. `scope.upstreams: ["payments"]` — matching upstream → `true`
3. `scope.upstreams: ["payments"]` — different upstream → `false`
4. `scope.pathPrefixes: ["/api/pay"]` — path `/api/payments/charge` → `true`
5. `scope.pathPrefixes: ["/api/pay"]` — path `/api/users` → `false`
6. Both `upstreams` AND `pathPrefixes` set — upstream matches but path does not → `false` (AND semantics)

### Group 5: `buildStressScore()` — 6 tests

1. All zeros → `0`
2. `errorRate: 1.0` only → `0.5`
3. `p95ZScore: 3` only → `0.3`
4. `rpsZScore: 3` only → `0.2`
5. All maxed (`errorRate:1, p95ZScore:3, rpsZScore:3`) → `1.0`
6. `NaN` input for one component → that component contributes 0, others unaffected

### Group 6: `buildContext()` — 4 tests

1. Module 1 fields are mapped correctly from `WindowSnapshot`
2. Module 2 fields are mapped correctly from a non-null `AnomalySignal`
3. `null` `AnomalySignal` → all anomaly fields default to `0`
4. `stressScore` is non-zero when `errorRate > 0`

### Group 7: `isRuleActive()` — 4 tests

1. `enabled: true`, no `expiresAt` → `true`
2. `enabled: false` → `false`
3. `expiresAt` in the future → `true`
4. `expiresAt` in the past → `false`

### Group 8: `RuleEngine.evaluate()` — 12 tests

1. No rules in engine → `action: null`, `matchedRules: []`
2. Single matching rule → correct `action` returned in result
3. Lower priority number wins over higher priority number (priority 5 beats priority 10)
4. `stopOnMatch: true` — only first match in result, `stoppedEarly: true`
5. `stopOnMatch: false` — both rules accumulate in `matchedRules`
6. Scope filter: rule scoped to `"other-service"` does not match key with `"payments-service"`
7. Scope filter: rule scoped to `"payments-service"` matches correctly
8. Cooldown: first call fires; second call within `cooldownMs` → `suppressedByCooldown: true`
9. Cooldown: call after `cooldownMs` expires → fires again (use `Date.now()` manipulation or dependency injection)
10. `rulesetVersion` in result matches the active ruleset's version
11. `evaluationTimeUs` is a finite positive number
12. `context` field in result is a verbatim copy of the input context

### Group 9: `RuleEngine.reload()` — 4 tests

1. Valid ruleset with higher version → accepted, `reload()` returns `true`
2. Invalid ruleset (validation errors) → rejected, old ruleset still active, returns `false`
3. Stale ruleset (version ≤ current) → rejected, returns `false`
4. `stats().reloadCount` increments by 1 on each successful reload

### Group 10: Singleton — 3 tests

1. `getRuleEngine()` called twice → same instance returned
2. `resetRuleEngine()` then `getRuleEngine()` → new instance returned
3. Test isolation: after `resetRuleEngine()`, stats start from zero

---

## Key Implementation Constraints

1. **No `eval()`, `new Function()`, or dynamic code execution** — conditions are data evaluated by `evaluateCondition()`
2. **No LLM in the hot path** — all evaluation is pure, deterministic, synchronous
3. **File watcher debounce** — debounce file change events by 200ms to handle editors that write in multiple flushes (save-then-format tools)
4. **Atomic file write** — use `.tmp` + `fs.rename` pattern in `saveRuleset` to prevent partial reads
5. **Validation before apply** — never apply a ruleset that fails validation, even partially
6. **`rulesetVersion` must be monotonically increasing** — reject reloads with equal or lower version than the currently active one
7. **Cooldown map key format**: `${signalKey}::${ruleId}` — two colons to avoid collision with keys that contain single colons
8. **No throws from `evaluate()`** — catch all errors internally, return a safe empty result with `action: null`
9. **`evaluationTimeUs`** — use `process.hrtime.bigint()` for nanosecond precision, divide by `1000n` for microseconds
10. **Sorted rules cache** — recompute `_sortedRules` only on `reload()`, not on every `evaluate()` call. This makes evaluation O(n) with no allocation overhead.
11. **All `import` paths use bare module names** (no `.js` extension) for Jest/ts-jest compatibility
12. **Export** `RuleEngine` class, `getRuleEngine()` singleton, `resetRuleEngine()` for test isolation

---

## Barrel Export (`index.ts`)

Export everything needed for external consumption:

```typescript
// Types
export type { Rule, Ruleset, RuleContext, RuleAction, ActionType, Condition,
              LeafCondition, CompoundCondition, EvaluationResult, MatchedRule,
              RuleEngineStats, IRuleEngine, ValidationError,
              ThrottleParams, BlockParams, RerouteParams, AlertParams,
              LogParams, CacheHintParams } from './types'

// Math (pure functions — useful for testing/external use)
export { evaluateLeaf, evaluateCondition, matchesScope, isRuleActive,
         buildStressScore, buildContext, validateRuleset } from './math'

// Engine
export { RuleEngine, getRuleEngine, resetRuleEngine } from './RuleEngine'

// Loader
export { loadRulesetFromFile, loadRulesetFromFileSync, saveRuleset } from './loader'

// Express
export { ruleEngineMiddleware } from './middleware'
export { default as ruleRouter } from './router'
```

---

## Completion Criteria

- All 8 files created
- `npx jest src/intelligence/rules/__tests__/RuleEngine.test.ts --no-coverage` passes with **≥ 60/60 tests**
- No tests are skipped, stubbed, or marked `.todo`
- TypeScript compiles with no errors (`npx tsc --noEmit`)
- Commit message format:

```
feat(intelligence): Module 3 — Rule Engine

- Threshold-based JSON predicate rules (no eval, no code in rules)
- Condition tree: leaf comparisons + compound and/or/not
- 6 action types: throttle, block, reroute, alert, log, cache_hint
- Priority-ordered evaluation chain with stopOnMatch
- Per-rule cooldownMs (prevents alert storms)
- Per-rule expiresAt (ISO 8601 auto-expiry)
- Scope filtering: per-upstream, per-path-prefix
- stressScore: derived single-field composite signal
- Hot-reload from JSON file via fs.watch + 200ms debounce
- Atomic file write (.tmp + rename)
- Validation-before-apply: invalid files never go live
- REST API: GET/POST /api/intelligence/rules[/:id]
- Express middleware: evaluate on every request (res.on finish)
- 8 default production-ready rules in default-rules.json
- ≥60/60 unit tests passing
```
