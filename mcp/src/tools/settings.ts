import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FlexgateClient } from '../client.js';

export function registerSettingsTools(server: McpServer, client: FlexgateClient): void {
  server.tool(
    'get_proxy_settings',
    'Get current Flexgate proxy configuration (CORS, rate limits, log level, etc.).',
    {},
    async () => {
      const s = await client.getSettings();
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              '## Proxy Settings',
              '',
              `- Log level         : ${s.log_level}`,
              `- Log format        : ${s.log_format}`,
              `- CORS enabled      : ${s.cors_enabled}`,
              `- CORS origins      : ${s.cors_allow_origins?.join(', ') || '(none)'}`,
              `- Max request size  : ${s.max_request_size_bytes} bytes`,
              `- Rate limit        : ${s.rate_limit_rps} req/s`,
              `- Updated           : ${s.updated_at}`,
            ].join('\n'),
          },
        ],
      };
    },
  );

  server.tool(
    'get_ui_settings',
    'Get Flexgate admin UI settings (theme, feature flags, etc.).',
    {},
    async () => {
      const s = await client.getUISettings();
      return {
        content: [
          {
            type: 'text' as const,
            text: ['## UI Settings', '', '```json', JSON.stringify(s, null, 2), '```'].join('\n'),
          },
        ],
      };
    },
  );
}
