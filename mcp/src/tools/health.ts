import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FlexgateClient } from '../client.js';

export function registerHealthTools(server: McpServer, client: FlexgateClient): void {
  server.tool(
    'health_check',
    'Check the health status of the Flexgate proxy, including component-level checks.',
    {},
    async () => {
      const h = await client.getHealth();
      const checks = h.checks
        ? Object.entries(h.checks)
            .map(([name, c]) => `  - ${name}: ${c.status}${c.latency_ms != null ? ` (${c.latency_ms}ms)` : ''}`)
            .join('\n')
        : '  (no component checks reported)';
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `## Health: ${h.status?.toUpperCase() ?? 'UNKNOWN'}`,
              '',
              h.version ? `Version: ${h.version}` : '',
              h.uptime_seconds != null ? `Uptime : ${(h.uptime_seconds / 3600).toFixed(2)}h` : '',
              '',
              '### Component checks',
              checks,
            ]
              .filter((l) => l !== '')
              .join('\n'),
          },
        ],
      };
    },
  );
}
