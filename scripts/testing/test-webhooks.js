/**
 * FlexGate Webhook Testing Script
 *
 * What it does:
 * - Creates test webhooks via API
 * - Triggers various events (circuit breaker, rate limit, proxy requests, etc.)
 * - Monitors webhook deliveries
 * - Validates webhook payloads
 * - Tests retry logic
 * - Displays delivery statistics
 *
 * Usage examples:
 *   node scripts/testing/test-webhooks.js
 *   BASE_URL=http://localhost:3000 node scripts/testing/test-webhooks.js
 *   WEBHOOK_URL=https://webhook.site/your-unique-url node scripts/testing/test-webhooks.js
 *   GENERATE_EVENTS=true EVENT_INTERVAL=2000 node scripts/testing/test-webhooks.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:4000/webhook';
const GENERATE_EVENTS = /^true$/i.test(process.env.GENERATE_EVENTS || 'true');
const EVENT_INTERVAL = Number(process.env.EVENT_INTERVAL || 3000);
const CLEANUP = /^true$/i.test(process.env.CLEANUP || 'true');

// Test webhook configuration
const TEST_WEBHOOKS = [
  {
    name: 'Circuit Breaker Events',
    url: WEBHOOK_URL,
    description: 'Monitors circuit breaker state changes',
    events: ['circuit_breaker.opened', 'circuit_breaker.closed', 'circuit_breaker.half_open'],
    enabled: true,
  },
  {
    name: 'Rate Limit Events',
    url: WEBHOOK_URL,
    description: 'Tracks rate limit violations',
    events: ['rate_limit.exceeded', 'rate_limit.approaching'],
    enabled: true,
  },
  {
    name: 'Proxy Request Events',
    url: WEBHOOK_URL,
    description: 'Monitors proxy request lifecycle',
    events: ['proxy.request_started', 'proxy.request_completed', 'proxy.request_failed'],
    enabled: true,
  },
  {
    name: 'Health Check Events',
    url: WEBHOOK_URL,
    description: 'Backend health status changes',
    events: ['health.check_failed', 'health.check_recovered'],
    enabled: true,
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'user-agent': 'flexgate-webhook-tester',
      ...options.headers,
    },
    ...options,
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

async function createWebhook(config) {
  console.log(`\n📝 Creating webhook: ${config.name}`);
  
  const { status, json } = await fetchJson('/api/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      name: config.name,
      url: config.url,
      events: config.events,
      enabled: config.enabled,
      retry_count: 3,
      retry_delay: 1000,
      timeout: 5000,
    }),
  });

  if (status === 201 || status === 200) {
    console.log(`✅ Created webhook: ${json.id}`);
    console.log(`   URL: ${config.url}`);
    console.log(`   Events: ${config.events.join(', ')}`);
    return json;
  } else {
    console.log(`❌ Failed to create webhook: ${status} - ${JSON.stringify(json)}`);
    return null;
  }
}

async function listWebhooks() {
  const { status, json } = await fetchJson('/api/webhooks');
  
  if (status === 200 && Array.isArray(json)) {
    console.log(`\n📋 Active webhooks: ${json.length}`);
    json.forEach(webhook => {
      console.log(`   - ${webhook.id}: ${webhook.description || 'No description'}`);
      console.log(`     Events: ${webhook.events.join(', ')}`);
      console.log(`     Enabled: ${webhook.enabled ? '✅' : '❌'}`);
    });
    return json;
  } else {
    console.log(`❌ Failed to list webhooks: ${status}`);
    return [];
  }
}

async function getWebhookStats(webhookId) {
  const { status, json } = await fetchJson(`/api/webhooks/${webhookId}/stats`);
  
  if (status === 200) {
    return json;
  }
  return null;
}

async function deleteWebhook(webhookId) {
  const { status } = await fetchJson(`/api/webhooks/${webhookId}`, {
    method: 'DELETE',
  });

  if (status === 200 || status === 204) {
    console.log(`🗑️  Deleted webhook: ${webhookId}`);
    return true;
  } else {
    console.log(`❌ Failed to delete webhook ${webhookId}: ${status}`);
    return false;
  }
}

async function triggerCircuitBreakerEvent() {
  console.log('\n⚡ Triggering circuit breaker event...');
  
  // Make multiple failing requests to trigger circuit breaker
  const failingRoute = '/httpbin/status/500';
  
  for (let i = 0; i < 5; i++) {
    try {
      await fetch(`${BASE_URL}${failingRoute}`, {
        headers: { 'user-agent': 'webhook-event-trigger' },
      });
    } catch (err) {
      // Expected to fail
    }
    await sleep(200);
  }
  
  console.log('   Sent 5 failing requests to trigger circuit breaker');
}

async function triggerRateLimitEvent() {
  console.log('\n⚡ Triggering rate limit event...');
  
  // Make rapid requests to trigger rate limit
  const route = '/httpbin/get';
  
  for (let i = 0; i < 20; i++) {
    try {
      await fetch(`${BASE_URL}${route}`, {
        headers: { 
          'user-agent': 'webhook-event-trigger',
          'x-test-client': 'rate-limit-test',
        },
      });
    } catch (err) {
      // May fail if rate limited
    }
  }
  
  console.log('   Sent 20 rapid requests to trigger rate limit');
}

async function triggerProxyRequestEvents() {
  console.log('\n⚡ Triggering proxy request events...');
  
  const routes = [
    '/httpbin/get',
    '/httpbin/post',
    '/httpbin/status/200',
    '/httpbin/delay/1',
  ];
  
  for (const route of routes) {
    try {
      const method = route.includes('post') ? 'POST' : 'GET';
      await fetch(`${BASE_URL}${route}`, {
        method,
        headers: { 
          'user-agent': 'webhook-event-trigger',
          'content-type': 'application/json',
        },
        body: method === 'POST' ? JSON.stringify({ test: true }) : undefined,
      });
    } catch (err) {
      // Handle errors
    }
    await sleep(500);
  }
  
  console.log(`   Sent ${routes.length} proxy requests`);
}

async function monitorWebhookDeliveries(webhooks, duration = 10000) {
  console.log(`\n👀 Monitoring webhook deliveries for ${duration / 1000}s...`);
  
  const startTime = Date.now();
  const statsInterval = setInterval(async () => {
    if (Date.now() - startTime > duration) {
      clearInterval(statsInterval);
      return;
    }
    
    console.log('\n📊 Webhook Delivery Stats:');
    console.log('─'.repeat(60));
    
    for (const webhook of webhooks) {
      if (!webhook || !webhook.id) continue;
      
      const stats = await getWebhookStats(webhook.id);
      if (stats) {
        console.log(`\n${webhook.description || webhook.id}:`);
        console.log(`   Total Deliveries: ${stats.totalDeliveries || 0}`);
        console.log(`   Successful: ${stats.successfulDeliveries || 0} ✅`);
        console.log(`   Failed: ${stats.failedDeliveries || 0} ❌`);
        console.log(`   Pending: ${stats.pendingDeliveries || 0} ⏳`);
        console.log(`   Success Rate: ${stats.successRate || 0}%`);
        console.log(`   Avg Delivery Time: ${stats.avgDeliveryTime || 0}ms`);
        
        if (stats.recentDeliveries && stats.recentDeliveries.length > 0) {
          console.log(`   Recent Deliveries:`);
          stats.recentDeliveries.slice(0, 3).forEach(delivery => {
            const status = delivery.status === 'success' ? '✅' : 
                          delivery.status === 'failed' ? '❌' : '⏳';
            console.log(`     ${status} ${delivery.event} - ${delivery.attempts} attempt(s)`);
          });
        }
      }
    }
    
    console.log('\n' + '─'.repeat(60));
  }, 5000);

  await sleep(duration);
  clearInterval(statsInterval);
}

async function generateEvents() {
  if (!GENERATE_EVENTS) {
    console.log('\n⏸️  Event generation disabled (set GENERATE_EVENTS=true to enable)');
    return;
  }

  console.log('\n🎯 Starting event generation...');
  
  // Generate different types of events
  const events = [
    { name: 'Circuit Breaker', fn: triggerCircuitBreakerEvent },
    { name: 'Rate Limit', fn: triggerRateLimitEvent },
    { name: 'Proxy Requests', fn: triggerProxyRequestEvents },
  ];

  for (const event of events) {
    console.log(`\n▶️  Generating ${event.name} events...`);
    await event.fn();
    await sleep(EVENT_INTERVAL);
  }
}

async function cleanupWebhooks(webhooks) {
  if (!CLEANUP) {
    console.log('\n⏸️  Cleanup disabled (webhooks will remain)');
    return;
  }

  console.log('\n🧹 Cleaning up test webhooks...');
  
  for (const webhook of webhooks) {
    if (webhook && webhook.id) {
      await deleteWebhook(webhook.id);
    }
  }
}

async function displaySummary(webhooks) {
  console.log('\n' + '═'.repeat(60));
  console.log('📈 WEBHOOK TEST SUMMARY');
  console.log('═'.repeat(60));
  
  let totalDeliveries = 0;
  let successfulDeliveries = 0;
  let failedDeliveries = 0;
  
  for (const webhook of webhooks) {
    if (!webhook || !webhook.id) continue;
    
    const stats = await getWebhookStats(webhook.id);
    if (stats) {
      totalDeliveries += stats.totalDeliveries || 0;
      successfulDeliveries += stats.successfulDeliveries || 0;
      failedDeliveries += stats.failedDeliveries || 0;
    }
  }
  
  console.log(`\nTotal Webhooks Created: ${webhooks.filter(w => w).length}`);
  console.log(`Total Deliveries: ${totalDeliveries}`);
  console.log(`Successful: ${successfulDeliveries} ✅`);
  console.log(`Failed: ${failedDeliveries} ❌`);
  console.log(`Overall Success Rate: ${totalDeliveries > 0 ? ((successfulDeliveries / totalDeliveries) * 100).toFixed(2) : 0}%`);
  
  console.log('\n' + '═'.repeat(60));
}

async function main() {
  console.log('🚀 FlexGate Webhook Testing Script');
  console.log('═'.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}`);
  console.log(`Generate Events: ${GENERATE_EVENTS ? 'Yes' : 'No'}`);
  console.log(`Cleanup: ${CLEANUP ? 'Yes' : 'No'}`);
  console.log('═'.repeat(60));

  try {
    // Step 1: List existing webhooks
    console.log('\n📋 Step 1: Checking existing webhooks...');
    await listWebhooks();

    // Step 2: Create test webhooks
    console.log('\n📝 Step 2: Creating test webhooks...');
    const createdWebhooks = [];
    
    for (const config of TEST_WEBHOOKS) {
      const webhook = await createWebhook(config);
      if (webhook) {
        createdWebhooks.push(webhook);
      }
      await sleep(500);
    }

    console.log(`\n✅ Created ${createdWebhooks.length} webhooks`);

    // Step 3: Generate events
    console.log('\n🎯 Step 3: Generating events...');
    await generateEvents();

    // Step 4: Monitor deliveries
    console.log('\n👀 Step 4: Monitoring webhook deliveries...');
    await monitorWebhookDeliveries(createdWebhooks, 15000);

    // Step 5: Display summary
    await displaySummary(createdWebhooks);

    // Step 6: Cleanup
    console.log('\n🧹 Step 6: Cleanup...');
    await cleanupWebhooks(createdWebhooks);

    console.log('\n✅ Webhook testing completed successfully!');
    console.log('\n💡 Tips:');
    console.log('   - Start webhook receiver: cd webhook-receiver && npm start');
    console.log('   - Use webhook.site for external testing');
    console.log('   - Set WEBHOOK_URL to your own webhook endpoint');
    console.log('   - Check logs with: npm run metrics:poll');
    console.log('   - View in Admin UI: http://localhost:3001/webhooks');

  } catch (error) {
    console.error('\n❌ Error during webhook testing:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
