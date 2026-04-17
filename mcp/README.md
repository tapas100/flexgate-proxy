# Flexgate MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that exposes Flexgate proxy data to AI agents such as Claude or Cursor Copilot.

## What it does

The MCP server wraps the Flexgate Admin API (port 9090) and exposes the following **tools** and **resources** to any MCP-capable AI client:

### Tools

| Tool | Description |
|---|---|
| `health_check` | Live health status + component checks |
| `get_logs` | Recent proxy logs with level/search filters |
| `get_log_stats` | p50/p95/p99 latency, error rate, req/s |
| `list_routes` | All configured proxy routes |
| `get_route` | Detail for a single route by ID |
| `list_incidents` | AI-detected incidents (filter by severity/status) |
| `get_incident` | Full incident detail + recommendations |
| `analyze_incident` | Trigger on-demand AI root-cause analysis |
| `get_incident_analytics` | Aggregate stats over N days |
| `get_proxy_settings` | CORS, rate limits, log level, etc. |
| `get_ui_settings` | Admin UI feature flags + theme |

### Resources (URI-addressed)

| URI | Description |
|---|---|
| `flexgate://logs/recent` | Last 100 request log lines |
| `flexgate://config/current` | Current proxy config as JSON |
| `flexgate://incidents/open` | All open + investigating incidents |

---

## Quick start

### 1. Build

```bash
cd mcp
npm install
npm run build
```

### 2. Test locally (CLI)

```bash
FLEXGATE_API_URL=http://localhost:9090 node dist/index.js
```

MCP speaks JSON-RPC over STDIO — use an MCP client or inspector to interact.

---

## Claude Desktop integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flexgate": {
      "command": "node",
      "args": ["/absolute/path/to/flexgate-proxy/mcp/dist/index.js"],
      "env": {
        "FLEXGATE_API_URL": "http://localhost:9090"
      }
    }
  }
}
```

Then restart Claude Desktop. The tools will be available in every conversation.

---

## Cursor / VS Code Copilot

Add to `.cursor/mcp.json` or VS Code user settings:

```json
{
  "mcpServers": {
    "flexgate": {
      "command": "node",
      "args": ["./mcp/dist/index.js"],
      "env": {
        "FLEXGATE_API_URL": "http://localhost:9090"
      }
    }
  }
}
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `FLEXGATE_API_URL` | `http://localhost:9090` | Base URL of the Flexgate admin API |
| `FLEXGATE_API_KEY` | — | `X-Api-Key` header value |
| `FLEXGATE_API_CREDENTIALS` | — | Basic auth, format `user:pass` |
| `FLEXGATE_TIMEOUT_MS` | `8000` | Per-request timeout in milliseconds |
| `FLEXGATE_MAX_LOG_LINES` | `200` | Default log lines returned |

---

## Development

```bash
# Type-check without building
npx tsc --noEmit

# Build
npm run build

# Run from source (no build step)
npx tsx src/index.ts
```
