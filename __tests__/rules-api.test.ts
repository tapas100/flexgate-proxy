/**
 * Rule Engine REST API Integration Tests
 *
 * Tests the ruleRouter and underlying RuleEngine without booting the full app.
 * A minimal Express server is created per-suite for isolation.
 */

import express from 'express';
import request from 'supertest';
import { resetRuleEngine } from '../src/intelligence/rules/RuleEngine';
import { ruleRouter } from '../src/intelligence/rules/router';
import type { Rule } from '../src/intelligence/rules/types';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/intelligence/rules', ruleRouter);
  return app;
}

const validRule: Omit<Rule, 'version' | 'createdAt' | 'updatedAt'> = {
  id: 'rps-spike',
  name: 'RPS Spike Throttle',
  priority: 10,
  enabled: true,
  continueOnMatch: false,
  condition: { type: 'threshold', metric: 'rps', operator: '>', value: 1000 },
  action: { type: 'throttle', rps: 500 },
};

describe('Rule Engine REST API', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    // Fresh engine per test to avoid state bleed
    resetRuleEngine();
    app = buildApp();
  });

  // ── GET /rules ──────────────────────────────────────────────────────────────

  describe('GET /api/intelligence/rules', () => {
    it('returns empty rules list initially', async () => {
      const res = await request(app).get('/api/intelligence/rules').expect(200);
      expect(res.body.count).toBe(0);
      expect(res.body.rules).toEqual([]);
    });

    it('returns rules after creation', async () => {
      await request(app).post('/api/intelligence/rules').send(validRule);
      const res = await request(app).get('/api/intelligence/rules').expect(200);
      expect(res.body.count).toBe(1);
      expect(res.body.rules[0].id).toBe('rps-spike');
    });
  });

  // ── GET /rules/ruleset ──────────────────────────────────────────────────────

  describe('GET /api/intelligence/rules/ruleset', () => {
    it('returns the current ruleset metadata', async () => {
      const res = await request(app).get('/api/intelligence/rules/ruleset').expect(200);
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('rules');
    });
  });

  // ── GET /rules/history ──────────────────────────────────────────────────────

  describe('GET /api/intelligence/rules/history', () => {
    it('returns empty history initially', async () => {
      const res = await request(app).get('/api/intelligence/rules/history').expect(200);
      expect(res.body.count).toBe(0);
      expect(res.body.history).toEqual([]);
    });

    it('history grows after a mutation', async () => {
      await request(app).post('/api/intelligence/rules').send(validRule);
      const res = await request(app).get('/api/intelligence/rules/history').expect(200);
      expect(res.body.count).toBeGreaterThan(0);
      expect(res.body.history[0].reason).toBe('mutation');
    });
  });

  // ── POST /rules ─────────────────────────────────────────────────────────────

  describe('POST /api/intelligence/rules', () => {
    it('creates a valid rule and returns 201', async () => {
      const res = await request(app)
        .post('/api/intelligence/rules')
        .send(validRule)
        .expect(201);

      expect(res.body.id).toBe('rps-spike');
      expect(res.body.version).toBe(1);
      expect(res.body.createdAt).toBeDefined();
    });

    it('returns 409 on duplicate id', async () => {
      await request(app).post('/api/intelligence/rules').send(validRule).expect(201);
      const res = await request(app).post('/api/intelligence/rules').send(validRule).expect(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('returns 422 on invalid rule (missing condition)', async () => {
      const bad = { ...validRule, condition: undefined };
      const res = await request(app).post('/api/intelligence/rules').send(bad).expect(422);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 422 on rule with no action', async () => {
      const bad = { ...validRule, id: 'bad-rule', action: undefined };
      const res = await request(app).post('/api/intelligence/rules').send(bad).expect(422);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  // ── GET /rules/:id ───────────────────────────────────────────────────────────

  describe('GET /api/intelligence/rules/:id', () => {
    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/intelligence/rules/nonexistent').expect(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns the rule by id', async () => {
      await request(app).post('/api/intelligence/rules').send(validRule);
      const res = await request(app).get('/api/intelligence/rules/rps-spike').expect(200);
      expect(res.body.id).toBe('rps-spike');
    });
  });

  // ── PUT /rules/:id ───────────────────────────────────────────────────────────

  describe('PUT /api/intelligence/rules/:id', () => {
    beforeEach(async () => {
      await request(app).post('/api/intelligence/rules').send(validRule);
    });

    it('updates an existing rule', async () => {
      const res = await request(app)
        .put('/api/intelligence/rules/rps-spike')
        .send({ enabled: false, name: 'Updated Name' })
        .expect(200);

      expect(res.body.enabled).toBe(false);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.version).toBe(2);
    });

    it('returns 404 for unknown rule', async () => {
      const res = await request(app)
        .put('/api/intelligence/rules/does-not-exist')
        .send({ enabled: false })
        .expect(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // ── DELETE /rules/:id ────────────────────────────────────────────────────────

  describe('DELETE /api/intelligence/rules/:id', () => {
    beforeEach(async () => {
      await request(app).post('/api/intelligence/rules').send(validRule);
    });

    it('deletes an existing rule and returns 204', async () => {
      await request(app).delete('/api/intelligence/rules/rps-spike').expect(204);
      await request(app).get('/api/intelligence/rules/rps-spike').expect(404);
    });

    it('returns 404 for unknown rule', async () => {
      const res = await request(app).delete('/api/intelligence/rules/ghost').expect(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // ── POST /rules/evaluate ─────────────────────────────────────────────────────

  describe('POST /api/intelligence/rules/evaluate', () => {
    it('returns no match when no rules are defined', async () => {
      const input = { metrics: { rps: 5000 }, upstream: 'svc', path: '/api', evaluatedAtMs: Date.now() };
      const res = await request(app)
        .post('/api/intelligence/rules/evaluate')
        .send(input)
        .expect(200);

      expect(res.body.triggered).toBe(false);
      expect(res.body.decidingAction).toBeNull();
    });

    it('fires throttle action when rps exceeds threshold', async () => {
      await request(app).post('/api/intelligence/rules').send(validRule);

      const input = { metrics: { rps: 2000 }, upstream: 'svc', path: '/api', evaluatedAtMs: Date.now() };
      const res = await request(app)
        .post('/api/intelligence/rules/evaluate')
        .send(input)
        .expect(200);

      expect(res.body.triggered).toBe(true);
      expect(res.body.decidingAction?.type).toBe('throttle');
      expect(res.body.matches).toHaveLength(1);
      expect(res.body.matches[0].ruleId).toBe('rps-spike');
    });

    it('does not fire when metric is below threshold', async () => {
      await request(app).post('/api/intelligence/rules').send(validRule);

      const input = { metrics: { rps: 200 }, upstream: 'svc', path: '/api', evaluatedAtMs: Date.now() };
      const res = await request(app)
        .post('/api/intelligence/rules/evaluate')
        .send(input)
        .expect(200);

      expect(res.body.triggered).toBe(false);
    });

    it('returns no match for empty metrics object', async () => {
      await request(app).post('/api/intelligence/rules').send(validRule);
      const res = await request(app)
        .post('/api/intelligence/rules/evaluate')
        .send({ metrics: {}, upstream: 'svc', path: '/api', evaluatedAtMs: Date.now() })
        .expect(200);
      expect(res.body.triggered).toBe(false);
    });
  });

  // ── POST /rules/reload ───────────────────────────────────────────────────────

  describe('POST /api/intelligence/rules/reload', () => {
    it('returns 409 when no rulesFilePath is configured', async () => {
      const res = await request(app)
        .post('/api/intelligence/rules/reload')
        .expect(409);
      expect(res.body.error).toMatch(/not configured/i);
    });
  });

  // ── RuleSet version bumping ──────────────────────────────────────────────────

  describe('RuleSet version tracking', () => {
    it('bumps version on each mutation', async () => {
      const v0 = (await request(app).get('/api/intelligence/rules/ruleset')).body.version;
      await request(app).post('/api/intelligence/rules').send(validRule);
      const v1 = (await request(app).get('/api/intelligence/rules/ruleset')).body.version;
      await request(app).put('/api/intelligence/rules/rps-spike').send({ enabled: false });
      const v2 = (await request(app).get('/api/intelligence/rules/ruleset')).body.version;
      await request(app).delete('/api/intelligence/rules/rps-spike');
      const v3 = (await request(app).get('/api/intelligence/rules/ruleset')).body.version;

      expect(v1).toBe(v0 + 1);
      expect(v2).toBe(v1 + 1);
      expect(v3).toBe(v2 + 1);
    });
  });
});
