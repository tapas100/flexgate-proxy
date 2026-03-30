# Module 3 — Rule Engine: Part 1 of 5 — Overview & Stack

## What You Are Building

Module 3: Rule Engine for a Node.js/TypeScript/Express API Gateway called `flexgate-proxy`.

This module sits on top of two already-built modules:

**Module 1** (`src/intelligence/signals/`) outputs a `WindowSnapshot`:
- `rps`, `requestCount`, `errorRate`, `clientErrorRate`
- `meanLatencyMs`, `p50LatencyMs`, `p95LatencyMs`, `p99LatencyMs`, `maxLatencyMs`
- `avgRequestBytes`, `avgResponseBytes`
- `repetition.isRepetitive` (bool), `repetition.dominanceRatio` (0–1)

**Module 2** (`src/intelligence/anomaly/`) outputs an `AnomalySignal`:
- `zScore.zScore` (number), `zScore.isAnomaly` (bool), `zScore.direction`
- `trend.direction` (`rising` | `falling` | `flat`)
- `confidence.confidence` (0–1)
- `isConfirmedAnomaly` (bool)

**Module 3 consumes both and produces actionable decisions.**

---

## Project Stack

- Node.js >= 18, TypeScript strict mode
- Express.js
- Jest + ts-jest (test runner)
- CommonJS — NO `.js` extensions in import paths
- Directory: `src/intelligence/rules/`
- No new npm dependencies

---

## Files to Create

```
src/intelligence/rules/
  types.ts
  math.ts
  RuleEngine.ts
  loader.ts
  middleware.ts
  router.ts
  index.ts
  default-rules.json
  __tests__/
    RuleEngine.test.ts
```

---

## 8 Capabilities Required

1. **Threshold rules** — JSON predicates only, never `eval()`.
   Examples: `rps > 1000 → throttle`, `errorRate > 0.5 AND p95LatencyMs > 2000 → block`

2. **Priority chain** — lower priority number = evaluated first. `stopOnMatch` per rule (default true).

3. **Rule versioning** — every rule has a `version` field. Every result records `rulesetVersion`.

4. **Hot-reload** — `fs.watch` on the JSON file, 200ms debounce, validate before apply, atomic.

5. **Scope filtering** — per-upstream and/or per-path-prefix. No scope = global.

6. **Cooldown** — `cooldownMs` per rule prevents re-fire for the same key within the interval.

7. **Auto-expiry** — `expiresAt` ISO 8601. Expired rules treated as disabled.

8. **Stress score** — single derived field:
   `stressScore = 0.5*errorRate + 0.3*clamp(p95ZScore/3,0,1) + 0.2*clamp(rpsZScore/3,0,1)`
