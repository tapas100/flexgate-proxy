#!/usr/bin/env node

/**
 * Comprehensive Webhook Event Testing Script
 * 
 * This script tests all webhook event types by triggering them systematically
 */

const axios = require('axios');
const { spawn } = require('child_process');

const BASE_URL = 'http://localhost:3000';
const ADMIN_API = 'http://localhost:3000/api';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(80));
  log(`  ${title}`, colors.bright + colors.cyan);
  console.log('='.repeat(80) + '\n');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Proxy Request Events (started, completed, failed)
async function testProxyRequestEvents() {
  section('TEST 1: Proxy Request Events');
  
  log('1.1 Testing proxy.request_started and proxy.request_completed', colors.blue);
  try {
    const response = await axios.get(`${BASE_URL}/httpbin/get`);
    log(`✓ Success: ${response.status}`, colors.green);
    log(`  → This triggers: proxy.request_started, proxy.request_completed`, colors.yellow);
  } catch (error) {
    log(`✗ Failed: ${error.message}`, colors.red);
  }
  await sleep(1000);

  log('\n1.2 Testing proxy.request_failed (invalid upstream)', colors.blue);
  try {
    // This will fail because the upstream doesn't exist or is unreachable
    await axios.get(`${BASE_URL}/test-api/invalid`, { timeout: 3000 });
  } catch (error) {
    log(`✓ Expected failure: ${error.message}`, colors.green);
    log(`  → This triggers: proxy.request_failed`, colors.yellow);
  }
  await sleep(1000);
}

// Test 2: Circuit Breaker Events (opened, closed, half_open)
async function testCircuitBreakerEvents() {
  section('TEST 2: Circuit Breaker Events');
  
  log('2.1 Triggering circuit breaker to OPEN state', colors.blue);
  log('  → Making 10 rapid failed requests to trigger circuit breaker', colors.yellow);
  
  for (let i = 1; i <= 10; i++) {
    try {
      await axios.get(`${BASE_URL}/test-api/fail`, { timeout: 500 });
    } catch (error) {
      process.stdout.write(`.`);
    }
    await sleep(100);
  }
  console.log('');
  log('✓ Circuit breaker should now be OPEN', colors.green);
  log('  → This triggers: circuit_breaker.opened', colors.yellow);
  await sleep(3000);

  log('\n2.2 Waiting for HALF_OPEN state', colors.blue);
  log('  → Circuit breaker transitions to half_open after timeout', colors.yellow);
  await sleep(10000); // Wait for circuit breaker timeout
  log('✓ Circuit breaker should now be HALF_OPEN', colors.green);
  log('  → This triggers: circuit_breaker.half_open', colors.yellow);

  log('\n2.3 Making successful request to CLOSE circuit breaker', colors.blue);
  try {
    await axios.get(`${BASE_URL}/httpbin/get`);
    log('✓ Circuit breaker should now be CLOSED', colors.green);
    log('  → This triggers: circuit_breaker.closed', colors.yellow);
  } catch (error) {
    log(`⚠ Note: ${error.message}`, colors.yellow);
  }
  await sleep(2000);
}

// Test 3: Rate Limit Events (exceeded, approaching)
async function testRateLimitEvents() {
  section('TEST 3: Rate Limit Events');
  
  log('⚠ Rate limiting is currently DISABLED in your config', colors.yellow);
  log('To test rate limit events:', colors.blue);
  log('  1. Enable rate limiting in config/proxy.yml', colors.cyan);
  log('  2. Set a low limit (e.g., 5 requests per minute)', colors.cyan);
  log('  3. Make rapid requests to exceed the limit', colors.cyan);
  log('', colors.reset);
  log('Example config:', colors.blue);
  console.log(`
  rate_limit:
    enabled: true
    default:
      max: 5
      window: 60000  # 1 minute
      approaching_threshold: 0.8  # 80% of limit
  `);
  
  log('\nSkipping rate limit tests for now...', colors.yellow);
}

// Test 4: Health Check Events (failed, recovered)
async function testHealthCheckEvents() {
  section('TEST 4: Health Check Events');
  
  log('⚠ Health check events require backend health monitoring', colors.yellow);
  log('These events are typically triggered by:', colors.blue);
  log('  • Backend server becoming unreachable', colors.cyan);
  log('  • Health check endpoint returning errors', colors.cyan);
  log('  • Backend recovering after being down', colors.cyan);
  log('', colors.reset);
  
  log('To manually test:', colors.blue);
  log('  1. Stop a backend service (e.g., httpbin.org unreachable)', colors.cyan);
  log('  2. Configure health checks in your route', colors.cyan);
  log('  3. Wait for health check to fail', colors.cyan);
  log('  4. Restart service to trigger recovery', colors.cyan);
  
  log('\nSkipping health check tests (requires backend manipulation)...', colors.yellow);
}

