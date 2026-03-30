/**
 * Module 3: Rule Engine — Core Implementation
 *
 * Architecture:
 *   - Holds a single active RuleSet in memory
 *   - Maintains a bounded history of previous RuleSets (for audit/rollback)
 *   - Mutation operations (add/update/delete) bump RuleSet.version atomically
 *   - loadRuleSet() atomically replaces the active set (hot-reload entrypoint)
 *   - evaluate() is a thin wrapper around the pure evaluateChain() function
 *   - Emits EventBus events for mutations and hot-reload
 *
 * Thread safety:
 *   Node.js is single-threaded. No locks needed.
 *
 * Singleton:
 *   getRuleEngine() returns the process-global instance.
 *   resetRuleEngine() replaces it (test isolation only).
 */

import { logger } from '../../logger';
import { eventBus, EventType } from '../../events/EventBus';
import {
  DEFAULT_RULE_ENGINE_CONFIG,
  EvaluationInput,
  EvaluationResult,
  IRuleEngine,
  Rule,
  RuleEngineConfig,
  RuleSet,
  RuleSetHistoryEntry,
} from './types';
import { evaluateChain, validateRule } from './math';
import { RuleLoader } from './loader';

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function bumpVersion(version: number): number {
  return version + 1;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class RuleEngine implements IRuleEngine {
  private ruleSet: RuleSet;
  private readonly history: RuleSetHistoryEntry[] = [];
  private readonly cfg: RuleEngineConfig;
  private loader: RuleLoader | null = null;
  /**
   * Cooldown tracking: maps "ruleId:upstream:path" → lastFiredMs.
   * Rules with cooldownMs set are suppressed if they fired within the interval
   * for the same upstream+path combination.
   */
  private readonly cooldownState = new Map<string, number>();

  constructor(cfg: Partial<RuleEngineConfig> = {}) {
    this.cfg = { ...DEFAULT_RULE_ENGINE_CONFIG, ...cfg };
    this.ruleSet = {
      name: 'default',
      version: 1,
      rules: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    if (this.cfg.rulesFilePath) {
      this.loader = new RuleLoader(
        this.cfg.rulesFilePath,
        this.cfg.hotReloadDebounceMs,
        (ruleSet) => this.loadRuleSet(ruleSet),
      );
      this.loader.start();
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  evaluate(input: EvaluationInput): EvaluationResult {
    const nowMs = input.evaluatedAtMs;
    const scopeKey = `${input.upstream ?? ''}:${input.path ?? ''}`;

    // Build a view of the ruleset with cooldown-suppressed rules disabled
    const filteredRules = this.ruleSet.rules.map((rule) => {
      if (rule.cooldownMs && rule.cooldownMs > 0) {
        const cdKey = `${rule.id}:${scopeKey}`;
        const lastFired = this.cooldownState.get(cdKey);
        if (lastFired !== undefined && nowMs - lastFired < rule.cooldownMs) {
          return { ...rule, enabled: false };
        }
      }
      return rule;
    });

    const result = evaluateChain({ ...this.ruleSet, rules: filteredRules }, input);

    // Record cooldown timestamps for every rule that just fired
    for (const match of result.matches) {
      const rule = this.ruleSet.rules.find((r) => r.id === match.ruleId);
      if (rule?.cooldownMs && rule.cooldownMs > 0) {
        this.cooldownState.set(`${rule.id}:${scopeKey}`, nowMs);
      }
    }

    return result;
  }

  getRules(): Rule[] {
    return [...this.ruleSet.rules].sort((a, b) => a.priority - b.priority);
  }

  getRuleSet(): RuleSet {
    return this.ruleSet;
  }

  addRule(
    partial: Omit<Rule, 'version' | 'createdAt' | 'updatedAt'>,
  ): Rule {
    // Validate
    const errors = validateRule(partial);
    if (errors.length > 0) {
      throw new Error(`Invalid rule: ${errors.join('; ')}`);
    }

    // Duplicate id check
    if (this.ruleSet.rules.some((r) => r.id === partial.id)) {
      throw new Error(`Rule with id "${partial.id}" already exists`);
    }

    const now = nowIso();
    const rule: Rule = {
      ...partial,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.pushHistory('mutation');
    this.ruleSet = {
      ...this.ruleSet,
      version: bumpVersion(this.ruleSet.version),
      rules: [...this.ruleSet.rules, rule],
      updatedAt: now,
    };

    logger.info(`[RuleEngine] Added rule "${rule.id}" (RuleSet v${this.ruleSet.version})`);
    this.emitConfigChanged('rule_added', { ruleId: rule.id });

    return rule;
  }

  updateRule(
    id: string,
    patch: Partial<Omit<Rule, 'id' | 'version' | 'createdAt' | 'updatedAt'>>,
  ): Rule {
    const index = this.ruleSet.rules.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Rule "${id}" not found`);
    }

    const existing = this.ruleSet.rules[index]!;
    const now = nowIso();
    const updated: Rule = {
      ...existing,
      ...patch,
      id,
      version: bumpVersion(existing.version),
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    // Validate merged rule
    const errors = validateRule(updated);
    if (errors.length > 0) {
      throw new Error(`Invalid rule update: ${errors.join('; ')}`);
    }

    this.pushHistory('mutation');
    const newRules = [...this.ruleSet.rules];
    newRules[index] = updated;
    this.ruleSet = {
      ...this.ruleSet,
      version: bumpVersion(this.ruleSet.version),
      rules: newRules,
      updatedAt: now,
    };

    logger.info(`[RuleEngine] Updated rule "${id}" (RuleSet v${this.ruleSet.version})`);
    this.emitConfigChanged('rule_updated', { ruleId: id });

    return updated;
  }

  deleteRule(id: string): void {
    const index = this.ruleSet.rules.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Rule "${id}" not found`);
    }

    this.pushHistory('mutation');
    this.ruleSet = {
      ...this.ruleSet,
      version: bumpVersion(this.ruleSet.version),
      rules: this.ruleSet.rules.filter((r) => r.id !== id),
      updatedAt: nowIso(),
    };

    logger.info(`[RuleEngine] Deleted rule "${id}" (RuleSet v${this.ruleSet.version})`);
    this.emitConfigChanged('rule_deleted', { ruleId: id });
  }

  loadRuleSet(incoming: RuleSet): void {
    // No-op if version hasn't changed
    if (incoming.version === this.ruleSet.version) {
      logger.debug('[RuleEngine] loadRuleSet: no version change, skipping');
      return;
    }

    this.pushHistory('hot-reload');
    this.ruleSet = incoming;

    logger.info(
      `[RuleEngine] Hot-reloaded ruleset "${incoming.name}" v${incoming.version} ` +
      `(${incoming.rules.length} rules)`,
    );
    this.emitConfigChanged('hot_reload', { version: incoming.version });
  }

  getHistory(): RuleSetHistoryEntry[] {
    return [...this.history];
  }

  shutdown(): void {
    this.loader?.stop();
    logger.debug('[RuleEngine] shutdown');
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private pushHistory(reason: RuleSetHistoryEntry['reason']): void {
    this.history.push({
      version: this.ruleSet.version,
      rules: [...this.ruleSet.rules],
      replacedAt: nowIso(),
      reason,
    });

    // Trim to configured max
    while (this.history.length > this.cfg.maxHistoryDepth) {
      this.history.shift();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private emitConfigChanged(subtype: string, meta: Record<string, any>): void {
    try {
      eventBus.emit(EventType.CONFIG_CHANGED, {
        timestamp: new Date().toISOString(),
        source: 'rule_engine',
        subtype,
        ruleSetVersion: this.ruleSet.version,
        ...meta,
      });
    } catch {
      // Event emission must never crash the engine
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: RuleEngine | null = null;

export function getRuleEngine(cfg?: Partial<RuleEngineConfig>): RuleEngine {
  if (!_instance) {
    _instance = new RuleEngine(cfg);
  }
  return _instance;
}

/** Replace the singleton — for test isolation only */
export function resetRuleEngine(cfg?: Partial<RuleEngineConfig>): RuleEngine {
  _instance?.shutdown();
  _instance = new RuleEngine(cfg);
  return _instance;
}
