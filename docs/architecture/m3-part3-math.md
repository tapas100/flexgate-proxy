# Module 3 — Rule Engine: Part 3 of 5 — Math & Validation

All functions in `src/intelligence/rules/math.ts` are pure — no side effects, no I/O, no state.

---

## `evaluateLeaf(condition, context): boolean`

```
1. value = context[condition.field]
2. if value is not a finite number → return false (never throw)
3. switch condition.op:
   gt  → value > condition.value
   gte → value >= condition.value
   lt  → value < condition.value
   lte → value <= condition.value
   eq  → value === condition.value
   neq → value !== condition.value
```

---

## `evaluateCondition(condition, context): boolean`

```
if condition.type === 'leaf':
  return evaluateLeaf(condition, context)

if condition.type === 'compound':
  switch condition.op:
    'and' → condition.conditions.every(c => evaluateCondition(c, context))
             empty array → true  (vacuous truth)
    'or'  → condition.conditions.some(c => evaluateCondition(c, context))
             empty array → false
    'not' → condition.conditions.length !== 1 → return false
             return !evaluateCondition(condition.conditions[0], context)
```

---

## `matchesScope(rule, upstream, path): boolean`

```
if no rule.scope → return true

upstreamMatch = true
if scope.upstreams exists and length > 0:
  upstreamMatch = scope.upstreams.includes(upstream)

pathMatch = true
if scope.pathPrefixes exists and length > 0:
  pathMatch = scope.pathPrefixes.some(prefix => path.startsWith(prefix))

return upstreamMatch && pathMatch   ← AND semantics when both are set
```

---

## `isRuleActive(rule, nowMs): boolean`

```
if !rule.enabled → return false
if rule.expiresAt is undefined → return true
expiry = Date.parse(rule.expiresAt)
if isNaN(expiry) → return true   (treat unparseable as no expiry)
return nowMs < expiry
```

---

## `buildStressScore(errorRate, p95ZScore, rpsZScore): number`

```
clamp = (v, min, max) => isFinite(v) ? Math.max(min, Math.min(max, v)) : 0

return 0.5 * clamp(errorRate, 0, 1)
     + 0.3 * clamp(p95ZScore / 3, 0, 1)
     + 0.2 * clamp(rpsZScore / 3, 0, 1)
```

NaN or Infinity in any input → that component contributes 0, others are unaffected.
Result is always in [0, 1].

---

## `buildContext(snapshot, signal): RuleContext`

Map fields from `WindowSnapshot` (Module 1) and `AnomalySignal | null` (Module 2).

```
signal defaults (used when signal is null):
  isAnomaly = 0, zScore = 0, trendRising = 0, trendFalling = 0, anomalyConfidence = 0

stressScore = buildStressScore(
  snapshot.errorRate,
  signal?.zScore.zScore ?? 0,
  0          ← rps z-score: pass 0 if not separately tracked
)

return {
  rps:               snapshot.rps,
  requestCount:      snapshot.requestCount,
  errorRate:         snapshot.errorRate,
  clientErrorRate:   snapshot.clientErrorRate,
  meanLatencyMs:     snapshot.meanLatencyMs,
  p50LatencyMs:      snapshot.p50LatencyMs,
  p95LatencyMs:      snapshot.p95LatencyMs,
  p99LatencyMs:      snapshot.p99LatencyMs,
  maxLatencyMs:      snapshot.maxLatencyMs,
  isRepetitive:      snapshot.repetition.isRepetitive ? 1 : 0,
  dominanceRatio:    snapshot.repetition.dominanceRatio,
  avgRequestBytes:   snapshot.avgRequestBytes,
  avgResponseBytes:  snapshot.avgResponseBytes,
  isAnomaly:         signal?.isConfirmedAnomaly ? 1 : 0,
  zScore:            signal?.zScore.zScore ?? 0,
  trendRising:       signal?.trend.direction === 'rising' ? 1 : 0,
  trendFalling:      signal?.trend.direction === 'falling' ? 1 : 0,
  anomalyConfidence: signal?.confidence.confidence ?? 0,
  stressScore,
}
```

---

## `validateRuleset(ruleset: unknown): ValidationError[]`

Returns `[]` if valid. Returns array of `{ path, message }` objects if invalid.

### Checks (in order):

```
1. schemaVersion exists → error at "schemaVersion" if missing
2. schemaVersion === 1  → error at "schemaVersion" if not 1
3. rulesetVersion is positive integer → error at "rulesetVersion"
4. rules is an array → error at "rules"

For each rule at index i:
5.  rules[i].id is non-empty string → error at "rules[i].id"
6.  rules[i].version >= 1 → error at "rules[i].version"
7.  rules[i].enabled is boolean → error at "rules[i].enabled"
8.  rules[i].priority >= 0 → error at "rules[i].priority"
9.  rules[i].name is non-empty string → error at "rules[i].name"
10. rules[i].action.type is a known ActionType → error at "rules[i].action.type"
11. rules[i].action.stopOnMatch is boolean → error at "rules[i].action.stopOnMatch"
12. validateCondition(rules[i].condition, "rules[i].condition") recursively:
      - leaf: field must be keyof RuleContext, op must be ComparisonOperator, value must be number
      - compound: op must be 'and'|'or'|'not'
      - compound 'not': must have exactly 1 child
      - each child recursively validated
13. If rules[i].cooldownMs is set: must be >= 0
14. If rules[i].expiresAt is set: must parse with Date.parse() (not NaN)

After all rules:
15. Rule IDs must be unique → error at "rules[j].id" for the duplicate
```

Known `ActionType` values: `throttle`, `block`, `reroute`, `alert`, `log`, `cache_hint`, `noop`

Known `ComparisonOperator` values: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`

Known `RuleContext` fields (all of them — validate against this list):
`rps`, `requestCount`, `errorRate`, `clientErrorRate`, `meanLatencyMs`,
`p50LatencyMs`, `p95LatencyMs`, `p99LatencyMs`, `maxLatencyMs`,
`isRepetitive`, `dominanceRatio`, `avgRequestBytes`, `avgResponseBytes`,
`isAnomaly`, `zScore`, `trendRising`, `trendFalling`, `anomalyConfidence`, `stressScore`
