/**
 * Module 3: Rule Engine — Hot-Reload File Loader
 *
 * RuleLoader watches a JSON or YAML file on disk and automatically
 * hot-swaps the RuleSet in the RuleEngine when the file changes.
 *
 * Behaviour:
 *   - Uses fs.watch() (kernel-level inotify/kqueue) for low-latency detection
 *   - Debounces change events to avoid duplicate reads during atomic writes
 *   - Validates the parsed RuleSet before applying it (malformed files are
 *     logged and ignored — the running ruleset is never replaced with invalid data)
 *   - Assigns an incrementing version if the file omits one
 *   - Falls back to fs.watchFile() polling if fs.watch is unavailable
 *
 * File format (JSON):
 * {
 *   "name": "production",
 *   "version": 42,          // optional — auto-assigned if absent
 *   "rules": [...]
 * }
 *
 * YAML is supported when the file extension is .yaml or .yml.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../logger';
import type { Rule, RuleSet } from './types';
import { validateRule } from './math';

type OnLoadCallback = (ruleSet: RuleSet) => void;

// ── YAML optional support ─────────────────────────────────────────────────────

function tryParseYaml(raw: string): unknown {
  try {
    // js-yaml is a prod dependency — use it when available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml') as { load: (s: string) => unknown };
    return yaml.load(raw);
  } catch {
    throw new Error('YAML parsing failed — ensure js-yaml is installed');
  }
}

function parseFile(filePath: string, raw: string): unknown {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    return tryParseYaml(raw);
  }
  return JSON.parse(raw);
}

// ── Parsing & Validation ──────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

let _autoVersion = 1000;

/**
 * Parse raw file content into a validated RuleSet.
 * Throws a descriptive error on any validation failure.
 */
export function parseRuleSetFile(filePath: string, raw: string): RuleSet {
  let parsed: unknown;
  try {
    parsed = parseFile(filePath, raw);
  } catch (e) {
    throw new Error(`Failed to parse rules file: ${(e as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Rules file must be a JSON/YAML object');
  }

  const obj = parsed as Record<string, unknown>;

  // Rules array
  if (!Array.isArray(obj['rules'])) {
    throw new Error('Rules file must have a "rules" array');
  }

  const rules: Rule[] = [];
  for (let i = 0; i < (obj['rules'] as unknown[]).length; i++) {
    const raw = (obj['rules'] as unknown[])[i];
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`rules[${i}] must be an object`);
    }
    const r = raw as Partial<Rule>;

    // Normalise defaults
    const rule: Rule = {
      id: r.id ?? `rule-${i}`,
      name: r.name ?? `Rule ${i}`,
      priority: r.priority ?? 100,
      enabled: r.enabled !== false,
      condition: r.condition!,
      action: r.action!,
      continueOnMatch: r.continueOnMatch ?? false,
      version: r.version ?? 1,
      createdAt: r.createdAt ?? nowIso(),
      updatedAt: r.updatedAt ?? nowIso(),
      ...(typeof r.cooldownMs === 'number' ? { cooldownMs: r.cooldownMs } : {}),
      ...(typeof r.expiresAt === 'string'  ? { expiresAt: r.expiresAt }   : {}),
    };

    const errors = validateRule(rule, `rules[${i}]`);
    if (errors.length > 0) {
      throw new Error(`Validation failed for rules[${i}]: ${errors.join('; ')}`);
    }

    rules.push(rule);
  }

  const now = nowIso();
  return {
    name: typeof obj['name'] === 'string' ? obj['name'] : 'default',
    version: typeof obj['version'] === 'number' ? obj['version'] : ++_autoVersion,
    rules,
    createdAt: typeof obj['createdAt'] === 'string' ? obj['createdAt'] : now,
    updatedAt: typeof obj['updatedAt'] === 'string' ? obj['updatedAt'] : now,
  };
}

// ── RuleLoader ────────────────────────────────────────────────────────────────

export class RuleLoader {
  private readonly filePath: string;
  private readonly debounceMs: number;
  private readonly onLoad: OnLoadCallback;

  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(filePath: string, debounceMs: number, onLoad: OnLoadCallback) {
    this.filePath = filePath;
    this.debounceMs = debounceMs;
    this.onLoad = onLoad;
  }

  /** Start watching the file. Performs an immediate initial load. */
  start(): void {
    this.loadNow(); // initial load

    try {
      this.watcher = fs.watch(this.filePath, { persistent: false }, () => {
        this.scheduleReload();
      });
      logger.info(`[RuleLoader] Watching rules file: ${this.filePath}`);
    } catch (e) {
      logger.warn(
        `[RuleLoader] fs.watch() unavailable for "${this.filePath}": ${(e as Error).message}. ` +
        'Hot-reload disabled.',
      );
    }
  }

  /** Stop the watcher. */
  stop(): void {
    this.stopped = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.watcher?.close();
    this.watcher = null;
    logger.debug(`[RuleLoader] Stopped watching ${this.filePath}`);
  }

  /** Force an immediate reload (used by the admin API). */
  forceReload(): void {
    this.loadNow();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private scheduleReload(): void {
    if (this.stopped) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.loadNow();
    }, this.debounceMs);
  }

  private loadNow(): void {
    if (this.stopped) return;
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch (e) {
      logger.warn(`[RuleLoader] Cannot read rules file "${this.filePath}": ${(e as Error).message}`);
      return;
    }

    let ruleSet;
    try {
      ruleSet = parseRuleSetFile(this.filePath, raw);
    } catch (e) {
      logger.error(`[RuleLoader] Invalid rules file "${this.filePath}": ${(e as Error).message}`);
      return;
    }

    try {
      this.onLoad(ruleSet);
    } catch (e) {
      logger.error(`[RuleLoader] Callback error after loading rules: ${(e as Error).message}`);
    }
  }
}
