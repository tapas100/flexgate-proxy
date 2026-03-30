/**
 * Module 1: Metrics & Signal Engine — REST API
 *
 * Endpoints:
 *   GET /api/intelligence/signals              → all snapshots
 *   GET /api/intelligence/signals/:key         → single snapshot (URL-encoded key)
 *   GET /api/intelligence/signals/keys         → list of tracked keys
 *
 * All responses are JSON. No authentication here — mount behind
 * your admin auth middleware in app.ts.
 */

import { Router, Request, Response } from 'express';
import { getSignalEngine } from './SignalEngine';

export const signalRouter = Router();

/** GET /api/intelligence/signals */
signalRouter.get('/', (_req: Request, res: Response) => {
  const engine = getSignalEngine();
  const snapshots = engine.snapshotAll();
  res.json({
    count: snapshots.length,
    snapshots,
  });
});

/** GET /api/intelligence/signals/keys */
signalRouter.get('/keys', (_req: Request, res: Response) => {
  const engine = getSignalEngine();
  res.json({ keys: engine.keys() });
});

/** GET /api/intelligence/signals/:key (key is URL-encoded) */
signalRouter.get('/:key', (req: Request, res: Response) => {
  const key = decodeURIComponent(req.params['key'] ?? '');
  if (!key) {
    res.status(400).json({ error: 'key is required' });
    return;
  }

  const engine = getSignalEngine();
  const snap = engine.snapshot(key);

  if (!snap) {
    res.status(404).json({ error: 'key not found', key });
    return;
  }

  res.json(snap);
});
