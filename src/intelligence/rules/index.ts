/**
 * Module 3: Rule Engine — Public API
 */

export type {
  MetricKey,
  RuleOperator,
  ThresholdCondition,
  AndCondition,
  OrCondition,
  NotCondition,
  RuleCondition,
  ThrottleAction,
  BlockAction,
  AlertAction,
  RedirectAction,
  RuleAction,
  Rule,
  RuleSet,
  RuleSetHistoryEntry,
  EvaluationInput,
  RuleMatch,
  EvaluationResult,
  RuleEngineConfig,
  IRuleEngine,
} from './types';

export { DEFAULT_RULE_ENGINE_CONFIG } from './types';

export {
  applyOperator,
  resolveMetric,
  matchesScope,
  evaluateCondition,
  evaluateRule,
  evaluateChain,
  validateCondition,
  validateAction,
  validateRule,
} from './math';

export {
  RuleEngine,
  getRuleEngine,
  resetRuleEngine,
} from './RuleEngine';

export { RuleLoader, parseRuleSetFile } from './loader';
export { ruleEngineMiddleware } from './middleware';
export { ruleRouter } from './router';