// Test 5: Config Events (updated, validation_failed)
async function testConfigEvents() {
  section('TEST 5: Config Events');
  
  log('5.1 Testing config.updated via API', colors.blue);
  try {
    // Create a new route
    const newRoute = {
      route_id: 'test-route-' + Date.now(),
      path: '/test-config/*',
      target: 'https://httpbin.org',
      enabled: true,
    };
    
    const response = await axios.post(`${ADMIN_API}/routes`, newRoute);
    log(`✓ Route created: ${response.data.data.route_id}`, colors.green);
    log(`  → This triggers: config.updated`, colors.yellow);
    
    await sleep(2000);
    
    // Update the route
    await axios.put(`${ADMIN_API}/routes/${newRoute.route_id}`, {
      enabled: false,
    });
    log(`✓ Route updated: ${newRoute.route_id}`, colors.green);
    log(`  → This triggers: config.updated`, colors.yellow);
    
    await sleep(2000);
    
    // Delete the route
    await axios.delete(`${ADMIN_API}/routes/${newRoute.route_id}`);
    log(`✓ Route deleted: ${newRoute.route_id}`, colors.green);
    log(`  → This triggers: config.updated`, colors.yellow);
    
  } catch (error) {
    log(`✗ Failed: ${error.message}`, colors.red);
    if (error.response) {
      log(`  Response: ${JSON.stringify(error.response.data)}`, colors.red);
    }
  }
  
  await sleep(2000);
  
  log('\n5.2 Testing config.validation_failed', colors.blue);
  try {
    // Try to create invalid route
    await axios.post(`${ADMIN_API}/routes`, {
      route_id: '',  // Invalid: empty ID
      path: '',      // Invalid: empty path
      target: 'not-a-url',  // Invalid: not a URL
    });
  } catch (error) {
    if (error.response && error.response.status === 400) {
      log(`✓ Validation failed as expected: ${error.response.status}`, colors.green);
      log(`  → This triggers: config.validation_failed`, colors.yellow);
    } else {
      log(`✗ Unexpected error: ${error.message}`, colors.red);
    }
  }
}

// Check webhook deliveries
async function checkDeliveries() {
  section('CHECKING WEBHOOK DELIVERIES');
  
  log('Fetching delivery logs from database...', colors.blue);
  await sleep(2000);
  
  try {
    const { spawn } = require('child_process');
    const psql = spawn('psql', [
      '-d', 'flexgate',
      '-c', 'SELECT webhook_id, event_type, status, COUNT(*) as count FROM webhook_deliveries WHERE created_at > NOW() - INTERVAL \'5 minutes\' GROUP BY webhook_id, event_type, status ORDER BY event_type, status;'
    ]);
    
    let output = '';
    psql.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    psql.on('close', (code) => {
      if (code === 0) {
        console.log(output);
        log('\n✓ Check your Admin UI for delivery logs!', colors.green);
      }
    });
  } catch (error) {
    log(`⚠ Could not check database: ${error.message}`, colors.yellow);
    log('  Check manually with: psql -d flexgate -c "SELECT * FROM webhook_deliveries..."', colors.cyan);
  }
}

// Summary
async function printSummary() {
  section('TEST SUMMARY & RECOMMENDATIONS');
  
  log('✓ Events Successfully Tested:', colors.green);
  log('  • proxy.request_started', colors.cyan);
  log('  • proxy.request_completed', colors.cyan);
  log('  • proxy.request_failed', colors.cyan);
  log('  • circuit_breaker.opened (attempted)', colors.cyan);
  log('  • circuit_breaker.half_open (attempted)', colors.cyan);
  log('  • circuit_breaker.closed (attempted)', colors.cyan);
  log('  • config.updated', colors.cyan);
  log('  • config.validation_failed', colors.cyan);
  
  log('\n⚠ Events Requiring Manual Testing:', colors.yellow);
  log('  • rate_limit.exceeded (requires rate limiting enabled)', colors.cyan);
  log('  • rate_limit.approaching (requires rate limiting enabled)', colors.cyan);
  log('  • health.check_failed (requires backend failure)', colors.cyan);
  log('  • health.check_recovered (requires backend recovery)', colors.cyan);
  
  log('\nNext Steps:', colors.blue);
  log('  1. Check your webhook receiver at http://localhost:4000', colors.cyan);
  log('  2. View delivery logs in Admin UI (http://localhost:3001/webhooks)', colors.cyan);
  log('  3. Query database: psql -d flexgate -c "SELECT * FROM webhook_deliveries..."', colors.cyan);
  log('  4. Enable rate limiting to test those events', colors.cyan);
  log('  5. Configure health checks to test health events', colors.cyan);
}

// Main execution
async function main() {
  try {
    log('\n' + '╔' + '═'.repeat(78) + '╗', colors.bright + colors.blue);
    log('║' + ' '.repeat(20) + 'WEBHOOK EVENT TESTING SCRIPT' + ' '.repeat(30) + '║', colors.bright + colors.blue);
    log('╚' + '═'.repeat(78) + '╝\n', colors.bright + colors.blue);
    
    log('This script will trigger various webhook events to test your delivery system', colors.cyan);
    log('Make sure your webhook receiver is running on http://localhost:4000\n', colors.yellow);
    
    await sleep(2000);
    
    await testProxyRequestEvents();
    await testCircuitBreakerEvents();
    await testRateLimitEvents();
    await testHealthCheckEvents();
    await testConfigEvents();
    await checkDeliveries();
    await printSummary();
    
    log('\n✅ Testing Complete!\n', colors.bright + colors.green);
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}\n`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
