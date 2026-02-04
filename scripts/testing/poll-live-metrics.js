/**
 * FlexGate live-metrics poller
 *
 * What it does:
 * - Optionally generates traffic via demo proxy routes (/httpbin/*, /external/api/*)
 * - Polls JSON metrics from /api/metrics/live
 * - Optionally connects to SSE stream /api/stream/metrics and prints events
 *
 * Usage examples:
 *   node scripts/testing/poll-live-metrics.js
 *   BASE_URL=http://localhost:3000 INTERVAL_MS=2000 node scripts/testing/poll-live-metrics.js
 *   GENERATE_TRAFFIC=true TRAFFIC_EVERY_MS=1000 node scripts/testing/poll-live-metrics.js
 *   SSE=true node scripts/testing/poll-live-metrics.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 3000);
const GENERATE_TRAFFIC = /^true$/i.test(process.env.GENERATE_TRAFFIC || 'true');
const TRAFFIC_EVERY_MS = Number(process.env.TRAFFIC_EVERY_MS || 1500);
const SSE = /^true$/i.test(process.env.SSE || 'false');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      accept: 'application/json',
      'user-agent': 'flexgate-metrics-poller',
    },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, json };
}

async function hit(path) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'user-agent': 'metrics-traffic-generator' },
    });
    // drain body
    await res.arrayBuffer().catch(() => undefined);
    return res.status;
  } catch (e) {
    return `ERR:${e?.message || e}`;
  }
}

function pickMetricSummary(payload) {
  // expected shape: { success:true, data: { summary: {...}, ... } }
  const summary = payload?.data?.summary;
  if (!summary) return null;
  // Prefer monotonic all-time counter when available.
  // The original `totalRequests` is a sliding 24h window and may go up and down.
  const normalized = { ...summary };
  if (typeof summary.totalRequestsAllTime === 'number') {
    normalized.totalRequests = summary.totalRequestsAllTime;
  }
  return normalized;
}

async function startSse() {
  const url = `${BASE_URL}/api/stream/metrics`;
  console.log(`[SSE] connecting: ${url}`);

  const res = await fetch(url, {
    headers: {
      accept: 'text/event-stream',
      'cache-control': 'no-cache',
      'user-agent': 'flexgate-metrics-poller',
    },
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    console.log(`[SSE] failed: ${res.status} ${body.slice(0, 200)}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const dataLines = chunk
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.replace(/^data:\s?/, '').trim());

      if (!dataLines.length) continue;

      const data = dataLines.join('\n');
      try {
        const parsed = JSON.parse(data);
        console.log(`[SSE] event: ${parsed?.type || 'message'}`);
      } catch {
        console.log(`[SSE] data: ${data.slice(0, 200)}`);
      }
    }
  }

  console.log('[SSE] disconnected');
}

async function main() {
  console.log(`[poller] BASE_URL=${BASE_URL}`);
  console.log(`[poller] Poll interval: ${INTERVAL_MS}ms`);
  console.log(`[poller] Generate traffic: ${GENERATE_TRAFFIC} (every ${TRAFFIC_EVERY_MS}ms)`);
  console.log(`[poller] SSE: ${SSE}`);

  // quick connectivity check
  const health = await fetchJson('/health');
  console.log(`[poller] /health -> ${health.status}`);

  if (SSE) {
    // don't await; keep polling running too
    startSse().catch((e) => console.log(`[SSE] error: ${e?.message || e}`));
  }

  let lastTotal;
  let trafficTicker = 0;

  while (true) {
    if (GENERATE_TRAFFIC) {
      trafficTicker += INTERVAL_MS;
      // generate 1-2 requests per polling cycle depending on configured rates
      const hits = Math.max(1, Math.round(INTERVAL_MS / Math.max(250, TRAFFIC_EVERY_MS)));
      for (let i = 0; i < hits; i++) {
        // seeded demo routes
        // - /httpbin/* -> https://httpbin.org
        // - /external/api/* -> https://jsonplaceholder.typicode.com
        // Mix them to get varying response sizes.
        // eslint-disable-next-line no-await-in-loop
        const status = await hit(i % 2 === 0 ? '/httpbin/get' : '/external/api/posts/1');
        process.stdout.write(`[traffic] ${status} `);
        // eslint-disable-next-line no-await-in-loop
        await sleep(Math.min(TRAFFIC_EVERY_MS, 300));
      }
      process.stdout.write('\n');
    }

    const { status, json } = await fetchJson('/api/metrics/live');
    const summary = pickMetricSummary(json);

    if (status !== 200) {
      console.log(`[metrics] status=${status}`, json);
    } else if (!summary) {
      console.log('[metrics] missing summary in response:', Object.keys(json || {}));
    } else {
      const delta = typeof lastTotal === 'number' ? summary.totalRequests - lastTotal : 0;
      lastTotal = summary.totalRequests;
      console.log(`[metrics] total=${summary.totalRequests} (Δ${delta}) avg=${summary.avgLatency} p95=${summary.p95Latency} errRate=${summary.errorRate} avail=${summary.availability}`);
    }

    await sleep(INTERVAL_MS);
  }
}

main().catch((e) => {
  console.error('[poller] fatal:', e);
  process.exit(1);
});
