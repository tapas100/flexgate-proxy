/**
 * Module 3: Rule Engine — Pure Evaluation Functions
 *
 * All functions here are pure (no I/O, no side effects, deterministic).
 * They can be unit-tested without instantiating any engine.
 *
 * Evaluation semantics:
 *   applyOperator   — compares two numbers with a RuleOperator
 *   evaluateThreshold — resolves the metric value and applies the operator
 *   evaluateCondition — recursively evaluates any RuleCondition
 *   evaluateRule    — tests a rule's condition and wraps the result
 *   evaluateChain   — drives the priority-ordered evaluation loop
 */

import type {
  EvaluationInput,
  EvaluationResult,
  MetricKey,
  Rule,
  RuleCondition,
  RuleMatch,
  RuleOperator,
  RuleSet,
  ThresholdCondition,
} from './types';

// ── Operator ──────────────────────────────────────────────────────────────────

/**
 * Apply a binary comparison operator to two numbers.
 * Returns true when the condition holds.
 */
export function applyOperator(
  left: number,
  op: RuleOperator,
  right: number,
): boolean {
  switch (op) {
    case '>':  return left > right;
    case '>=': return left >= right;
    case '<':  return left < right;
    case '<=': return left <= right;
    case '==': return left === right;
    case '!=': return left !== right;
  }
}

// ── Metric Resolution ─────────────────────────────────────────────────────────

/**
 * Read a metric value from the EvaluationInput.
 * Returns 0 for missing keys so conditions fail gracefully when data is sparse.
 */
export function resolveMetric(
  input: EvaluationInput,
  key: MetricKey,
): number {
  return input.metrics[key] ?? 0;
}

// ── Scope Filtering ───────────────────────────────────────────────────────────

/**
 * Returns true when the condition's scope filters (upstream, pathPrefix)
 * are satisfied by the evaluation input.
 *
 * If a filter is absent/undefined it is treated as a wildcard.
 */
export function matchesScope(
  condition: ThresholdCondition,
  input: EvaluationInput,
): boolean {
  if (condition.upstream !== undefined && condition.upstream !== input.upstream) {
    return false;
  }
  if (condition.pathPrefix !== undefined) {
    const path = input.path ?? '';
    if (!path.startsWith(condition.pathPrefix)) {
      return false;
    }
  }
  return true;
}

// ── Condition Evaluation ──────────────────────────────────────────────────────

/**
 * Recursively evaluate a RuleCondition against an EvaluationInput.
 *
 * - threshold: extract metric, check scope, apply operator
 * - and:       all children must be true (short-circuit)
 * - or:        at least one child must be true (short-circuit)
 * - not:       negate the child result
 */
export function evaluateCondition(
  condition: RuleCondition,
  input: EvaluationInput,
): boolean {
  switch (condition.type) {
    case 'threshold': {
      if (!matchesScope(condition, input)) return false;
      const actual = resolveMetric(input, condition.metric);
      return applyOperator(actual, condition.operator, condition.value);
    }
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, input));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, input));
    case 'not':
      return !evaluateCondition(condition.condition, input);
  }
}

// ── Rule Evaluation ───────────────────────────────────────────────────────────

/**
 * Test a single rule against an EvaluationInput.
 * Returns a RuleMatch if the rule fires, or null if it does not.
 *
 * Checks are applied in order:
 *   1. disabled flag
 *   2. expiresAt — expired rules are treated as disabled
 *   3. condition evaluation
 */
export function evaluateRule(
  rule: Rule,
  input: EvaluationInput,
): RuleMatch | null {
  if (!rule.enabled) return null;

  // Auto-expiry: treat expired rules as disabled without mutating state
  if (rule.expiresAt) {
    const expiryMs = Date.parse(rule.expiresAt);
    if (!isNaN(expiryMs) && input.evaluatedAtMs >= expiryMs) {
      return null;
    }
  }

  if (!evaluateCondition(rule.condition, input)) return null;
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    priority: rule.priority,
    action: rule.action,
  };
}

// ── Chain Evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate all enabled rules in a RuleSet against an EvaluationInput.
 *
 * Rules are processed in ascending `priority` order (lower = higher priority).
 * After each match:
 *   - if rule.continueOnMatch is false → stop and return
 *   - if rule.continueOnMatch is true  → continue to next rule
 *
 * The `decidingAction` in the result is the action of the first non-continue
 * match.  If every matching rule had continueOnMatch=true, the deciding action
 * is from the last match.  If nothing matched, decidingAction is null.
 */
