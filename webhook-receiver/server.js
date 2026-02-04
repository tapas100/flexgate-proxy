/**
 * FlexGate Webhook Receiver
 * 
 * A simple HTTP server that receives and logs webhook deliveries from FlexGate.
 * Perfect for local testing without needing external services like webhook.site
 * 
 * Usage:
 *   npm start
 *   PORT=4000 npm start
 * 
 * Features:
 * - Logs all incoming webhooks with full details
 * - Tracks delivery statistics
 * - Displays webhook payloads in formatted JSON
 * - Shows headers, timing, and retry information
 * - Provides a summary of all received webhooks
 */

const express = require('express');
const app = express();

const PORT = process.env.PORT || 4000;
const SIMULATE_FAILURES = /^true$/i.test(process.env.SIMULATE_FAILURES || 'false');
const FAILURE_RATE = parseFloat(process.env.FAILURE_RATE || '0.2'); // 20% failure rate

// Store received webhooks in memory
const receivedWebhooks = [];
const stats = {
  total: 0,
  byEvent: {},
  byStatus: {
    success: 0,
    failed: 0,
  },
  startTime: Date.now(),
};

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function formatTimestamp() {
  return new Date().toISOString();
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function displayWebhookHeader(req) {
  console.log('\n' + '═'.repeat(80));
  console.log(`${colors.bright}${colors.cyan}📨 WEBHOOK RECEIVED${colors.reset}`);
  console.log('═'.repeat(80));
  console.log(`${colors.dim}Time:${colors.reset} ${formatTimestamp()}`);
  console.log(`${colors.dim}Method:${colors.reset} ${req.method}`);
  console.log(`${colors.dim}Path:${colors.reset} ${req.path}`);
  console.log(`${colors.dim}IP:${colors.reset} ${req.ip}`);
}

function displayHeaders(headers) {
  console.log(`\n${colors.bright}${colors.yellow}📋 Headers:${colors.reset}`);
  console.log('─'.repeat(80));
  
  const importantHeaders = [
    'content-type',
    'user-agent',
    'x-webhook-id',
    'x-webhook-event',
    'x-webhook-delivery',
    'x-webhook-signature',
    'x-retry-count',
  ];
  
  importantHeaders.forEach(header => {
    if (headers[header]) {
      console.log(`  ${colors.cyan}${header}:${colors.reset} ${headers[header]}`);
    }
  });
  
  // Show other headers
  const otherHeaders = Object.keys(headers).filter(h => !importantHeaders.includes(h));
  if (otherHeaders.length > 0) {
    console.log(`\n  ${colors.dim}Other headers (${otherHeaders.length}):${colors.reset}`);
    otherHeaders.slice(0, 5).forEach(header => {
      console.log(`  ${colors.dim}${header}:${colors.reset} ${headers[header]}`);
    });
    if (otherHeaders.length > 5) {
      console.log(`  ${colors.dim}... and ${otherHeaders.length - 5} more${colors.reset}`);
    }
  }
}

function displayPayload(body) {
  console.log(`\n${colors.bright}${colors.magenta}📦 Payload:${colors.reset}`);
  console.log('─'.repeat(80));
  
  if (!body || Object.keys(body).length === 0) {
    console.log(`  ${colors.dim}(empty)${colors.reset}`);
    return;
  }
  
  // Pretty print JSON with colors
  const jsonStr = JSON.stringify(body, null, 2);
  const lines = jsonStr.split('\n');
  
  lines.forEach(line => {
    if (line.includes('"event"') || line.includes('"type"')) {
      console.log(`  ${colors.green}${line}${colors.reset}`);
    } else if (line.includes('"timestamp"') || line.includes('"time"')) {
      console.log(`  ${colors.cyan}${line}${colors.reset}`);
    } else if (line.includes('"error"') || line.includes('"failed"')) {
      console.log(`  ${colors.red}${line}${colors.reset}`);
    } else {
      console.log(`  ${colors.dim}${line}${colors.reset}`);
    }
  });
}

function displayEventSummary(eventType) {
  console.log(`\n${colors.bright}${colors.blue}📊 Event Summary:${colors.reset}`);
  console.log('─'.repeat(80));
  
  const eventStats = stats.byEvent[eventType] || { count: 0, examples: [] };
  console.log(`  Event Type: ${colors.cyan}${eventType}${colors.reset}`);
  console.log(`  Count: ${colors.yellow}${eventStats.count}${colors.reset}`);
  
  if (eventStats.examples && eventStats.examples.length > 0) {
    console.log(`  Recent Examples:`);
    eventStats.examples.slice(-3).forEach(ex => {
      console.log(`    - ${ex.timestamp}: ${ex.summary}`);
    });
  }
}

function displayStats() {
  const uptime = Date.now() - stats.startTime;
  
  console.log(`\n${colors.bright}${colors.green}📈 Statistics:${colors.reset}`);
  console.log('─'.repeat(80));
  console.log(`  Total Webhooks: ${colors.yellow}${stats.total}${colors.reset}`);
  console.log(`  Successful: ${colors.green}${stats.byStatus.success}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${stats.byStatus.failed}${colors.reset}`);
  console.log(`  Uptime: ${colors.cyan}${formatDuration(uptime)}${colors.reset}`);
  console.log(`  Rate: ${colors.yellow}${(stats.total / (uptime / 1000 / 60)).toFixed(2)} webhooks/min${colors.reset}`);
  
  if (Object.keys(stats.byEvent).length > 0) {
    console.log(`\n  ${colors.bright}By Event Type:${colors.reset}`);
    Object.entries(stats.byEvent)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([event, data]) => {
        console.log(`    ${colors.cyan}${event}:${colors.reset} ${data.count}`);
      });
  }
}

