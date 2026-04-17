/**
 * FlexgateMCPServer
 *
 * Wires together the MCP SDK server, all tool registrations,
 * all resource registrations, and the STDIO transport.
 *
 * Usage:
 *   const server = new FlexgateMCPServer(config);
 *   await server.start();
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { MCPConfig } from './config.js';
import { FlexgateClient } from './client.js';
import { registerLogTools } from './tools/logs.js';
import { registerRouteTools } from './tools/routes.js';
import { registerIncidentTools } from './tools/incidents.js';
import { registerSettingsTools } from './tools/settings.js';
import { registerHealthTools } from './tools/health.js';
import { registerResources } from './resources.js';

export class FlexgateMCPServer {
  private readonly server: McpServer;
  private readonly client: FlexgateClient;

  constructor(private readonly config: MCPConfig) {
    this.client = new FlexgateClient(config);

    this.server = new McpServer({
      name: 'flexgate',
      version: '0.1.0',
    });

    this.registerAll();
  }

  private registerAll(): void {
    registerHealthTools(this.server, this.client);
    registerLogTools(this.server, this.client);
    registerRouteTools(this.server, this.client);
    registerIncidentTools(this.server, this.client);
    registerSettingsTools(this.server, this.client);
    registerResources(this.server, this.client);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Log to stderr so it doesn't interfere with MCP STDIO protocol
    process.stderr.write(
      `[flexgate-mcp] Connected to ${this.config.apiUrl} via STDIO\n`,
    );
  }
}