export function evaluateChain(
  ruleSet: RuleSet,
  input: EvaluationInput,
): EvaluationResult {
  const sorted = [...ruleSet.rules].sort((a, b) => a.priority - b.priority);

  const matches: RuleMatch[] = [];
  let decidingAction = null as EvaluationResult['decidingAction'];

  for (const rule of sorted) {
    const match = evaluateRule(rule, input);
    if (match === null) continue;

    matches.push(match);

    if (!rule.continueOnMatch) {
      // First non-continue match → this is the deciding action; stop evaluating
      decidingAction = match.action;
      break;
    }

    // continueOnMatch rule: keep as candidate deciding action in case no
    // non-continue rule ever fires (last-match-wins among continue-only rules)
    decidingAction = match.action;
  }

  return {
    matches,
    decidingAction,
    triggered: matches.length > 0,
    ruleSetVersion: ruleSet.version,
    evaluatedAtMs: input.evaluatedAtMs,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_METRIC_KEYS = new Set<string>([
  'rps', 'errorRate', 'clientErrorRate',
  'meanLatencyMs', 'p50LatencyMs', 'p95LatencyMs', 'p99LatencyMs', 'maxLatencyMs',
  'requestCount', 'avgRequestBytes', 'avgResponseBytes',
  'stressScore',
]);

const VALID_OPERATORS = new Set<string>(['>', '>=', '<', '<=', '==', '!=']);

/**
 * Validate a RuleCondition tree.
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validateCondition(
  condition: RuleCondition,
  path = 'condition',
): string[] {
  const errors: string[] = [];

  switch (condition.type) {
    case 'threshold':
      if (!VALID_METRIC_KEYS.has(condition.metric)) {
        errors.push(`${path}: unknown metric "${condition.metric}"`);
      }
      if (!VALID_OPERATORS.has(condition.operator)) {
        errors.push(`${path}: unknown operator "${condition.operator}"`);
      }
      if (typeof condition.value !== 'number' || isNaN(condition.value)) {
        errors.push(`${path}: value must be a finite number`);
      }
      break;
    case 'and':
    case 'or':
      if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) {
        errors.push(`${path}: "${condition.type}" requires at least one child condition`);
      } else {
        condition.conditions.forEach((c, i) =>
          errors.push(...validateCondition(c, `${path}.conditions[${i}]`)),
        );
      }
      break;
    case 'not':
      errors.push(...validateCondition(condition.condition, `${path}.condition`));
      break;
    default: {
      // exhaustive check
      const _never: never = condition;
      errors.push(`${path}: unknown condition type`);
      void _never;
    }
  }

  return errors;
}

/**
 * Validate an action object.
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validateAction(action: Rule['action'], path = 'action'): string[] {
  const errors: string[] = [];
  switch (action.type) {
    case 'throttle':
      if (typeof action.rps !== 'number' || action.rps <= 0) {
        errors.push(`${path}: throttle.rps must be a positive number`);
      }
      break;
    case 'block':
      if (typeof action.statusCode !== 'number' || action.statusCode < 400) {
        errors.push(`${path}: block.statusCode must be >= 400`);
      }
      if (!action.message) {
        errors.push(`${path}: block.message is required`);
      }
      break;
    case 'alert':
      if (!['info', 'warning', 'critical'].includes(action.severity)) {
        errors.push(`${path}: alert.severity must be info|warning|critical`);
      }
      if (!action.message) {
        errors.push(`${path}: alert.message is required`);
      }
      break;
    case 'redirect':
      if (!action.upstream) {
        errors.push(`${path}: redirect.upstream is required`);
      }
      break;
    default: {
      const _never: never = action;
      errors.push(`${path}: unknown action type`);
      void _never;
    }
  }
  return errors;
}

/**
 * Validate a complete Rule.
 */
export function validateRule(rule: Partial<Rule>, path = 'rule'): string[] {
  const errors: string[] = [];
  if (!rule.id || typeof rule.id !== 'string') {
    errors.push(`${path}: id is required and must be a string`);
  }
  if (!rule.name || typeof rule.name !== 'string') {
    errors.push(`${path}: name is required`);
  }
  if (typeof rule.priority !== 'number' || rule.priority < 0 || rule.priority > 9999) {
    errors.push(`${path}: priority must be 0–9999`);
  }
  if (rule.condition) {
    errors.push(...validateCondition(rule.condition, `${path}.condition`));
  } else {
    errors.push(`${path}: condition is required`);
  }
  if (rule.action) {
    errors.push(...validateAction(rule.action, `${path}.action`));
  } else {
    errors.push(`${path}: action is required`);
  }
  return errors;
}

// Stress Score

/**
 * Compute a normalised stress index in [0, 1] that combines error rate and
 * anomaly z-scores for p95 latency and RPS.
 *
 * Formula:
 *   stressScore = 0.5 * errorRate
 *               + 0.3 * clamp(p95ZScore / 3, 0, 1)
 *               + 0.2 * clamp(rpsZScore  / 3, 0, 1)
 *
 * @param errorRate   - fraction of requests that returned 5xx (1)0
 * @param p95ZScore   - z-score for p95 latency (from AnomalyEngine)
 * @param rpsZScore   - z-score for RPS (from AnomalyEngine)
 * @returns           - stress score in [0, 1]
 */
export function computeStressScore(
  errorRate: number,
  p95ZScore: number,
  rpsZScore: number,
): number {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return (
    0.5 * clamp(errorRate) +
    0.3 * clamp(p95ZScore / 3) +
    0.2 * clamp(rpsZScore / 3)
  );
}
