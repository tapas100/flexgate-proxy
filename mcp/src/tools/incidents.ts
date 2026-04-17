import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FlexgateClient } from '../client.js';

const severityEmoji = (s: string) =>
  s === 'critical' ? '🔴' : s === 'warning' ? '🟡' : '🟢';

export function registerIncidentTools(server: McpServer, client: FlexgateClient): void {
  server.tool(
    'list_incidents',
    'List AI-detected proxy incidents. Filter by status, severity, or event type.',
    {
      status: z.enum(['open', 'investigating', 'resolved', 'closed']).optional(),
      severity: z.enum(['critical', 'warning', 'info']).optional(),
      event_type: z.string().optional().describe('e.g. high_error_rate, latency_spike'),
      limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
    },
    async ({ status, severity, event_type, limit = 50 }) => {
      const data = await client.listIncidents({ status, severity, event_type, limit });
      if (!data.incidents?.length) {
        return { content: [{ type: 'text' as const, text: 'No incidents found.' }] };
      }
      const lines = data.incidents.map((i) => {
        const emoji = severityEmoji(i.severity);
        return `${emoji} [${i.incident_id}] ${i.event_type} — ${i.status} — ${i.summary}`;
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: [`## Incidents (${data.incidents.length} / ${data.total})`, '', ...lines].join('\n'),
          },
        ],
      };
    },
  );

  server.tool(
    'get_incident',
    'Get full details of a specific incident including AI recommendations and outcomes.',
    {
      id: z.string().describe('Incident UUID'),
    },
    async ({ id }) => {
      const detail = await client.getIncident(id);
      const i = detail.incident;
      if (!i) {
        return { content: [{ type: 'text' as const, text: `Incident ${id} not found.` }] };
      }
      const recs = (detail.recommendations ?? []) as Array<{ action: string; confidence: number; reasoning: string; decision?: string }>;
      const recLines = recs.length
        ? recs.map((r, idx) => `  ${idx + 1}. [${(r.confidence * 100).toFixed(0)}%] ${r.action} — ${r.decision ?? 'pending'}`)
        : ['  (none)'];
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `## ${severityEmoji(i.severity)} Incident ${i.incident_id}`,
              '',
              `- **Type**     : ${i.event_type}`,
              `- **Severity** : ${i.severity}`,
              `- **Status**   : ${i.status}`,
              `- **Detected** : ${i.detected_at}`,
              i.resolved_at ? `- **Resolved** : ${i.resolved_at}` : '',
              '',
              `### Summary`,
              i.summary,
              '',
              `### Recommendations`,
              ...recLines,
            ]
              .filter((l) => l !== '')
              .join('\n'),
          },
        ],
      };
    },
  );

  server.tool(
    'analyze_incident',
    'Trigger AI analysis on an incident. Returns structured findings and remediation steps.',
    {
      id: z.string().describe('Incident UUID to analyze'),
    },
    async ({ id }) => {
      const result = await client.analyzeIncident(id);
      const meta = result.metadata ?? {};
      const metaLine = [
        meta.model ? `Model: ${meta.model}` : '',
        meta.cost_usd != null ? `Cost: $${Number(meta.cost_usd).toFixed(4)}` : '',
        meta.response_time_ms != null ? `Time: ${meta.response_time_ms}ms` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      return {
        content: [
          {
            type: 'text' as const,
            text: [`## AI Analysis — Incident ${id}`, metaLine ? `\n_${metaLine}_` : '', '', result.analysis].join('\n'),
          },
        ],
      };
    },
  );

  server.tool(
    'get_incident_analytics',
    'Get aggregate statistics about incidents over the last N days.',
    {
      days: z.number().int().min(1).max(365).optional().describe('Look-back window in days (default 30)'),
    },
    async ({ days = 30 }) => {
      const s = await client.getAnalyticsSummary(days);
      const inc = s.incidents;
      const rec = s.recommendations;
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `## Incident Analytics (last ${days} days)`,
              '',
              '### Incidents',
              `- Total      : ${inc.total_incidents}`,
              `- Open       : ${inc.open_count}`,
              `- Resolved   : ${inc.resolved_count}`,
              `- False pos. : ${inc.false_positive_count}`,
              `- Resolution : ${(inc.resolution_rate * 100).toFixed(1)}%`,
              `- Avg time   : ${(inc.avg_resolution_time_seconds / 60).toFixed(1)} min`,
              `- Avg rating : ${inc.avg_user_rating.toFixed(1)}/5`,
              '',
              '### Recommendations',
              `- Total      : ${rec.total_recommendations}`,
              `- Accepted   : ${rec.accepted_count}`,
              `- Acceptance : ${(rec.acceptance_rate * 100).toFixed(1)}%`,
            ].join('\n'),
          },
        ],
      };
    },
  );
}
