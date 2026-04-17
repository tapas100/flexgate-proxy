import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FlexgateClient } from '../client.js';

export function registerLogTools(server: McpServer, client: FlexgateClient): void {
  server.tool(
    'get_logs',
    'Retrieve recent proxy request logs. Supports filtering by log level and free-text search.',
    {
      limit: z.number().int().min(1).max(1000).optional().describe('Number of log entries to return (default 100)'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
      level: z.enum(['debug', 'info', 'warn', 'error']).optional().describe('Filter by log level'),
      search: z.string().optional().describe('Full-text search string'),
    },
    async ({ limit = 100, offset = 0, level, search }) => {
      const data = await client.getLogs({ limit, offset, level, search });
      const lines = data.logs.map((l) => {
        const ts = l.timestamp ?? '';
        const lvl = (l.level ?? 'info').toUpperCase().padEnd(5);
        const method = l.method ? `${l.method} ` : '';
        const path = l.path ?? l.message ?? '';
        const status = l.status ? ` → ${l.status}` : '';
        const ms = l.latency_ms != null ? ` (${l.latency_ms}ms)` : '';
        return `[${ts}] ${lvl} ${method}${path}${status}${ms}`;
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `## Logs (${data.logs.length} / ${data.total} total)`,
              '',
              ...lines,
            ].join('\n'),
          },
        ],
      };
    },
  );

  server.tool(
    'get_log_stats',
    'Get aggregate proxy traffic statistics: request rate, error rate, and latency percentiles.',
    {},
    async () => {
      const stats = await client.getLogStats();
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              '## Proxy Traffic Stats',
              '',
              `- Requests/sec   : ${stats.requests_per_second.toFixed(2)}`,
              `- Total requests : ${stats.total_requests}`,
              `- Error rate     : ${(stats.error_rate * 100).toFixed(1)}%`,
              `- p50 latency    : ${stats.p50_ms}ms`,
              `- p95 latency    : ${stats.p95_ms}ms`,
              `- p99 latency    : ${stats.p99_ms}ms`,
            ].join('\n'),
          },
        ],
      };
    },
  );
}