function shouldSimulateFailure() {
  return SIMULATE_FAILURES && Math.random() < FAILURE_RATE;
}

// Main webhook endpoint
app.all('/webhook', (req, res) => {
  const startTime = Date.now();
  
  // Display webhook details
  displayWebhookHeader(req);
  displayHeaders(req.headers);
  displayPayload(req.body);
  
  // Extract event information
  const eventType = req.headers['x-webhook-event'] || req.body?.event || 'unknown';
  const webhookId = req.headers['x-webhook-id'] || 'unknown';
  const deliveryId = req.headers['x-webhook-delivery'] || 'unknown';
  const retryCount = parseInt(req.headers['x-retry-count'] || '0', 10);
  
  // Update statistics
  stats.total++;
  if (!stats.byEvent[eventType]) {
    stats.byEvent[eventType] = { count: 0, examples: [] };
  }
  stats.byEvent[eventType].count++;
  
  // Store webhook data
  const webhookData = {
    timestamp: formatTimestamp(),
    eventType,
    webhookId,
    deliveryId,
    retryCount,
    headers: { ...req.headers },
    body: req.body,
    processingTime: Date.now() - startTime,
  };
  
  receivedWebhooks.push(webhookData);
  
  // Keep only last 100 webhooks in memory
  if (receivedWebhooks.length > 100) {
    receivedWebhooks.shift();
  }
  
  // Add example to event stats
  stats.byEvent[eventType].examples.push({
    timestamp: formatTimestamp(),
    summary: `${req.method} ${req.path} - Retry: ${retryCount}`,
  });
  
  // Keep only last 5 examples per event type
  if (stats.byEvent[eventType].examples.length > 5) {
    stats.byEvent[eventType].examples.shift();
  }
  
  // Simulate failures for testing retry logic
  if (shouldSimulateFailure()) {
    stats.byStatus.failed++;
    console.log(`\n${colors.red}❌ SIMULATED FAILURE${colors.reset}`);
    displayStats();
    console.log('═'.repeat(80) + '\n');
    return res.status(500).json({ error: 'Simulated failure for testing retries' });
  }
  
  // Return appropriate status codes based on event type for realistic testing
  // This helps distinguish between webhook delivery success and the actual event content
  let statusCode = 200;
  let responseMessage = 'Webhook received successfully';
  
  // For failed/error events, simulate that the webhook consumer might return different codes
  // This doesn't mean the delivery failed - it means the consumer processed the failure event
  if (eventType.includes('failed') || eventType.includes('error')) {
    // Return 200 OK - webhook was delivered successfully
    // The payload contains information about a failure, but the delivery itself succeeded
    statusCode = 200;
    responseMessage = 'Failure event received and logged';
  } else if (eventType.includes('opened') || eventType.includes('exceeded')) {
    // Circuit breaker opened or rate limit exceeded - warning events
    statusCode = 200;
    responseMessage = 'Warning event received and logged';
  } else {
    // Success events
    statusCode = 200;
    responseMessage = 'Success event received and logged';
  }
  
  // Success response
  stats.byStatus.success++;
  webhookData.processingTime = Date.now() - startTime;
  
  displayEventSummary(eventType);
  displayStats();
  
  console.log(`\n${colors.green}✅ SUCCESS${colors.reset} (${webhookData.processingTime}ms)`);
  console.log(`${colors.cyan}Event Type:${colors.reset} ${eventType}`);
  console.log(`${colors.cyan}Response:${colors.reset} ${statusCode} - ${responseMessage}`);
  console.log('═'.repeat(80) + '\n');
  
  res.status(statusCode).json({
    received: true,
    webhookId,
    deliveryId,
    eventType,
    message: responseMessage,
    processingTime: webhookData.processingTime,
    message: 'Webhook received successfully',
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: formatDuration(Date.now() - stats.startTime),
    stats,
  });
});

