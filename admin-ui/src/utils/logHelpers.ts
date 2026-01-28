import { format } from 'date-fns';
import { LogLevel, LogSource, DetailedLogEntry } from '../types';

/**
 * Get color for log level
 */
export function getLogLevelColor(level: LogLevel): string {
  const colors: Record<LogLevel, string> = {
    DEBUG: '#9E9E9E',     // Gray
    INFO: '#2196F3',      // Blue
    WARN: '#FF9800',      // Orange
    ERROR: '#F44336',     // Red
    FATAL: '#9C27B0',     // Purple
  };
  return colors[level];
}

/**
 * Get background color for log level (lighter version)
 */
export function getLogLevelBgColor(level: LogLevel): string {
  const colors: Record<LogLevel, string> = {
    DEBUG: '#F5F5F5',
    INFO: '#E3F2FD',
    WARN: '#FFF3E0',
    ERROR: '#FFEBEE',
    FATAL: '#F3E5F5',
  };
  return colors[level];
}

/**
 * Get icon for log level
 */
export function getLogLevelIcon(level: LogLevel): string {
  const icons: Record<LogLevel, string> = {
    DEBUG: '🐛',
    INFO: 'ℹ️',
    WARN: '⚠️',
    ERROR: '❌',
    FATAL: '💀',
  };
  return icons[level];
}

/**
 * Get color for log source
 */
export function getLogSourceColor(source: LogSource): string {
  const colors: Record<LogSource, string> = {
    proxy: '#4CAF50',     // Green
    auth: '#2196F3',      // Blue
    metrics: '#FF9800',   // Orange
    admin: '#9C27B0',     // Purple
    system: '#607D8B',    // Gray
  };
  return colors[source];
}

/**
 * Format timestamp
 */
export function formatLogTimestamp(timestamp: number, formatStr: string = 'HH:mm:ss.SSS'): string {
  return format(timestamp, formatStr);
}

/**
 * Format relative time (e.g., "2 seconds ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/**
 * Format log message with highlighting
 */
export function highlightSearchTerm(message: string, searchTerm: string, isRegex: boolean): string {
  if (!searchTerm) return message;

  try {
    if (isRegex) {
      const regex = new RegExp(`(${searchTerm})`, 'gi');
      return message.replace(regex, '<mark>$1</mark>');
    } else {
      const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedTerm})`, 'gi');
      return message.replace(regex, '<mark>$1</mark>');
    }
  } catch (e) {
    // Invalid regex
    return message;
  }
}

/**
 * Truncate log message
 */
export function truncateMessage(message: string, maxLength: number = 100): string {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength) + '...';
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format latency with appropriate unit
 */
export function formatLatency(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Get HTTP status code color
 */
export function getStatusCodeColor(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '#4CAF50'; // Green
  if (statusCode >= 300 && statusCode < 400) return '#2196F3'; // Blue
  if (statusCode >= 400 && statusCode < 500) return '#FF9800'; // Orange
  if (statusCode >= 500) return '#F44336'; // Red
  return '#9E9E9E'; // Gray
}

/**
 * Parse log message for structured data
 */
export function parseLogMessage(message: string): { text: string; structured: Record<string, any> } {
  // Try to extract JSON from message
  const jsonMatch = message.match(/\{.*\}/);
  if (jsonMatch) {
    try {
      const structured = JSON.parse(jsonMatch[0]);
      const text = message.replace(jsonMatch[0], '').trim();
      return { text, structured };
    } catch (e) {
      // Not valid JSON
    }
  }

  return { text: message, structured: {} };
}

/**
 * Filter logs by search query
 */
export function filterLogsBySearch(
  logs: DetailedLogEntry[],
  searchQuery: string,
  isRegex: boolean
): DetailedLogEntry[] {
  if (!searchQuery) return logs;

  try {
    if (isRegex) {
      const regex = new RegExp(searchQuery, 'i');
      return logs.filter(log =>
        regex.test(log.message) ||
        regex.test(JSON.stringify(log.metadata || {})) ||
        (log.error && regex.test(log.error.stack || ''))
      );
    } else {
      const lowerQuery = searchQuery.toLowerCase();
      return logs.filter(log =>
        log.message.toLowerCase().includes(lowerQuery) ||
        JSON.stringify(log.metadata || {}).toLowerCase().includes(lowerQuery) ||
        (log.error && (log.error.stack || '').toLowerCase().includes(lowerQuery))
      );
    }
  } catch (e) {
    // Invalid regex, return all logs
    return logs;
  }
}

/**
 * Export logs to JSON
 */
export function exportToJSON(logs: DetailedLogEntry[]): string {
  return JSON.stringify(logs, null, 2);
}

/**
 * Export logs to CSV
 */
export function exportToCSV(logs: DetailedLogEntry[]): string {
  const headers = ['ID', 'Timestamp', 'Level', 'Source', 'Message', 'Request', 'Response', 'Error'];
  const rows = logs.map(log => [
    log.id,
    new Date(log.timestamp).toISOString(),
    log.level,
    log.source,
    `"${log.message.replace(/"/g, '""')}"`,
    log.request ? `"${JSON.stringify(log.request).replace(/"/g, '""')}"` : '',
    log.response ? `"${JSON.stringify(log.response).replace(/"/g, '""')}"` : '',
    log.error ? `"${JSON.stringify(log.error).replace(/"/g, '""')}"` : '',
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

/**
 * Download file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copy to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}

/**
 * Calculate time range bounds
 */
export function getTimeRangeBounds(range: string): { start: number; end: number } {
  const end = Date.now();
  let start: number;

  switch (range) {
    case '5m':
      start = end - 5 * 60 * 1000;
      break;
    case '15m':
      start = end - 15 * 60 * 1000;
      break;
    case '1h':
      start = end - 60 * 60 * 1000;
      break;
    case '6h':
      start = end - 6 * 60 * 60 * 1000;
      break;
    case '24h':
      start = end - 24 * 60 * 60 * 1000;
      break;
    case '7d':
      start = end - 7 * 24 * 60 * 60 * 1000;
      break;
    default:
      start = end - 60 * 60 * 1000; // Default to 1 hour
  }

  return { start, end };
}
