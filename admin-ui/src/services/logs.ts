import { DetailedLogEntry, LogFilter, LogStats, LogLevel, LogSource, ApiResponse } from '../types';
import { apiService } from './api';

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
      // Build query parameters
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (filter?.levels && filter.levels.length > 0) {
        params.append('level', filter.levels[0]); // Backend supports single level filter
      }

      if (filter?.searchQuery) {
        params.append('search', filter.searchQuery);
      }

      const response = await apiService.get<{ logs: DetailedLogEntry[]; total: number }>(
        `/api/logs?${params.toString()}`
      );

      return response;
    } catch (error) {
      console.error('Failed to fetch logs:', error);
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
      const response = await apiService.get<DetailedLogEntry>(`/api/logs/${id}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch log:', error);
      return {
        success: false,
        error: 'Log not found',
      };
    }
  }

  /**
   * Fetch log statistics
   */
  async fetchLogStats(filter?: Partial<LogFilter>): Promise<ApiResponse<LogStats>> {
    try {
      // Backend /api/logs/stats/summary doesn't support filters yet
      // TODO: Add filter support to backend endpoint
      const response = await apiService.get<LogStats>('/api/logs/stats/summary');
      return response;
    } catch (error) {
      console.error('Failed to fetch log stats:', error);
      return {
        success: false,
        error: 'Failed to fetch log stats',
      };
    }
  }

  /**
   * Export logs (mock implementation for now)
   */
  async exportLogs(format: 'json' | 'csv', filter?: Partial<LogFilter>): Promise<ApiResponse<{ downloadUrl: string }>> {
    try {
      // TODO: Implement real export endpoint on backend
      // For now, return a mock URL
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
   * TODO: Implement WebSocket endpoint on backend
   */
  connectWebSocket(onLog: (log: DetailedLogEntry) => void): void {
    // TODO: Implement real WebSocket connection
    // this.ws = new WebSocket('ws://localhost:3000/api/logs/stream');
    
    this.listeners.push(onLog);

    // Mock: Poll for new logs every 5 seconds
    const interval = setInterval(async () => {
      try {
        const response = await this.fetchLogs(10, 0); // Get latest 10 logs
        if (response.success && response.data?.logs.length) {
          // Emit the most recent log
          this.listeners.forEach(listener => listener(response.data!.logs[0]));
        }
      } catch (error) {
        console.error('Failed to fetch new logs:', error);
      }
    }, 5000);

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
}

export const logService = new LogService();
