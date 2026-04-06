// Copyright (c) 2026 Tapas Adhikary. All rights reserved.
// This file is part of the FlexGate Runtime Intelligence Layer.
// Licensed under the Business Source License 1.1 (BUSL-1.1).
// See LICENSE in the project root for full terms.
// Commercial use requires a separate license. Change Date: 2030-04-06.

/**
 * Module 3: Rule Engine — Type Definitions
 *
 * All types are pure data structures. No business logic here.
 *
 * Design decisions:
 * - Conditions are composable: threshold leaves + AND/OR composites
 * - Actions are discriminated unions — exhaustive switch enforced by TS
 * - Each Rule carries its own version (independent of the RuleSet version)
 * - RuleSet carries a monotonically-increasing integer version, bumped
 *   on every mutation, so hot-reload can detect stale state
 * - EvaluationResult captures the full trace (which rules fired) for
 *   observability without side-effects
 */

// ── Metric Keys ───────────────────────────────────────────────────────────────

/**
 * Names of metrics that can be referenced in rule conditions.
 * These correspond to fields on WindowSnapshot from Module 1.
 */
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
  | 'avgResponseBytes'
  /** Derived stress index [0–1]: 0.5·errorRate + 0.3·clamp(p95ZScore/3) + 0.2·clamp(rpsZScore/3) */
  | 'stressScore';

// ── Operators ─────────────────────────────────────────────────────────────────

export type RuleOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

// ── Conditions ────────────────────────────────────────────────────────────────

/**
 * Tests a single metric value against a constant threshold.
 *
 * Example: { type: 'threshold', metric: 'rps', operator: '>', value: 1000 }
 *
 * Optional scope filters (upstream, pathPattern) narrow the condition to
 * requests matching a specific upstream name or path prefix/glob.
 */
export interface ThresholdCondition {
  readonly type: 'threshold';
  /** Which metric to test */
  readonly metric: MetricKey;
  readonly operator: RuleOperator;
  /** The constant threshold value */
  readonly value: number;
  /**
   * If provided, this condition only fires for the named upstream.
   * Omit (or set to undefined) to match all upstreams.
   */
  readonly upstream?: string;
  /**
   * If provided, this condition only fires for requests whose path starts
   * with this prefix.  e.g. "/api/payments"
   */
  readonly pathPrefix?: string;
}

/**
 * Logical AND: all child conditions must be true.
 */
export interface AndCondition {
  readonly type: 'and';
  readonly conditions: RuleCondition[];
}

/**
 * Logical OR: at least one child condition must be true.
 */
export interface OrCondition {
  readonly type: 'or';
  readonly conditions: RuleCondition[];
}

/**
 * Logical NOT: inverts the child condition.
 */
export interface NotCondition {
  readonly type: 'not';
  readonly condition: RuleCondition;
}

export type RuleCondition =
  | ThresholdCondition
  | AndCondition
  | OrCondition
  | NotCondition;

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Throttle: allow at most `rps` requests per second to pass.
 * Excess requests receive a 429 response.
 */
export interface ThrottleAction {
  readonly type: 'throttle';
  /** Maximum allowed requests per second after throttle is active */
  readonly rps: number;
  /** Optional custom 429 message */
  readonly message?: string;
}

/**
 * Block: reject all matching requests immediately.
 */
export interface BlockAction {
  readonly type: 'block';
  /** HTTP status code to return (default 503) */
  readonly statusCode: number;
  /** Body message */
  readonly message: string;
}

/**
 * Alert: emit an event to the EventBus (and optionally log).
 * Does NOT block or modify the request — purely observational.
 */
export interface AlertAction {
  readonly type: 'alert';
  readonly severity: 'info' | 'warning' | 'critical';
  readonly message: string;
}

/**
 * Redirect: proxy the request to a different upstream instead of the default.
 * Useful for failover/canary rules.
 */
export interface RedirectAction {
  readonly type: 'redirect';
  /** Name of the upstream to forward to */
  readonly upstream: string;
}

export type RuleAction =
  | ThrottleAction
  | BlockAction
  | AlertAction
  | RedirectAction;

// ── Rule ──────────────────────────────────────────────────────────────────────

/**
 * A single named rule: condition → action.
 *
 * Rules are evaluated in ascending `priority` order (0 = highest priority).
 * When a rule matches:
 *   - its action is recorded in the EvaluationResult
 *   - if continueOnMatch is false (default), evaluation stops
 *   - if continueOnMatch is true, remaining rules are still evaluated
 *
 * Rule versioning: `version` is bumped each time the rule is mutated.
 * It is independent of RuleSet.version (which tracks the whole set).
 */
