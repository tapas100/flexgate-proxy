import { EventEmitter } from 'events';
import { logger } from '../logger';

/**
 * Event type definitions for FlexGate webhook system
 */
export enum EventType {
  // Circuit Breaker Events
  CIRCUIT_BREAKER_OPENED = 'circuit_breaker.opened',
  CIRCUIT_BREAKER_CLOSED = 'circuit_breaker.closed',
  CIRCUIT_BREAKER_HALF_OPEN = 'circuit_breaker.half_open',

  // Rate Limit Events
  RATE_LIMIT_EXCEEDED = 'rate_limit.exceeded',
  RATE_LIMIT_WARNING = 'rate_limit.warning',

  // Proxy Events
  PROXY_ERROR = 'proxy.error',
  PROXY_TIMEOUT = 'proxy.timeout',

  // Health Events
  HEALTH_DEGRADED = 'health.degraded',
  HEALTH_RECOVERED = 'health.recovered',

  // Configuration Events
  CONFIG_CHANGED = 'config.changed',
}

/**
 * Base event payload interface
 */
export interface BaseEventPayload {
  timestamp: string;
  source: string;
}

/**
 * Circuit Breaker event payloads
 */
export interface CircuitBreakerEventPayload extends BaseEventPayload {
  routeId: string;
  routePath: string;
  target: string;
  errorRate: number;
  threshold: number;
  failureCount: number;
  windowSize: number;
  state?: 'open' | 'closed' | 'half_open';
}

/**
 * Rate Limit event payloads
 */
export interface RateLimitEventPayload extends BaseEventPayload {
  routeId?: string;
  routePath?: string;
  clientId: string;
  limit: number;
  current: number;
  windowSeconds: number;
  percentUsed: number;
}

/**
 * Proxy Error event payloads
 */
export interface ProxyErrorEventPayload extends BaseEventPayload {
  routeId: string;
  routePath: string;
  target: string;
  method: string;
  statusCode?: number;
  error: string;
  duration?: number;
}

/**
 * Health event payloads
 */
export interface HealthEventPayload extends BaseEventPayload {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics?: {
    uptime: number;
    errorRate: number;
    avgResponseTime: number;
  };
}

/**
 * Configuration event payloads
 */
export interface ConfigEventPayload extends BaseEventPayload {
  changeType: 'route_added' | 'route_updated' | 'route_deleted' | 'settings_updated';
  entityId?: string;
  changes: Record<string, any>;
}

/**
 * Union type for all event payloads
 */
export type EventPayload =
  | CircuitBreakerEventPayload
  | RateLimitEventPayload
  | ProxyErrorEventPayload
  | HealthEventPayload
  | ConfigEventPayload;

/**
 * Event metadata for delivery tracking
 */
export interface EventMetadata {
  id: string;
  event: EventType;
  payload: EventPayload;
  timestamp: string;
}

/**
 * Central event bus for FlexGate webhook system
 * 
 * This class provides a centralized event emitter that all components
 * can use to publish events. Webhook managers subscribe to these events
 * and trigger webhook deliveries.
 */
export class EventBus extends EventEmitter {
  private static instance: EventBus;
  private eventHistory: EventMetadata[] = [];
  private readonly maxHistorySize = 1000;

  private constructor() {
    super();
    this.setMaxListeners(100); // Support many webhook subscriptions
  }

  /**
   * Get singleton instance of EventBus
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Emit a webhook event
   * @param event Event type
   * @param payload Event data
   * @returns Unique event ID
   */
  public emitEvent(event: EventType, payload: EventPayload): string {
    const eventId = this.generateEventId();
    const timestamp = new Date().toISOString();

    const metadata: EventMetadata = {
      id: eventId,
      event,
      payload: {
        ...payload,
        timestamp: payload.timestamp || timestamp,
      },
      timestamp,
    };

    // Store in history
    this.addToHistory(metadata);

    // Emit event
    this.emit(event, metadata);
    this.emit('*', metadata); // Wildcard for all events

    logger.debug('Event emitted', {
      eventId,
      event,
      payloadKeys: Object.keys(payload),
    });

    return eventId;
  }

  /**
   * Subscribe to specific event type
   * @param event Event type to subscribe to
   * @param handler Event handler function
   */
  public subscribe(event: EventType | '*', handler: (metadata: EventMetadata) => void): void {
    this.on(event, handler);
    logger.debug('Event subscription added', { event });
  }

  /**
   * Unsubscribe from event
   * @param event Event type
   * @param handler Event handler to remove
   */
  public unsubscribe(event: EventType | '*', handler: (metadata: EventMetadata) => void): void {
    this.off(event, handler);
    logger.debug('Event subscription removed', { event });
  }

  /**
   * Get recent event history
   * @param limit Maximum number of events to return
   * @param eventType Optional filter by event type
   * @returns Array of recent events
   */
  public getHistory(limit = 100, eventType?: EventType): EventMetadata[] {
    let history = this.eventHistory;

    if (eventType) {
      history = history.filter(e => e.event === eventType);
    }

    return history.slice(-limit);
  }

  /**
   * Clear event history
   */
  public clearHistory(): void {
    this.eventHistory = [];
    logger.debug('Event history cleared');
  }

  /**
   * Get statistics about events
   */
  public getStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    recentEvents: number;
  } {
    const eventsByType: Record<string, number> = {};

    this.eventHistory.forEach(event => {
      eventsByType[event.event] = (eventsByType[event.event] || 0) + 1;
    });

    // Events in last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentEvents = this.eventHistory.filter(
      e => new Date(e.timestamp).getTime() > fiveMinutesAgo
    ).length;

    return {
      totalEvents: this.eventHistory.length,
      eventsByType,
      recentEvents,
    };
  }

  /**
   * Add event to history with size limit
   */
  private addToHistory(metadata: EventMetadata): void {
    this.eventHistory.push(metadata);

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `evt_${timestamp}_${random}`;
  }
}

/**
 * Export singleton instance
 */
export const eventBus = EventBus.getInstance();
