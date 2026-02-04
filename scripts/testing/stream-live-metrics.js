/**
 * FlexGate live metrics stream subscriber (SSE)
 *
 * Connects to /api/stream/metrics and prints each received event.
 * Useful for verifying end-to-end JetStream -> SSE -> client flow.
 *
 * Env Vars:
 *   BASE_URL=http://localhost:3000
 *   PRETTY=true              # pretty-print JSON payloads
 *   PRINT_DATA=true          # print full event data JSON (default true)
 *
 * Usage:
 *   node scripts/testing/stream-live-metrics.js
 *   PRETTY=true node scripts/testing/stream-live-metrics.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PRETTY = /^true$/i.test(process.env.PRETTY || 'false');
const PRINT_DATA = !/^false$/i.test(process.env.PRINT_DATA || 'true');

function format(obj) {
  return PRETTY ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
}

async function main() {
  const url = `${BASE_URL}/api/stream/metrics`;
  console.log(`[sse] connecting: ${url}`);

  const res = await fetch(url, {
    headers: {
      accept: 'text/event-stream',
      'cache-control': 'no-cache',
      'user-agent': 'flexgate-metrics-sse-subscriber',
    },
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw new Error(`SSE connect failed: ${res.status} ${body.slice(0, 200)}`);
  }

  console.log(`[sse] connected: ${res.status} content-type=${res.headers.get('content-type')}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  // SSE frames are separated by blank line
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      // parse data lines
      const dataLines = frame
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.replace(/^data:\s?/, '').trim());

      if (!dataLines.length) continue;

      const dataStr = dataLines.join('\n');
      try {
        const event = JSON.parse(dataStr);
        const type = event?.type || 'message';
        const ts = new Date().toISOString();
        process.stdout.write(`[sse] ${ts} type=${type}`);

        if (PRINT_DATA) {
          process.stdout.write(` data=${format(event)}`);
        }
        process.stdout.write('\n');
      } catch {
        console.log(`[sse] data=${dataStr.slice(0, 500)}`);
      }
    }
  }

  console.log('[sse] disconnected');
}

main().catch((e) => {
  console.error('[sse] fatal:', e?.message || e);
  process.exit(1);
});