export interface Rule {
  /** Stable identifier — must be unique within a RuleSet */
  readonly id: string;
  readonly name: string;
  /**
   * Lower numbers are evaluated first.
   * Range: 0–9999. Default: 100.
   */
  readonly priority: number;
  readonly enabled: boolean;
  readonly condition: RuleCondition;
  readonly action: RuleAction;
  /**
   * When true, rule evaluation continues even after this rule matches.
   * Allows multiple alert actions to fire simultaneously.
   */
  readonly continueOnMatch: boolean;
  /** Monotonic integer bumped on every mutation */
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * After a rule fires, suppress re-firing for the same upstream+path key for
   * this many milliseconds. Omit or set to 0 to disable.
   */
  readonly cooldownMs?: number;
  /**
   * ISO 8601 expiry timestamp. If set and the current time is past this value
   * the rule is treated as disabled (without modifying the ruleset on disk).
   * Example: "2026-12-31T23:59:59.000Z"
   */
  readonly expiresAt?: string;
}

// ── RuleSet ───────────────────────────────────────────────────────────────────

/**
 * A named, versioned collection of Rules.
 *
 * `version` is a monotonic integer bumped on every mutation.
 * Hot-reload compares the new ruleset version against the loaded version
 * to detect no-op reloads.
 */
export interface RuleSet {
  readonly name: string;
  /** Monotonic integer. Incremented on every add/update/delete. */
  readonly version: number;
  readonly rules: Rule[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A point-in-time snapshot of a RuleSet stored in history.
 */
export interface RuleSetHistoryEntry {
  readonly version: number;
  readonly rules: Rule[];
  readonly replacedAt: string;
  /** Why this version was replaced */
  readonly reason: 'mutation' | 'hot-reload';
}

// ── Evaluation Input ──────────────────────────────────────────────────────────

/**
 * All context available to the rule evaluator for a single evaluation pass.
 *
 * The evaluator is a pure function: given this input it deterministically
 * produces an EvaluationResult.
 */
export interface EvaluationInput {
  /**
   * Current metric values keyed by MetricKey.
   * Populated from a WindowSnapshot. Missing keys evaluate as 0.
   */
  readonly metrics: Partial<Record<MetricKey, number>>;
  /**
   * Optional upstream name for scope-filtered conditions.
   */
  readonly upstream?: string;
  /**
   * Optional request path for scope-filtered conditions.
   */
  readonly path?: string;
  /**
   * Evaluation timestamp (ms) for observability.
   */
  readonly evaluatedAtMs: number;
}

// ── Evaluation Result ─────────────────────────────────────────────────────────

/**
 * Describes a single rule that matched during an evaluation pass.
 */
export interface RuleMatch {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly priority: number;
  readonly action: RuleAction;
}

/**
 * Full result of one rule chain evaluation.
 *
 * `matches` contains all rules that fired (may be >1 if continueOnMatch is used).
 * `decidingAction` is the action from the first non-continueOnMatch match,
 * or from the last match if all matched rules had continueOnMatch=true.
 * If no rules matched, decidingAction is null.
 */
export interface EvaluationResult {
  /** All rules that matched, in evaluation order */
  readonly matches: RuleMatch[];
  /**
   * The action that should be applied to the request, or null if no rules matched.
   * For alert-only pipelines this will be an AlertAction.
   */
  readonly decidingAction: RuleAction | null;
  /** True if at least one rule matched */
  readonly triggered: boolean;
  /** Version of the RuleSet that was evaluated */
  readonly ruleSetVersion: number;
  /** When the evaluation ran */
  readonly evaluatedAtMs: number;
}

// ── Engine Config ─────────────────────────────────────────────────────────────

export interface RuleEngineConfig {
  /**
   * Maximum number of historical RuleSet versions to retain in memory.
   * @default 10
   */
  readonly maxHistoryDepth: number;
  /**
   * Path to the rules JSON/YAML file for hot-reload.
   * If null, hot-reload is disabled.
   * @default null
   */
  readonly rulesFilePath: string | null;
  /**
   * Debounce delay in ms before re-reading the rules file after a change event.
   * @default 200
   */
  readonly hotReloadDebounceMs: number;
}

export const DEFAULT_RULE_ENGINE_CONFIG: RuleEngineConfig = {
  maxHistoryDepth: 10,
  rulesFilePath: null,
  hotReloadDebounceMs: 200,
};

// ── Engine Interface ──────────────────────────────────────────────────────────

export interface IRuleEngine {
  /** Evaluate the current ruleset against the given input */
  evaluate(input: EvaluationInput): EvaluationResult;

  /** Return all rules, sorted by priority */
  getRules(): Rule[];

  /** Return the current ruleset */
  getRuleSet(): RuleSet;

  /** Add a new rule; bumps RuleSet.version */
  addRule(rule: Omit<Rule, 'version' | 'createdAt' | 'updatedAt'>): Rule;

  /** Update an existing rule by id; bumps both Rule.version and RuleSet.version */
  updateRule(id: string, patch: Partial<Omit<Rule, 'id' | 'version' | 'createdAt' | 'updatedAt'>>): Rule;

  /** Remove a rule by id; bumps RuleSet.version */
  deleteRule(id: string): void;

  /** Atomically replace the entire ruleset (used by hot-reload) */
  loadRuleSet(ruleSet: RuleSet): void;

  /** Return historical ruleset versions */
  getHistory(): RuleSetHistoryEntry[];

  /** Graceful shutdown — stops the file watcher if active */
  shutdown(): void;
}
