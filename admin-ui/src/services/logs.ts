import { DetailedLogEntry, LogFilter, LogStats, LogLevel, LogSource, ApiResponse } from '../types';

class LogService {
  private ws: WebSocket | null = null;
  private listeners: ((log: DetailedLogEntry) => void)[] = [];

  /**
   * Fetch logs with pagination and filtering
   */
  async fetchLogs(
    limit: number = 100,
    offset: number = 0,
    filter?: Partial<LogFilter>
  ): Promise<ApiResponse<{ logs: DetailedLogEntry[]; total: number }>> {
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 300));

      const mockLogs = this.generateMockLogs(1000);
      let filteredLogs = mockLogs;

      // Apply filters
      if (filter) {
        filteredLogs = this.applyFilters(mockLogs, filter);
      }

      // Apply pagination
      const paginatedLogs = filteredLogs.slice(offset, offset + limit);

      return {
        success: true,
        data: {
          logs: paginatedLogs,
          total: filteredLogs.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch logs',
      };
    }
  }

  /**
   * Fetch single log by ID
   */
  async fetchLogById(id: string): Promise<ApiResponse<DetailedLogEntry>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 200));

      const mockLogs = this.generateMockLogs(1000);
      const log = mockLogs.find(l => l.id === id);

      if (!log) {
        return {
          success: false,
          error: 'Log not found',
        };
      }

      return {
        success: true,
        data: log,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch log',
      };
    }
  }

  /**
   * Fetch log statistics
   */
  async fetchLogStats(filter?: Partial<LogFilter>): Promise<ApiResponse<LogStats>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 200));

      const mockLogs = this.generateMockLogs(1000);
      const filteredLogs = filter ? this.applyFilters(mockLogs, filter) : mockLogs;

      const stats: LogStats = {
        total: filteredLogs.length,
        byLevel: {
          DEBUG: filteredLogs.filter(l => l.level === 'DEBUG').length,
          INFO: filteredLogs.filter(l => l.level === 'INFO').length,
          WARN: filteredLogs.filter(l => l.level === 'WARN').length,
          ERROR: filteredLogs.filter(l => l.level === 'ERROR').length,
          FATAL: filteredLogs.filter(l => l.level === 'FATAL').length,
        },
        bySource: {
          proxy: filteredLogs.filter(l => l.source === 'proxy').length,
          auth: filteredLogs.filter(l => l.source === 'auth').length,
          metrics: filteredLogs.filter(l => l.source === 'metrics').length,
          admin: filteredLogs.filter(l => l.source === 'admin').length,
          system: filteredLogs.filter(l => l.source === 'system').length,
        },
        errorRate: (filteredLogs.filter(l => l.level === 'ERROR' || l.level === 'FATAL').length / filteredLogs.length) * 100,
        avgLatency: filteredLogs.reduce((sum, log) => sum + (log.response?.latency || 0), 0) / filteredLogs.length,
      };

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch log stats',
      };
    }
  }

  /**
   * Export logs (returns mock download URL)
   */
  async exportLogs(format: 'json' | 'csv', filter?: Partial<LogFilter>): Promise<ApiResponse<{ downloadUrl: string }>> {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const mockLogs = this.generateMockLogs(1000);
      const filteredLogs = filter ? this.applyFilters(mockLogs, filter) : mockLogs;

      // In real implementation, this would generate a file on the server
      const mockUrl = `/downloads/logs-${Date.now()}.${format}`;

      return {
        success: true,
        data: {
          downloadUrl: mockUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to export logs',
      };
    }
  }

  /**
   * Connect to WebSocket for real-time log streaming
   */
  connectWebSocket(onLog: (log: DetailedLogEntry) => void): void {
    // Mock WebSocket connection
    // In real implementation: this.ws = new WebSocket('ws://localhost:3000/api/logs/stream');
    
    this.listeners.push(onLog);

    // Simulate incoming logs every 2 seconds
    const interval = setInterval(() => {
      const newLog = this.generateSingleLog();
      this.listeners.forEach(listener => listener(newLog));
    }, 2000);

    // Store interval for cleanup
    (this as any).mockInterval = interval;
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clear mock interval
    if ((this as any).mockInterval) {
      clearInterval((this as any).mockInterval);
      delete (this as any).mockInterval;
    }

    this.listeners = [];
  }

  /**
   * Apply filters to logs
   */
  private applyFilters(logs: DetailedLogEntry[], filter: Partial<LogFilter>): DetailedLogEntry[] {
    let filtered = logs;

    // Filter by levels
    if (filter.levels && filter.levels.length > 0) {
      filtered = filtered.filter(log => filter.levels!.includes(log.level));
    }

    // Filter by sources
    if (filter.sources && filter.sources.length > 0) {
      filtered = filtered.filter(log => filter.sources!.includes(log.source));
    }

    // Filter by time range
    if (filter.startTime) {
      filtered = filtered.filter(log => log.timestamp >= filter.startTime!);
    }
    if (filter.endTime) {
      filtered = filtered.filter(log => log.timestamp <= filter.endTime!);
    }

    // Filter by search query
    if (filter.searchQuery) {
      const query = filter.searchQuery;
      if (filter.isRegex) {
        try {
          const regex = new RegExp(query, 'i');
          filtered = filtered.filter(log => 
            regex.test(log.message) ||
            regex.test(JSON.stringify(log.metadata || {}))
          );
        } catch (e) {
          // Invalid regex, fallback to string search
          filtered = filtered.filter(log =>
            log.message.toLowerCase().includes(query.toLowerCase())
          );
        }
      } else {
        const lowerQuery = query.toLowerCase();
        filtered = filtered.filter(log =>
          log.message.toLowerCase().includes(lowerQuery) ||
          JSON.stringify(log.metadata || {}).toLowerCase().includes(lowerQuery)
        );
      }
    }

    return filtered;
  }

  /**
   * Generate mock logs for development
   */
  private generateMockLogs(count: number): DetailedLogEntry[] {
    const logs: DetailedLogEntry[] = [];
    const now = Date.now();

    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    const sources: LogSource[] = ['proxy', 'auth', 'metrics', 'admin', 'system'];
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const paths = ['/api/users', '/api/routes', '/api/metrics', '/api/auth/login', '/api/health'];
    const messages = [
      'Request processed successfully',
      'Authentication token validated',
      'Rate limit threshold approaching',
      'Database query executed',
      'Cache miss for key',
      'Circuit breaker opened',
      'Invalid request payload',
      'Connection timeout',
      'Upstream service unavailable',
      'Memory usage at 85%',
    ];

    for (let i = 0; i < count; i++) {
      const level = levels[Math.floor(Math.random() * levels.length)];
      const source = sources[Math.floor(Math.random() * sources.length)];
      const timestamp = now - (count - i) * 1000; // 1 second apart

      const log: DetailedLogEntry = {
        id: `log-${timestamp}-${i}`,
        timestamp,
        level,
        source,
        message: messages[Math.floor(Math.random() * messages.length)],
        correlationId: `corr-${Math.random().toString(36).substring(7)}`,
        requestId: `req-${Math.random().toString(36).substring(7)}`,
      };

      // Add request/response for proxy logs
      if (source === 'proxy') {
        log.request = {
          method: methods[Math.floor(Math.random() * methods.length)],
          path: paths[Math.floor(Math.random() * paths.length)],
          headers: {
            'user-agent': 'Mozilla/5.0',
            'accept': 'application/json',
          },
        };
        log.response = {
          statusCode: level === 'ERROR' ? 500 : level === 'WARN' ? 400 : 200,
          latency: Math.floor(Math.random() * 500) + 10,
          size: Math.floor(Math.random() * 10000) + 100,
        };
      }

      // Add error details for ERROR/FATAL logs
      if (level === 'ERROR' || level === 'FATAL') {
        log.error = {
          code: `ERR_${Math.random().toString(36).substring(7).toUpperCase()}`,
          stack: `Error: ${log.message}\n    at Function.handler (/app/src/handler.js:42:10)\n    at process.nextTick (node:internal/process/task_queues:142:7)`,
          details: {
            reason: 'Connection refused',
            upstream: 'http://backend-service:3000',
          },
        };
      }

      // Add metadata
      log.metadata = {
        instanceId: 'proxy-01',
        region: 'us-east-1',
        version: '1.0.0',
      };

      logs.push(log);
    }

    return logs;
  }

  /**
   * Generate a single mock log
   */
  private generateSingleLog(): DetailedLogEntry {
    return this.generateMockLogs(1)[0];
  }
}

export const logService = new LogService();
