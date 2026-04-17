/**
 * MCP Resources — URI-addressed snapshots of Flexgate state.
 *
 * Resources are read by AI agents via flexgate:// URIs.
 * Each resource returns a text/plain or application/json blob.
 *
 * Registered URIs:
 *   flexgate://logs/recent        — last 100 log lines
 *   flexgate://config/current     — proxy settings as JSON
 *   flexgate://incidents/open     — all open/investigating incidents
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FlexgateClient } from './client.js';

export function registerResources(server: McpServer, client: FlexgateClient): void {
  // ── flexgate://logs/recent ─────────────────────────────────────────────────
  server.resource(
    'recent-logs',
    new ResourceTemplate('flexgate://logs/recent', { list: undefined }),
    async (_uri) => {
      const data = await client.getLogs({ limit: 100 });
      const text = data.logs
        .map((l) => {
          const ts = l.timestamp ?? '';
          const lvl = (l.level ?? 'info').toUpperCase().padEnd(5);
          const msg = l.message ?? `${l.method ?? ''} ${l.path ?? ''}`.trim();
          return `[${ts}] ${lvl} ${msg}`;
        })
        .join('\n');
      return {
        contents: [
          {
            uri: 'flexgate://logs/recent',
            mimeType: 'text/plain',
            text: `# Recent Proxy Logs (${data.logs.length} entries)\n\n${text}`,
          },
        ],
      };
    },
  );

  // ── flexgate://config/current ──────────────────────────────────────────────
  server.resource(
    'current-config',
    new ResourceTemplate('flexgate://config/current', { list: undefined }),
    async (_uri) => {
      const settings = await client.getSettings();
      return {
        contents: [
          {
            uri: 'flexgate://config/current',
            mimeType: 'application/json',
            text: JSON.stringify(settings, null, 2),
          },
        ],
      };
    },
  );

  // ── flexgate://incidents/open ──────────────────────────────────────────────
  server.resource(
    'open-incidents',
    new ResourceTemplate('flexgate://incidents/open', { list: undefined }),
    async (_uri) => {
      const data = await client.listIncidents({ status: 'open', limit: 50 });
      const investigating = await client.listIncidents({ status: 'investigating', limit: 50 });
      const all = [...(data.incidents ?? []), ...(investigating.incidents ?? [])];
      return {
        contents: [
          {
            uri: 'flexgate://incidents/open',
            mimeType: 'application/json',
            text: JSON.stringify({ incidents: all, total: all.length }, null, 2),
          },
        ],
      };
    },
  );
}
