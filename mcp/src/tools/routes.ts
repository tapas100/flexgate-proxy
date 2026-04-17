import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FlexgateClient } from '../client.js';

export function registerRouteTools(server: McpServer, client: FlexgateClient): void {
  server.tool(
    'list_routes',
    'List all proxy routes configured in Flexgate.',
    {},
    async () => {
      const routes = await client.listRoutes();
      if (routes.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No routes configured.' }] };
      }
      const lines = routes.map((r) => {
        const status = r.enabled ? '✓' : '✗';
        const methods = r.methods?.join(', ') ?? 'ALL';
        return `${status} [${r.id}] ${r.name} — ${methods} ${r.path} → ${r.upstream}`;
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: ['## Proxy Routes', '', ...lines].join('\n'),
          },
        ],
      };
    },
  );

  server.tool(
    'get_route',
    'Get detailed information about a single proxy route by its numeric ID.',
    {
      id: z.number().int().describe('Route ID'),
    },
    async ({ id }) => {
      const routes = await client.listRoutes();
      const route = routes.find((r) => r.id === id);
      if (!route) {
        return { content: [{ type: 'text' as const, text: `Route ${id} not found.` }] };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `## Route: ${route.name} (id=${route.id})`,
              '',
              `- **Path**     : ${route.path}`,
              `- **Upstream** : ${route.upstream}`,
              `- **Methods**  : ${route.methods?.join(', ') ?? 'ALL'}`,
              `- **Strip path**: ${route.strip_path}`,
              `- **Enabled**  : ${route.enabled}`,
              `- **Created**  : ${route.created_at}`,
              `- **Updated**  : ${route.updated_at}`,
            ].join('\n'),
          },
        ],
      };
    },
  );
}
