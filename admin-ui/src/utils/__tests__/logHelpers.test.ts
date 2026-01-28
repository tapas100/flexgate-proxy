// @ts-nocheck
import {
  getLogLevelColor,
  getLogLevelBgColor,
  getLogLevelIcon,
  getLogSourceColor,
  formatLogTimestamp,
  formatRelativeTime,
  highlightSearchTerm,
  truncateMessage,
  formatBytes,
  formatLatency,
  getStatusCodeColor,
  parseLogMessage,
  filterLogsBySearch,
  exportToJSON,
  exportToCSV,
  downloadFile,
  copyToClipboard,
  getTimeRangeBounds,
} from '../logHelpers';
import type { DetailedLogEntry, LogLevel, LogSource } from '../../types';

describe('logHelpers', () => {
  describe('getLogLevelColor', () => {
    it('should return correct colors for all log levels', () => {
      expect(getLogLevelColor('DEBUG')).toBe('default');
      expect(getLogLevelColor('INFO')).toBe('info');
      expect(getLogLevelColor('WARN')).toBe('warning');
      expect(getLogLevelColor('ERROR')).toBe('error');
      expect(getLogLevelColor('FATAL')).toBe('error');
    });
  });

  describe('getLogLevelBgColor', () => {
    it('should return background colors for all log levels', () => {
      expect(getLogLevelBgColor('DEBUG')).toBeTruthy();
      expect(getLogLevelBgColor('INFO')).toBeTruthy();
      expect(getLogLevelBgColor('WARN')).toBeTruthy();
      expect(getLogLevelBgColor('ERROR')).toBeTruthy();
      expect(getLogLevelBgColor('FATAL')).toBeTruthy();
    });
  });

  describe('getLogLevelIcon', () => {
    it('should return icons for all log levels', () => {
      expect(getLogLevelIcon('DEBUG')).toBe('🐛');
      expect(getLogLevelIcon('INFO')).toBe('ℹ️');
      expect(getLogLevelIcon('WARN')).toBe('⚠️');
      expect(getLogLevelIcon('ERROR')).toBe('❌');
      expect(getLogLevelIcon('FATAL')).toBe('💀');
    });
  });

  describe('getLogSourceColor', () => {
    it('should return colors for all sources', () => {
      expect(getLogSourceColor('proxy')).toBe('primary');
      expect(getLogSourceColor('auth')).toBe('secondary');
      expect(getLogSourceColor('metrics')).toBe('success');
      expect(getLogSourceColor('admin')).toBe('warning');
      expect(getLogSourceColor('system')).toBe('info');
    });
  });

  describe('formatLogTimestamp', () => {
    it('should format timestamp with default format', () => {
      const timestamp = new Date('2026-01-28T12:00:00Z').getTime();
      const formatted = formatLogTimestamp(timestamp);
      expect(formatted).toContain('2026');
      expect(formatted).toContain('12:00');
    });

    it('should format timestamp with custom format', () => {
      const timestamp = new Date('2026-01-28T12:00:00Z').getTime();
      const formatted = formatLogTimestamp(timestamp, 'yyyy-MM-dd');
      expect(formatted).toBe('2026-01-28');
    });

    it('should handle milliseconds format', () => {
      const timestamp = Date.now();
      const formatted = formatLogTimestamp(timestamp, 'HH:mm:ss.SSS');
      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
    });
  });

  describe('formatRelativeTime', () => {
    it('should format time as seconds ago', () => {
      const timestamp = Date.now() - 5000; // 5 seconds ago
      const formatted = formatRelativeTime(timestamp);
      expect(formatted).toContain('second');
    });

    it('should format time as minutes ago', () => {
      const timestamp = Date.now() - 120000; // 2 minutes ago
      const formatted = formatRelativeTime(timestamp);
      expect(formatted).toContain('minute');
    });

    it('should format time as hours ago', () => {
      const timestamp = Date.now() - 7200000; // 2 hours ago
      const formatted = formatRelativeTime(timestamp);
      expect(formatted).toContain('hour');
    });
  });

  describe('highlightSearchTerm', () => {
    it('should highlight search term in message', () => {
      const message = 'This is an error message';
      const result = highlightSearchTerm(message, 'error', false);
      expect(result).toContain('<mark>');
      expect(result).toContain('error');
      expect(result).toContain('</mark>');
    });

    it('should handle case-insensitive search', () => {
      const message = 'This is an ERROR message';
      const result = highlightSearchTerm(message, 'error', false);
      expect(result).toContain('<mark>ERROR</mark>');
    });

    it('should highlight regex matches', () => {
      const message = 'Error occurred in request';
      const result = highlightSearchTerm(message, 'error|request', true);
      expect(result).toContain('<mark>Error</mark>');
      expect(result).toContain('<mark>request</mark>');
    });

    it('should return original message when no match', () => {
      const message = 'This is a test';
      const result = highlightSearchTerm(message, 'error', false);
      expect(result).toBe(message);
    });
  });

  describe('truncateMessage', () => {
    it('should not truncate short messages', () => {
      const message = 'Short message';
      const result = truncateMessage(message, 50);
      expect(result).toBe(message);
    });

    it('should truncate long messages', () => {
      const message = 'A'.repeat(200);
      const result = truncateMessage(message, 50);
      expect(result.length).toBeLessThanOrEqual(53); // 50 + '...'
      expect(result).toContain('...');
    });

    it('should truncate at exact length', () => {
      const message = 'A'.repeat(100);
      const result = truncateMessage(message, 50);
      expect(result).toBe('A'.repeat(50) + '...');
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    });

    it('should handle decimals', () => {
      expect(formatBytes(1536)).toBe('1.50 KB'); // 1.5 KB
      expect(formatBytes(2560)).toBe('2.50 KB'); // 2.5 KB
    });
  });

  describe('formatLatency', () => {
    it('should format latency in microseconds', () => {
      expect(formatLatency(0.5)).toBe('500 μs');
      expect(formatLatency(0.999)).toBe('999 μs');
    });

    it('should format latency in milliseconds', () => {
      expect(formatLatency(1)).toBe('1.00 ms');
      expect(formatLatency(50.5)).toBe('50.50 ms');
      expect(formatLatency(999)).toBe('999.00 ms');
    });

    it('should format latency in seconds', () => {
      expect(formatLatency(1000)).toBe('1.00 s');
      expect(formatLatency(5000)).toBe('5.00 s');
    });
  });

  describe('getStatusCodeColor', () => {
    it('should return success color for 2xx codes', () => {
      expect(getStatusCodeColor(200)).toBe('success');
      expect(getStatusCodeColor(201)).toBe('success');
      expect(getStatusCodeColor(204)).toBe('success');
    });

    it('should return info color for 3xx codes', () => {
      expect(getStatusCodeColor(301)).toBe('info');
      expect(getStatusCodeColor(302)).toBe('info');
      expect(getStatusCodeColor(304)).toBe('info');
    });

    it('should return warning color for 4xx codes', () => {
      expect(getStatusCodeColor(400)).toBe('warning');
      expect(getStatusCodeColor(404)).toBe('warning');
      expect(getStatusCodeColor(401)).toBe('warning');
    });

    it('should return error color for 5xx codes', () => {
      expect(getStatusCodeColor(500)).toBe('error');
      expect(getStatusCodeColor(502)).toBe('error');
      expect(getStatusCodeColor(503)).toBe('error');
    });

    it('should return default for unknown codes', () => {
      expect(getStatusCodeColor(100)).toBe('default');
      expect(getStatusCodeColor(600)).toBe('default');
    });
  });

  describe('parseLogMessage', () => {
    it('should extract JSON from message', () => {
      const message = 'Error: {"code": 500, "message": "Internal error"}';
      const result = parseLogMessage(message);
      expect(result).toEqual({
        original: message,
        json: { code: 500, message: 'Internal error' },
      });
    });

    it('should return original message when no JSON', () => {
      const message = 'Simple error message';
      const result = parseLogMessage(message);
      expect(result).toEqual({
        original: message,
        json: null,
      });
    });
  });

  describe('filterLogsBySearch', () => {
    const mockLogs: DetailedLogEntry[] = [
      {
        id: '1',
        timestamp: Date.now(),
        level: 'ERROR' as LogLevel,
        source: 'proxy' as LogSource,
        message: 'Connection error occurred',
      },
      {
        id: '2',
        timestamp: Date.now(),
        level: 'INFO' as LogLevel,
        source: 'auth' as LogSource,
        message: 'User authenticated successfully',
      },
      {
        id: '3',
        timestamp: Date.now(),
        level: 'WARN' as LogLevel,
        source: 'system' as LogSource,
        message: 'High memory usage detected',
      },
    ];

    it('should filter logs by plain text search', () => {
      const result = filterLogsBySearch(mockLogs, 'error', false);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    it('should filter logs by regex search', () => {
      const result = filterLogsBySearch(mockLogs, 'error|memory', true);
      expect(result.length).toBe(2);
      expect(result.map((log) => log.id)).toEqual(['1', '3']);
    });

    it('should be case-insensitive', () => {
      const result = filterLogsBySearch(mockLogs, 'ERROR', false);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    it('should return all logs with empty query', () => {
      const result = filterLogsBySearch(mockLogs, '', false);
      expect(result.length).toBe(mockLogs.length);
    });
  });

  describe('exportToJSON', () => {
    it('should export logs as JSON string', () => {
      const mockLogs: DetailedLogEntry[] = [
        {
          id: '1',
          timestamp: Date.now(),
          level: 'INFO' as LogLevel,
          source: 'proxy' as LogSource,
          message: 'Test message',
        },
      ];

      const result = exportToJSON(mockLogs);
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe('1');
    });

    it('should format JSON with indentation', () => {
      const mockLogs: DetailedLogEntry[] = [
        {
          id: '1',
          timestamp: Date.now(),
          level: 'INFO' as LogLevel,
          source: 'proxy' as LogSource,
          message: 'Test',
        },
      ];

      const result = exportToJSON(mockLogs);
      expect(result).toContain('\n');
      expect(result).toContain('  '); // Indentation
    });
  });

  describe('exportToCSV', () => {
    it('should export logs as CSV string', () => {
      const mockLogs: DetailedLogEntry[] = [
        {
          id: '1',
          timestamp: 1234567890000,
          level: 'INFO' as LogLevel,
          source: 'proxy' as LogSource,
          message: 'Test message',
        },
      ];

      const result = exportToCSV(mockLogs);
      expect(typeof result).toBe('string');
      expect(result).toContain('Timestamp,Level,Source,Message');
      expect(result).toContain('INFO');
      expect(result).toContain('proxy');
      expect(result).toContain('Test message');
    });

    it('should escape commas in message', () => {
      const mockLogs: DetailedLogEntry[] = [
        {
          id: '1',
          timestamp: Date.now(),
          level: 'INFO' as LogLevel,
          source: 'proxy' as LogSource,
          message: 'Test, with, commas',
        },
      ];

      const result = exportToCSV(mockLogs);
      expect(result).toContain('"Test, with, commas"');
    });

    it('should escape quotes in message', () => {
      const mockLogs: DetailedLogEntry[] = [
        {
          id: '1',
          timestamp: Date.now(),
          level: 'INFO' as LogLevel,
          source: 'proxy' as LogSource,
          message: 'Test "quoted" message',
        },
      ];

      const result = exportToCSV(mockLogs);
      expect(result).toContain('""quoted""');
    });
  });

  describe('getTimeRangeBounds', () => {
    it('should calculate bounds for 1h range', () => {
      const bounds = getTimeRangeBounds('1h');
      const now = Date.now();
      const hourAgo = now - 60 * 60 * 1000;

      expect(bounds.start).toBeGreaterThanOrEqual(hourAgo - 1000);
      expect(bounds.start).toBeLessThanOrEqual(hourAgo + 1000);
      expect(bounds.end).toBeGreaterThanOrEqual(now - 1000);
      expect(bounds.end).toBeLessThanOrEqual(now + 1000);
    });

    it('should calculate bounds for 24h range', () => {
      const bounds = getTimeRangeBounds('24h');
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;

      expect(bounds.start).toBeGreaterThanOrEqual(dayAgo - 1000);
      expect(bounds.start).toBeLessThanOrEqual(dayAgo + 1000);
      expect(bounds.end).toBeGreaterThanOrEqual(now - 1000);
      expect(bounds.end).toBeLessThanOrEqual(now + 1000);
    });

    it('should calculate bounds for 7d range', () => {
      const bounds = getTimeRangeBounds('7d');
      const now = Date.now();
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

      expect(bounds.start).toBeGreaterThanOrEqual(weekAgo - 1000);
      expect(bounds.start).toBeLessThanOrEqual(weekAgo + 1000);
      expect(bounds.end).toBeGreaterThanOrEqual(now - 1000);
      expect(bounds.end).toBeLessThanOrEqual(now + 1000);
    });
  });

  describe('copyToClipboard', () => {
    it('should copy text to clipboard', async () => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockResolvedValue(undefined),
        },
      });

      const text = 'Test text to copy';
      await copyToClipboard(text);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(text);
    });
  });

  describe('downloadFile', () => {
    it('should create download link', () => {
      // Mock DOM elements
      const mockLink = {
        href: '',
        download: '',
        click: jest.fn(),
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      jest.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      jest.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);
      jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      downloadFile('test content', 'test.txt', 'text/plain');

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toBe('test.txt');
    });
  });
});
