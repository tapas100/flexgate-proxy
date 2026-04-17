#!/usr/bin/env node
/**
 * Flexgate MCP Server — entry point.
 *
 * Starts a Model Context Protocol server over STDIO so AI agents
 * (Claude Desktop, Cursor, Codex, etc.) can query a running Flexgate
 * instance for logs, configuration, routes, incidents, and analytics.
 *
 * Usage:
 *   node dist/index.js                          # default: http://localhost:9090
 *   FLEXGATE_API_URL=http://myhost:9090 node dist/index.js
 *   FLEXGATE_API_KEY=secret node dist/index.js  # if admin auth is enabled
 */

import { FlexgateMCPServer } from './server.js';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const server = new FlexgateMCPServer(config);
  await server.start();
}

main().catch((err) => {
  console.error('[flexgate-mcp] Fatal error:', err);
  process.exit(1);
});
