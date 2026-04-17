/**
 * Configuration — loaded from environment variables with sane defaults.
 *
 * All settings are optional; the server works out-of-the-box against a
 * local Flexgate instance started with `pm2 start flexgate-proxy`.
 */

export interface MCPConfig {
  /** Base URL of the Flexgate admin API (port 9090 by default). */
  apiUrl: string;

  /** Optional HTTP Basic auth credentials for authenticated endpoints.
   *  Format: "username:password"  */
  apiCredentials: string | null;

  /** Optional static bearer/API key added as X-Api-Key header. */
  apiKey: string | null;

  /** Request timeout in milliseconds. */
  timeoutMs: number;

  /** Maximum number of log lines returned per request. */
  maxLogLines: number;

  /** Human-readable name shown in the MCP server metadata. */
  serverName: string;

  /** Semantic version of this MCP server. */
  serverVersion: string;
}

export function loadConfig(): MCPConfig {
  return {
    apiUrl: process.env['FLEXGATE_API_URL'] ?? 'http://localhost:9090',
    apiCredentials: process.env['FLEXGATE_API_CREDENTIALS'] ?? null, // "user:pass"
    apiKey: process.env['FLEXGATE_API_KEY'] ?? null,
    timeoutMs: parseInt(process.env['FLEXGATE_TIMEOUT_MS'] ?? '8000', 10),
    maxLogLines: parseInt(process.env['FLEXGATE_MAX_LOG_LINES'] ?? '200', 10),
    serverName: 'flexgate-mcp',
    serverVersion: '0.1.0',
  };
}
