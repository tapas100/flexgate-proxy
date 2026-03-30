# Module 3 — Rule Engine: Part 2 of 5 — All Types

Paste this entire block into `src/intelligence/rules/types.ts`.

```typescript
// ── Operators ─────────────────────────────────────────────────────────────────

export type ComparisonOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
export type LogicalOperator = 'and' | 'or' | 'not';
export type ActionType = 'throttle' | 'block' | 'reroute' | 'alert' | 'log' | 'cache_hint' | 'noop';
export type TrendDirection = 'rising' | 'falling' | 'flat';

// ── Conditions ────────────────────────────────────────────────────────────────

export interface LeafCondition {
  readonly type: 'leaf';
  readonly field: keyof RuleContext;
  readonly op: ComparisonOperator;
  readonly value: number;
}

export interface CompoundCondition {
  readonly type: 'compound';
  readonly op: LogicalOperator;
  readonly conditions: Condition[];
}

export type Condition = LeafCondition | CompoundCondition;

// ── Action Params ─────────────────────────────────────────────────────────────

export interface ThrottleParams {
  readonly maxRps: number;
  readonly burstSize?: number;
  readonly statusCode?: number;
  readonly retryAfterSecs?: number;
}
export interface BlockParams {
  readonly statusCode?: number;
  readonly message?: string;
}
export interface RerouteParams {
  readonly targetUpstream: string;
  readonly pathRewrite?: string;
}
export interface AlertParams {
  readonly severity: 'info' | 'warning' | 'critical';
  readonly message: string;
  readonly channel?: string;
}
export interface LogParams {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly fields?: Record<string, unknown>;
}
export interface CacheHintParams {
  readonly ttlSeconds: number;
}

export type ActionParams =
  | ThrottleParams
  | BlockParams
  | RerouteParams
  | AlertParams
  | LogParams
  | CacheHintParams
  | Record<string, never>;

// ── RuleAction ────────────────────────────────────────────────────────────────

export interface RuleAction {
  readonly type: ActionType;
  readonly params: ActionParams;
  readonly stopOnMatch: boolean;
}

// ── Rule Scope ────────────────────────────────────────────────────────────────

export interface RuleScope {
  readonly upstreams?: string[];
  readonly pathPrefixes?: string[];
}

// ── Rule ──────────────────────────────────────────────────────────────────────

export interface Rule {
  readonly id: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly priority: number;
  readonly name: string;
  readonly description?: string;
  readonly scope?: RuleScope;
  readonly condition: Condition;
  readonly action: RuleAction;
  readonly cooldownMs?: number;
  readonly expiresAt?: string;
  readonly tags?: string[];
}

// ── Ruleset ───────────────────────────────────────────────────────────────────

export interface Ruleset {
  readonly schemaVersion: number;
  readonly rulesetVersion: number;
  readonly updatedAt: string;
  readonly description?: string;
  readonly rules: Rule[];
}

// ── RuleContext (flat numeric — ALL fields must be number) ────────────────────

export interface RuleContext {
  // From Module 1 WindowSnapshot
  readonly rps: number;
  readonly requestCount: number;
  readonly errorRate: number;
  readonly clientErrorRate: number;
  readonly meanLatencyMs: number;
  readonly p50LatencyMs: number;
  readonly p95LatencyMs: number;
  readonly p99LatencyMs: number;
  readonly maxLatencyMs: number;
  readonly isRepetitive: number;       // 0 or 1
  readonly dominanceRatio: number;
  readonly avgRequestBytes: number;
  readonly avgResponseBytes: number;
  // From Module 2 AnomalySignal
  readonly isAnomaly: number;          // 0 or 1
  readonly zScore: number;
  readonly trendRising: number;        // 0 or 1
  readonly trendFalling: number;       // 0 or 1
  readonly anomalyConfidence: number;
  // Derived
  readonly stressScore: number;        // [0, 1]
}

// ── Results ───────────────────────────────────────────────────────────────────

export interface MatchedRule {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly ruleVersion: number;
  readonly action: RuleAction;
  readonly suppressedByCooldown: boolean;
}

export interface EvaluationResult {
  readonly key: string;
  readonly evaluatedAtMs: number;
  readonly matchedRules: MatchedRule[];
  readonly action: RuleAction | null;
  readonly stoppedEarly: boolean;
  readonly rulesetVersion: number;
  readonly context: RuleContext;
  readonly evaluationTimeUs: number;
}

// ── Stats & Validation ────────────────────────────────────────────────────────

export interface RuleEngineStats {
  readonly activeRuleCount: number;
  readonly totalEvaluations: number;
  readonly totalMatches: number;
  readonly reloadCount: number;
  readonly rulesetVersion: number;
  readonly lastReloadAt: number | null;
}

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}

// ── Engine Interface ──────────────────────────────────────────────────────────

export interface IRuleEngine {
  evaluate(key: string, context: RuleContext): EvaluationResult;
  getRuleset(): Ruleset;
  reload(ruleset: Ruleset): boolean;
  stats(): RuleEngineStats;
  shutdown(): void;
}

// ── Engine Config ─────────────────────────────────────────────────────────────

export interface RuleEngineConfig {
  readonly watchIntervalMs: number;
  readonly emitEvents: boolean;
  readonly logMatches: boolean;
}
```
