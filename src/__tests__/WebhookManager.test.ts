/**
 * Unit Tests: WebhookManager
 * Covers registration, lookup, update, unregistration,
 * HMAC signature generation/verification, and event subscription.
 */

jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('axios');
jest.mock('../events', () => ({
  eventBus: { subscribe: jest.fn(), unsubscribe: jest.fn(), emitEvent: jest.fn() },
  EventType: {
    CIRCUIT_BREAKER_OPENED: 'circuit_breaker.opened',
    RATE_LIMIT_EXCEEDED: 'rate_limit.exceeded',
  },
}));

import { WebhookManager, WebhookConfig } from '../webhooks/WebhookManager';

function makeConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    id: 'wh-test-1',
    url: 'https://example.com/webhook',
    events: [] as any[],
    enabled: true,
    secret: 'super-secret',
    retryConfig: { maxRetries: 3, backoffMultiplier: 2, initialDelay: 100 },
    headers: {},
    timeout: 5000,
    ...overrides,
  };
}

describe('WebhookManager', () => {
  let manager: WebhookManager;

  beforeEach(() => {
    manager = new WebhookManager();
  });

  // ── Registration ──────────────────────────────────────────

  describe('registerWebhook()', () => {
    it('registers a new webhook', () => {
      manager.registerWebhook(makeConfig());
      expect(manager.getWebhook('wh-test-1')).toBeDefined();
    });

    it('overwrites silently when webhook ID already exists', () => {
      manager.registerWebhook(makeConfig({ url: 'https://first.io/hook' }));
      manager.registerWebhook(makeConfig({ url: 'https://second.io/hook' }));
      // Second registration wins
      expect(manager.getWebhook('wh-test-1')?.url).toBe('https://second.io/hook');
    });

    it('stores all provided config fields', () => {
      const cfg = makeConfig({ url: 'https://other.io/hook' });
      manager.registerWebhook(cfg);
      const stored = manager.getWebhook('wh-test-1');
      expect(stored?.url).toBe('https://other.io/hook');
    });
  });

  describe('getWebhook()', () => {
    it('returns undefined for unknown ID', () => {
      expect(manager.getWebhook('no-such-id')).toBeUndefined();
    });
  });

  describe('getAllWebhooks()', () => {
    it('returns empty array when none registered', () => {
      expect(manager.getAllWebhooks()).toEqual([]);
    });

    it('returns all registered webhooks', () => {
      manager.registerWebhook(makeConfig({ id: 'wh-1' }));
      manager.registerWebhook(makeConfig({ id: 'wh-2' }));
      expect(manager.getAllWebhooks()).toHaveLength(2);
    });
  });

  // ── Update ────────────────────────────────────────────────

  describe('updateWebhook()', () => {
    it('updates specified fields', () => {
      manager.registerWebhook(makeConfig());
      manager.updateWebhook('wh-test-1', { url: 'https://new.io/hook' });
      expect(manager.getWebhook('wh-test-1')?.url).toBe('https://new.io/hook');
    });

    it('throws if webhook does not exist', () => {
      expect(() => manager.updateWebhook('ghost', { url: 'https://x.io' })).toThrow();
    });

    it('preserves unchanged fields', () => {
      manager.registerWebhook(makeConfig());
      manager.updateWebhook('wh-test-1', { enabled: false });
      expect(manager.getWebhook('wh-test-1')?.url).toBe('https://example.com/webhook');
      expect(manager.getWebhook('wh-test-1')?.enabled).toBe(false);
    });
  });

  // ── Unregistration ────────────────────────────────────────

  describe('unregisterWebhook()', () => {
    it('removes the webhook', () => {
      manager.registerWebhook(makeConfig());
      manager.unregisterWebhook('wh-test-1');
      expect(manager.getWebhook('wh-test-1')).toBeUndefined();
    });

    it('returns true when removed, false when not found', () => {
      manager.registerWebhook(makeConfig());
      expect(manager.unregisterWebhook('wh-test-1')).toBe(true);
      expect(manager.unregisterWebhook('wh-test-1')).toBe(false);
    });
  });

  // ── HMAC Signature ────────────────────────────────────────

  describe('generateSignature()', () => {
    it('returns a hex string prefixed with sha256=', () => {
      const sig = manager.generateSignature('{"hello":"world"}', 'secret');
      expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('produces the same signature for same inputs', () => {
      const a = manager.generateSignature('payload', 'key');
      const b = manager.generateSignature('payload', 'key');
      expect(a).toBe(b);
    });

    it('produces different signatures for different payloads', () => {
      const a = manager.generateSignature('payload-a', 'key');
      const b = manager.generateSignature('payload-b', 'key');
      expect(a).not.toBe(b);
    });

    it('produces different signatures for different secrets', () => {
      const a = manager.generateSignature('payload', 'secret-a');
      const b = manager.generateSignature('payload', 'secret-b');
      expect(a).not.toBe(b);
    });
  });

  describe('verifySignature()', () => {
    it('returns true for a valid signature', () => {
      const payload = JSON.stringify({ event: 'test' });
      const sig = manager.generateSignature(payload, 'my-secret');
      expect(manager.verifySignature(payload, sig, 'my-secret')).toBe(true);
    });

    it('returns false for a tampered payload', () => {
      const sig = manager.generateSignature('original', 'secret');
      expect(manager.verifySignature('tampered', sig, 'secret')).toBe(false);
    });

    it('returns false for a wrong secret', () => {
      const payload = 'data';
      const sig = manager.generateSignature(payload, 'correct-secret');
      expect(manager.verifySignature(payload, sig, 'wrong-secret')).toBe(false);
    });

    it('returns false for a malformed signature string', () => {
      expect(manager.verifySignature('data', 'not-a-real-sig', 'secret')).toBe(false);
    });
  });
});