// List all received webhooks
app.get('/webhooks', (req, res) => {
  res.json({
    total: receivedWebhooks.length,
    webhooks: receivedWebhooks,
    stats,
  });
});

// Clear received webhooks
app.post('/clear', (req, res) => {
  const count = receivedWebhooks.length;
  receivedWebhooks.length = 0;
  stats.total = 0;
  stats.byEvent = {};
  stats.byStatus = { success: 0, failed: 0 };
  stats.startTime = Date.now();
  
  console.log(`\n${colors.yellow}🗑️  Cleared ${count} webhooks${colors.reset}\n`);
  
  res.json({
    cleared: count,
    message: 'All webhooks cleared',
  });
});

// Toggle failure simulation
app.post('/config/failures', (req, res) => {
  const { enabled, rate } = req.body;
  
  if (enabled !== undefined) {
    process.env.SIMULATE_FAILURES = enabled ? 'true' : 'false';
  }
  
  if (rate !== undefined && rate >= 0 && rate <= 1) {
    process.env.FAILURE_RATE = rate.toString();
  }
  
  res.json({
    simulateFailures: /^true$/i.test(process.env.SIMULATE_FAILURES),
    failureRate: parseFloat(process.env.FAILURE_RATE || '0.2'),
  });
});

// Get current configuration
app.get('/config', (req, res) => {
  res.json({
    simulateFailures: SIMULATE_FAILURES,
    failureRate: FAILURE_RATE,
    port: PORT,
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`\n${colors.yellow}⚠️  404 Not Found: ${req.method} ${req.path}${colors.reset}\n`);
  res.status(404).json({
    error: 'Not found',
    hint: 'Send webhooks to POST /webhook',
  });
});

// Start server
app.listen(PORT, () => {
  console.clear();
  console.log('═'.repeat(80));
  console.log(`${colors.bright}${colors.green}🚀 FlexGate Webhook Receiver${colors.reset}`);
  console.log('═'.repeat(80));
  console.log(`\n${colors.cyan}Server running on:${colors.reset} http://localhost:${PORT}`);
  console.log(`${colors.cyan}Webhook endpoint:${colors.reset} http://localhost:${PORT}/webhook`);
  console.log(`${colors.cyan}Health check:${colors.reset} http://localhost:${PORT}/health`);
  console.log(`${colors.cyan}View webhooks:${colors.reset} http://localhost:${PORT}/webhooks`);
  console.log(`${colors.cyan}Clear webhooks:${colors.reset} POST http://localhost:${PORT}/clear`);
  
  if (SIMULATE_FAILURES) {
    console.log(`\n${colors.yellow}⚠️  Failure simulation enabled: ${(FAILURE_RATE * 100).toFixed(0)}% failure rate${colors.reset}`);
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log(`${colors.bright}Waiting for webhooks...${colors.reset}`);
  console.log('═'.repeat(80) + '\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n\n${colors.yellow}Shutting down...${colors.reset}`);
  displayStats();
  console.log('\n' + '═'.repeat(80));
  console.log(`${colors.bright}${colors.green}👋 Goodbye!${colors.reset}`);
  console.log('═'.repeat(80) + '\n');
  process.exit(0);
});
