/**
 * Unit Tests: CircuitBreaker
 * Covers state machine transitions, failure rate thresholds,
 * half-open recovery, timeout-to-half-open, and rejection behaviour.
 */

// Mock heavy deps before importing the module under test
jest.mock('../logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../metrics', () => ({
  metrics: {
    circuitBreakerRejectedTotal: { inc: jest.fn() },
    circuitBreakerSuccessesTotal: { inc: jest.fn() },
    circuitBreakerFailuresTotal: { inc: jest.fn() },
    circuitBreakerTransitionsTotal: { inc: jest.fn() },
    circuitBreakerFailureRate: { set: jest.fn() },
    circuitBreakerState: { set: jest.fn() },
  },
}));
jest.mock('../events/EventBus', () => ({
  eventBus: { emitEvent: jest.fn() },
  EventType: {
    CIRCUIT_BREAKER_OPENED: 'circuit_breaker.opened',
    CIRCUIT_BREAKER_CLOSED: 'circuit_breaker.closed',
    CIRCUIT_BREAKER_HALF_OPEN: 'circuit_breaker.half_open',
  },
}));

import CircuitBreaker from '../circuitBreaker';

const success = () => Promise.resolve('ok');
const fail = () => Promise.reject(new Error('upstream error'));

describe('CircuitBreaker', () => {
  describe('initial state', () => {
    it('starts CLOSED', () => {
      const cb = new CircuitBreaker('test');
      expect(cb.state).toBe('CLOSED');
    });

    it('executes requests when CLOSED', async () => {
      const cb = new CircuitBreaker('test');
      await expect(cb.execute(success)).resolves.toBe('ok');
    });
  });

  describe('CLOSED → OPEN transition', () => {
    it('opens when failure rate exceeds threshold', async () => {
      const cb = new CircuitBreaker('test', {
        failureThreshold: 50,
        volumeThreshold: 4,
        windowMs: 10000,
      });

      // 4 failures: 100% failure rate → should open
      for (let i = 0; i < 4; i++) {
        await cb.execute(fail).catch(() => {});
      }

      expect(cb.state).toBe('OPEN');
    });

    it('stays CLOSED below volume threshold', async () => {
      const cb = new CircuitBreaker('test', {
        failureThreshold: 50,
        volumeThreshold: 10, // need 10 requests first
        windowMs: 10000,
      });

      for (let i = 0; i < 5; i++) {
        await cb.execute(fail).catch(() => {});
      }

      expect(cb.state).toBe('CLOSED');
    });

    it('stays CLOSED when failure rate is below threshold', async () => {
      const cb = new CircuitBreaker('test', {
        failureThreshold: 75,
        volumeThreshold: 4,
        windowMs: 10000,
      });

      // 2 success + 2 failure = 50% — below 75% threshold
      await cb.execute(success);
      await cb.execute(success);
      await cb.execute(fail).catch(() => {});
      await cb.execute(fail).catch(() => {});

      expect(cb.state).toBe('CLOSED');
    });
  });

  describe('OPEN state', () => {
    it('rejects all requests immediately when OPEN', async () => {
      const cb = new CircuitBreaker('test', {
        failureThreshold: 50,
        volumeThreshold: 4,
        windowMs: 10000,
        openDuration: 60000,
      });

      for (let i = 0; i < 4; i++) {
        await cb.execute(fail).catch(() => {});
      }

      expect(cb.state).toBe('OPEN');

      await expect(cb.execute(success)).rejects.toMatchObject({
        circuitBreakerOpen: true,
      });
    });

    it('transitions to HALF_OPEN after openDuration', async () => {
      const cb = new CircuitBreaker('test', {
        failureThreshold: 50,
        volumeThreshold: 4,
        windowMs: 10000,
        openDuration: 1, // 1ms — expires immediately
      });

      for (let i = 0; i < 4; i++) {
        await cb.execute(fail).catch(() => {});
      }

      expect(cb.state).toBe('OPEN');

      // Wait for openDuration to pass
      await new Promise(r => setTimeout(r, 10));

      // Next execute call should trigger HALF_OPEN transition
      await cb.execute(success).catch(() => {});
      expect(cb.state).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state', () => {
    async function openThenHalfOpen(): Promise<CircuitBreaker> {
      const cb = new CircuitBreaker('test', {
        failureThreshold: 50,
        volumeThreshold: 4,
        windowMs: 10000,
        openDuration: 1,
        halfOpenRequests: 3,
      });
      for (let i = 0; i < 4; i++) await cb.execute(fail).catch(() => {});
      await new Promise(r => setTimeout(r, 10));
      await cb.execute(success).catch(() => {}); // triggers HALF_OPEN
      return cb;
    }

    it('closes after enough successes in HALF_OPEN', async () => {
      const cb = await openThenHalfOpen();
      expect(cb.state).toBe('HALF_OPEN');

      // 2 more successes = 3 total → closes
      await cb.execute(success);
      await cb.execute(success);

      expect(cb.state).toBe('CLOSED');
    });

    it('re-opens immediately on failure in HALF_OPEN', async () => {
      const cb = await openThenHalfOpen();
      expect(cb.state).toBe('HALF_OPEN');

      await cb.execute(fail).catch(() => {});
      expect(cb.state).toBe('OPEN');
    });

    it('rejects requests beyond halfOpenRequests limit', async () => {
      const cb = await openThenHalfOpen();
      // Already used 1 of 3 half-open slots

      await cb.execute(success).catch(() => {}); // slot 2
      await cb.execute(success).catch(() => {}); // slot 3

      // Should be CLOSED now, but if we force HALF_OPEN...
      // Test the rejection path directly by resetting state
      cb.state = 'HALF_OPEN' as any;
      (cb as any).halfOpenAttempts = 3;

      await expect(cb.execute(success)).rejects.toMatchObject({
        circuitBreakerOpen: true,
      });
    });
  });

  describe('getState()', () => {
    it('returns correct stats', async () => {
      // Use volumeThreshold: 3 so 1 fail out of 2 calls doesn't yet hit threshold
      const cb = new CircuitBreaker('test', { volumeThreshold: 3 });
      await cb.execute(success);
      await cb.execute(fail).catch(() => {});

      const stats = cb.getState();
      expect(stats.state).toBe('CLOSED');
      expect(stats.successes).toBe(1);
      expect(stats.failures).toBe(1);
    });
  });

  describe('getFailureRate()', () => {
    it('returns 0 with no requests', () => {
      const cb = new CircuitBreaker('test');
      expect(cb.getFailureRate()).toBe(0);
    });

    it('calculates correct failure rate', async () => {
      const cb = new CircuitBreaker('test', { volumeThreshold: 100 });
      await cb.execute(success);
      await cb.execute(fail).catch(() => {});

      expect(cb.getFailureRate()).toBe(50);
    });
  });

  describe('reset()', () => {
    it('resets to CLOSED with empty state', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 50, volumeThreshold: 4 });
      for (let i = 0; i < 4; i++) await cb.execute(fail).catch(() => {});
      expect(cb.state).toBe('OPEN');

      cb.reset();

      expect(cb.state).toBe('CLOSED');
      expect(cb.getFailureRate()).toBe(0);
      expect(cb.getState().failures).toBe(0);
    });
  });
});
