// @ts-nocheck
import { logService } from '../logs';
import type { LogFilter, LogLevel, LogSource, DetailedLogEntry } from '../../types';

describe('LogService', () => {
  beforeEach(() => {
    // Reset service state before each test
    logService.disconnectWebSocket();
  });

  afterEach(() => {
    logService.disconnectWebSocket();
  });

  describe('fetchLogs', () => {
    it('should fetch logs with default parameters', async () => {
      const result = await logService.fetchLogs();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.logs).toBeInstanceOf(Array);
        expect(result.data.logs.length).toBeLessThanOrEqual(100);
        expect(result.data.total).toBeGreaterThan(0);
      }
    });

    it('should respect limit and offset parameters', async () => {
      const limit = 10;
      const offset = 5;
      const result = await logService.fetchLogs(limit, offset);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.logs.length).toBeLessThanOrEqual(limit);
      }
    });

    it('should filter logs by level', async () => {
      const filter: Partial<LogFilter> = {
        levels: ['ERROR', 'FATAL'],
      };

      const result = await logService.fetchLogs(100, 0, filter);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        result.data.logs.forEach((log: DetailedLogEntry) => {
          expect(['ERROR', 'FATAL']).toContain(log.level);
        });
      }
    });

    it('should filter logs by source', async () => {
      const filter: Partial<LogFilter> = {
        sources: ['proxy', 'auth'],
      };

      const result = await logService.fetchLogs(100, 0, filter);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        result.data.logs.forEach((log: DetailedLogEntry) => {
          expect(['proxy', 'auth']).toContain(log.source);
        });
      }
    });

    it('should filter logs by time range', async () => {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      const filter: Partial<LogFilter> = {
        timeRange: { start: fiveMinutesAgo, end: now },
      };

      const result = await logService.fetchLogs(1000, 0, filter);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        result.data.logs.forEach((log: DetailedLogEntry) => {
          expect(log.timestamp).toBeGreaterThanOrEqual(fiveMinutesAgo);
          expect(log.timestamp).toBeLessThanOrEqual(now);
        });
      }
    });

    it('should filter logs by search query', async () => {
      const filter: Partial<LogFilter> = {
        searchQuery: 'error',
        isRegex: false,
      };

      const result = await logService.fetchLogs(1000, 0, filter);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        result.data.logs.forEach((log: DetailedLogEntry) => {
          expect(log.message.toLowerCase()).toContain('error');
        });
      }
    });

    it('should filter logs by regex search query', async () => {
      const filter: Partial<LogFilter> = {
        searchQuery: 'error|failed|timeout',
        isRegex: true,
      };

      const result = await logService.fetchLogs(1000, 0, filter);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        result.data.logs.forEach((log: DetailedLogEntry) => {
          const message = log.message.toLowerCase();
          expect(
            message.includes('error') ||
              message.includes('failed') ||
              message.includes('timeout')
          ).toBe(true);
        });
      }
    });

    it('should return pagination correctly', async () => {
      const allLogs = await logService.fetchLogs(1000);
      const firstPage = await logService.fetchLogs(10, 0);
      const secondPage = await logService.fetchLogs(10, 10);

      expect(allLogs.success).toBe(true);
      expect(firstPage.success).toBe(true);
      expect(secondPage.success).toBe(true);

      if (allLogs.success && allLogs.data && firstPage.success && firstPage.data && secondPage.success && secondPage.data) {
        expect(allLogs.data.total).toBeGreaterThan(0);
        expect(firstPage.data.logs.length).toBeLessThanOrEqual(10);
        expect(secondPage.data.logs.length).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('fetchLogById', () => {
    it('should fetch a single log by ID', async () => {
      const allLogs = await logService.fetchLogs(10);
      const firstLog = allLogs.logs[0];

      const result = await logService.fetchLogById(firstLog.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(firstLog.id);
      expect(result?.timestamp).toBe(firstLog.timestamp);
      expect(result?.level).toBe(firstLog.level);
      expect(result?.source).toBe(firstLog.source);
    });

    it('should return null for non-existent log ID', async () => {
      const result = await logService.fetchLogById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('fetchLogStats', () => {
    it('should calculate correct statistics', async () => {
      const stats = await logService.fetchLogStats();

      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byLevel).toBeDefined();
      expect(stats.bySource).toBeDefined();
      expect(stats.errorRate).toBeGreaterThanOrEqual(0);
      expect(stats.errorRate).toBeLessThanOrEqual(100);
      expect(stats.avgLatency).toBeGreaterThanOrEqual(0);
    });

    it('should calculate stats with filters applied', async () => {
      const filter: LogFilter = {
        levels: ['ERROR'],
        sources: [],
        timeRange: null,
        searchQuery: '',
        isRegex: false,
      };

      const stats = await logService.fetchLogStats(filter);

      expect(stats.byLevel.ERROR).toBe(stats.total);
      expect(stats.errorRate).toBe(100);
    });

    it('should have correct sum of logs by level', async () => {
      const stats = await logService.fetchLogStats();

      const sumByLevel =
        stats.byLevel.DEBUG +
        stats.byLevel.INFO +
        stats.byLevel.WARN +
        stats.byLevel.ERROR +
        stats.byLevel.FATAL;

      expect(sumByLevel).toBe(stats.total);
    });

    it('should have correct sum of logs by source', async () => {
      const stats = await logService.fetchLogStats();

      const sumBySource =
        stats.bySource.proxy +
        stats.bySource.auth +
        stats.bySource.metrics +
        stats.bySource.admin +
        stats.bySource.system;

      expect(sumBySource).toBe(stats.total);
    });
  });

  describe('exportLogs', () => {
    it('should export logs in JSON format', async () => {
      const url = await logService.exportLogs('json');

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });

    it('should export logs in CSV format', async () => {
      const url = await logService.exportLogs('csv');

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });

    it('should export filtered logs', async () => {
      const filter: LogFilter = {
        levels: ['ERROR'],
        sources: [],
        timeRange: null,
        searchQuery: '',
        isRegex: false,
      };

      const url = await logService.exportLogs('json', filter);

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });

    it('should respect export limit', async () => {
      const url = await logService.exportLogs('json', undefined, 10);

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });
  });

  describe('WebSocket', () => {
    it('should connect and receive log callbacks', (done) => {
      const mockCallback = jest.fn((log) => {
        expect(log).toBeDefined();
        expect(log.id).toBeDefined();
        expect(log.timestamp).toBeDefined();
        expect(log.level).toBeDefined();
        logService.disconnectWebSocket();
        done();
      });

      logService.connectWebSocket(mockCallback);
    });

    it('should disconnect WebSocket', () => {
      const mockCallback = jest.fn();

      logService.connectWebSocket(mockCallback);
      logService.disconnectWebSocket();

      // Wait a bit to ensure no more callbacks
      setTimeout(() => {
        const callCount = mockCallback.mock.calls.length;
        setTimeout(() => {
          expect(mockCallback.mock.calls.length).toBe(callCount);
        }, 100);
      }, 100);
    });

    it('should handle multiple connect/disconnect cycles', () => {
      const mockCallback = jest.fn();

      logService.connectWebSocket(mockCallback);
      logService.disconnectWebSocket();
      logService.connectWebSocket(mockCallback);
      logService.disconnectWebSocket();

      expect(true).toBe(true); // Should not throw
    });
  });

  describe('applyFilters', () => {
    it('should apply level filter correctly', () => {
      const logs = [
        { id: '1', level: 'DEBUG' as LogLevel, source: 'proxy' as LogSource, timestamp: Date.now(), message: 'test' },
        { id: '2', level: 'ERROR' as LogLevel, source: 'proxy' as LogSource, timestamp: Date.now(), message: 'test' },
        { id: '3', level: 'INFO' as LogLevel, source: 'proxy' as LogSource, timestamp: Date.now(), message: 'test' },
      ];

      const filter: LogFilter = {
        levels: ['ERROR'],
        sources: [],
        timeRange: null,
        searchQuery: '',
        isRegex: false,
      };

      const filtered = (logService as any).applyFilters(logs, filter);

      expect(filtered.length).toBe(1);
      expect(filtered[0].level).toBe('ERROR');
    });

    it('should apply source filter correctly', () => {
      const logs = [
        { id: '1', level: 'INFO' as LogLevel, source: 'proxy' as LogSource, timestamp: Date.now(), message: 'test' },
        { id: '2', level: 'INFO' as LogLevel, source: 'auth' as LogSource, timestamp: Date.now(), message: 'test' },
        { id: '3', level: 'INFO' as LogLevel, source: 'metrics' as LogSource, timestamp: Date.now(), message: 'test' },
      ];

      const filter: LogFilter = {
        levels: [],
        sources: ['auth', 'metrics'],
        timeRange: null,
        searchQuery: '',
        isRegex: false,
      };

      const filtered = (logService as any).applyFilters(logs, filter);

      expect(filtered.length).toBe(2);
      expect(filtered.every((log: any) => ['auth', 'metrics'].includes(log.source))).toBe(true);
    });

    it('should apply multiple filters together', () => {
      const now = Date.now();
      const logs = [
        { id: '1', level: 'ERROR' as LogLevel, source: 'proxy' as LogSource, timestamp: now - 1000, message: 'error occurred' },
        { id: '2', level: 'ERROR' as LogLevel, source: 'auth' as LogSource, timestamp: now - 1000, message: 'error occurred' },
        { id: '3', level: 'INFO' as LogLevel, source: 'proxy' as LogSource, timestamp: now - 1000, message: 'info message' },
        { id: '4', level: 'ERROR' as LogLevel, source: 'proxy' as LogSource, timestamp: now - 10000, message: 'old error' },
      ];

      const filter: LogFilter = {
        levels: ['ERROR'],
        sources: ['proxy'],
        timeRange: { start: now - 5000, end: now },
        searchQuery: 'error occurred',
        isRegex: false,
      };

      const filtered = (logService as any).applyFilters(logs, filter);

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('1');
    });
  });
});
