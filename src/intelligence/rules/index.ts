// Copyright (c) 2026 Tapas Adhikary. All rights reserved.
// This file is part of the FlexGate Runtime Intelligence Layer.
// Licensed under the Business Source License 1.1 (BUSL-1.1).
// See LICENSE in the project root for full terms.
// Commercial use requires a separate license. Change Date: 2030-04-06.

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
  computeStressScore,
} from './math';

export {
  RuleEngine,
  getRuleEngine,
  resetRuleEngine,
} from './RuleEngine';

export { RuleLoader, parseRuleSetFile } from './loader';
export { ruleEngineMiddleware } from './middleware';
export { ruleRouter } from './router';
