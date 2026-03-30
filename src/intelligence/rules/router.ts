/**
 * Module 3: Rule Engine — REST Admin API
 *
 * All endpoints are JSON. Mount behind admin auth middleware in app.ts.
 *
 * GET    /api/intelligence/rules              → list all rules (sorted by priority)
 * POST   /api/intelligence/rules              → add a new rule
 * GET    /api/intelligence/rules/ruleset      → current RuleSet (version + metadata)
 * GET    /api/intelligence/rules/history      → RuleSet version history
 * POST   /api/intelligence/rules/reload       → force hot-reload from file
 * POST   /api/intelligence/rules/evaluate     → evaluate a test input against rules
 * GET    /api/intelligence/rules/:id          → get rule by id
 * PUT    /api/intelligence/rules/:id          → update rule by id
 * DELETE /api/intelligence/rules/:id          → delete rule by id
 */

import { Router, Request, Response } from 'express';
import { getRuleEngine } from './RuleEngine';
import { validateRule } from './math';
import type { EvaluationInput, Rule } from './types';

export const ruleRouter = Router();

// ── GET /rules ────────────────────────────────────────────────────────────────

ruleRouter.get('/', (_req: Request, res: Response) => {
  const engine = getRuleEngine();
  res.json({
    count: engine.getRules().length,
    rules: engine.getRules(),
  });
});

// ── GET /rules/ruleset ────────────────────────────────────────────────────────

ruleRouter.get('/ruleset', (_req: Request, res: Response) => {
  const engine = getRuleEngine();
  res.json(engine.getRuleSet());
});

// ── GET /rules/history ────────────────────────────────────────────────────────

ruleRouter.get('/history', (_req: Request, res: Response) => {
  const engine = getRuleEngine();
  const history = engine.getHistory();
  res.json({
    count: history.length,
    history,
  });
});

// ── POST /rules/reload ────────────────────────────────────────────────────────

ruleRouter.post('/reload', (_req: Request, res: Response) => {
  const engine = getRuleEngine();
  const ruleSet = engine.getRuleSet();

  // The loader is internal — we trigger a reload by updating updatedAt to
  // force the version bump. The real reload path is RuleLoader.forceReload()
  // which is called when rulesFilePath is configured on the engine.
  //
  // Here we expose the hook: callers can POST /reload to trigger it.
  // If no file is configured, we return 409 Conflict.
  //
  // Access the loader via the engine's internal config check:
  if (!('loader' in engine) || (engine as unknown as { loader: unknown })['loader'] === null) {
    // Check config via getRuleSet — if no file is configured we inform caller
    res.status(409).json({
      error: 'Hot-reload is not configured. Set rulesFilePath in RuleEngineConfig.',
    });
    return;
  }

  // Trigger through the engine's loader (accessed via type cast for encapsulation)
  try {
    (engine as unknown as { loader: { forceReload(): void } }).loader.forceReload();
    res.json({
      message: 'Reload triggered',
      currentVersion: ruleSet.version,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── POST /rules/evaluate ──────────────────────────────────────────────────────

ruleRouter.post('/evaluate', (req: Request, res: Response) => {
  const body = req.body as Partial<EvaluationInput> & { metrics?: Record<string, number> };

  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Request body must be a JSON object' });
    return;
  }

  const input: EvaluationInput = {
    metrics: (body.metrics as EvaluationInput['metrics']) ?? {},
    upstream: body.upstream,
    path: body.path,
    evaluatedAtMs: Date.now(),
  };

  const engine = getRuleEngine();
  const result = engine.evaluate(input);
  res.json(result);
});

// ── POST /rules ───────────────────────────────────────────────────────────────

ruleRouter.post('/', (req: Request, res: Response) => {
  const body = req.body as Partial<Rule>;

  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Request body must be a JSON object' });
    return;
  }

  const errors = validateRule(body);
  if (errors.length > 0) {
    res.status(422).json({ error: 'Validation failed', details: errors });
    return;
  }

  try {
    const engine = getRuleEngine();
    const rule = engine.addRule({
      id: body.id!,
      name: body.name!,
      priority: body.priority ?? 100,
      enabled: body.enabled !== false,
      condition: body.condition!,
      action: body.action!,
      continueOnMatch: body.continueOnMatch ?? false,
    });
    res.status(201).json(rule);
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});

// ── GET /rules/:id ────────────────────────────────────────────────────────────

ruleRouter.get('/:id', (req: Request, res: Response) => {
  const id = req.params['id'];
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  const engine = getRuleEngine();
  const rule = engine.getRules().find((r) => r.id === id);
  if (!rule) {
    res.status(404).json({ error: `Rule "${id}" not found` });
    return;
  }

  res.json(rule);
});

// ── PUT /rules/:id ────────────────────────────────────────────────────────────

ruleRouter.put('/:id', (req: Request, res: Response) => {
  const id = req.params['id'];
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  const body = req.body as Partial<Rule>;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Request body must be a JSON object' });
    return;
  }

  try {
    const engine = getRuleEngine();
    const updated = engine.updateRule(id, body);
    res.json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
    } else if (msg.includes('Invalid rule')) {
      res.status(422).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

// ── DELETE /rules/:id ─────────────────────────────────────────────────────────

ruleRouter.delete('/:id', (req: Request, res: Response) => {
  const id = req.params['id'];
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    const engine = getRuleEngine();
    engine.deleteRule(id);
    res.status(204).send();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});
