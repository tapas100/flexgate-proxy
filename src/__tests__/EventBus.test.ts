/**
 * Unit Tests: EventBus
 * Covers singleton, emitEvent, subscribe/unsubscribe,
 * wildcard listeners, history management, and getStats.
 */

import { EventBus, EventType, EventMetadata, CircuitBreakerEventPayload } from '../events/EventBus';

// Silence logger output
jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const makePayload = (): CircuitBreakerEventPayload => ({
  timestamp: new Date().toISOString(),
  source: 'test',
  routeId: 'route-1',
  routePath: '/test',
  target: 'http://upstream',
  errorRate: 0.5,
  threshold: 0.5,
  failureCount: 5,
  windowSize: 10,
  state: 'open',
});

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    // Reset singleton between tests
    (EventBus as any).instance = undefined;
    bus = EventBus.getInstance();
  });

  afterEach(() => {
    bus.removeAllListeners();
    bus.clearHistory();
  });

  describe('singleton', () => {
    it('returns the same instance on repeated calls', () => {
      const a = EventBus.getInstance();
      const b = EventBus.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('emitEvent()', () => {
    it('returns a unique event ID starting with evt_', () => {
      const id = bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      expect(id).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });

    it('delivers event to a specific listener', done => {
      bus.subscribe(EventType.CIRCUIT_BREAKER_OPENED, (meta: EventMetadata) => {
        expect(meta.event).toBe(EventType.CIRCUIT_BREAKER_OPENED);
        done();
      });
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
    });

    it('delivers event to wildcard listener', done => {
      bus.subscribe('*', (meta: EventMetadata) => {
        expect(meta.event).toBe(EventType.RATE_LIMIT_EXCEEDED);
        done();
      });
      bus.emitEvent(EventType.RATE_LIMIT_EXCEEDED, {
        timestamp: new Date().toISOString(),
        source: 'test',
        clientId: '127.0.0.1',
        limit: 100,
        current: 100,
        windowSeconds: 60,
        percentUsed: 100,
      });
    });

    it('stores events in history', () => {
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      bus.emitEvent(EventType.CIRCUIT_BREAKER_CLOSED, makePayload());
      expect(bus.getHistory()).toHaveLength(2);
    });

    it('uses provided timestamp from payload', () => {
      const ts = '2024-01-01T00:00:00.000Z';
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, { ...makePayload(), timestamp: ts });
      const history = bus.getHistory();
      expect(history[0].payload.timestamp).toBe(ts);
    });
  });

  describe('subscribe() / unsubscribe()', () => {
    it('unsubscribing stops delivery', () => {
      const handler = jest.fn();
      bus.subscribe(EventType.CIRCUIT_BREAKER_OPENED, handler);
      bus.unsubscribe(EventType.CIRCUIT_BREAKER_OPENED, handler);
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      expect(handler).not.toHaveBeenCalled();
    });

    it('multiple subscribers all receive the event', () => {
      const h1 = jest.fn();
      const h2 = jest.fn();
      bus.subscribe(EventType.CIRCUIT_BREAKER_OPENED, h1);
      bus.subscribe(EventType.CIRCUIT_BREAKER_OPENED, h2);
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHistory()', () => {
    it('filters by event type', () => {
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      bus.emitEvent(EventType.CIRCUIT_BREAKER_CLOSED, makePayload());
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());

      const opened = bus.getHistory(100, EventType.CIRCUIT_BREAKER_OPENED);
      expect(opened).toHaveLength(2);
      opened.forEach(e => expect(e.event).toBe(EventType.CIRCUIT_BREAKER_OPENED));
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      }
      expect(bus.getHistory(3)).toHaveLength(3);
    });
  });

  describe('clearHistory()', () => {
    it('empties the event history', () => {
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      bus.clearHistory();
      expect(bus.getHistory()).toHaveLength(0);
    });
  });

  describe('getStats()', () => {
    it('returns correct totals and eventsByType', () => {
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      bus.emitEvent(EventType.CIRCUIT_BREAKER_CLOSED, makePayload());

      const stats = bus.getStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType[EventType.CIRCUIT_BREAKER_OPENED]).toBe(2);
      expect(stats.eventsByType[EventType.CIRCUIT_BREAKER_CLOSED]).toBe(1);
    });

    it('counts recent events in the last 5 minutes', () => {
      bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      const stats = bus.getStats();
      expect(stats.recentEvents).toBe(1);
    });
  });

  describe('history size cap (1000)', () => {
    it('trims history when it exceeds 1000 events', () => {
      for (let i = 0; i < 1005; i++) {
        bus.emitEvent(EventType.CIRCUIT_BREAKER_OPENED, makePayload());
      }
      expect(bus.getHistory(2000)).toHaveLength(1000);
    });
  });
});
