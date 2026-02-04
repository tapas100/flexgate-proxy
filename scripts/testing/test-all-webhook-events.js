#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');

const PROXY_URL = 'http://localhost:3000';

console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════════════════════╗'));
console.log(chalk.bold.cyan('║              COMPREHENSIVE EVENT TESTING - ALL EVENT TYPES                  ║'));
console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════════════════╝\n'));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testProxyEvents() {
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  TEST 1: Proxy Request Events (proxy.request_completed, proxy.request_failed)'));
  console.log('='.repeat(80) + '\n');
  
  // Successful requests
  console.log('1.1 Making successful proxy requests...');
  for (let i = 1; i <= 3; i++) {
    try {
      await axios.get(`${PROXY_URL}/httpbin/get?test=${i}`);
      console.log(chalk.green(`  ✓ Request ${i} completed successfully`));
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ Request ${i} failed: ${error.message}`));
    }
    await sleep(200);
  }
  
  // Failed requests (invalid route)
  console.log('\n1.2 Making failed proxy requests (404 errors)...');
  for (let i = 1; i <= 3; i++) {
    try {
      await axios.get(`${PROXY_URL}/nonexistent/path/${i}`);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(chalk.red(`  ✓ Request ${i} failed as expected (404)`));
      } else {
        console.log(chalk.yellow(`  ? Request ${i}: ${error.message}`));
      }
    }
    await sleep(200);
  }
  
  console.log(chalk.bold.green('\n✅ Proxy events triggered!'));
}

async function testConfigEvents() {
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  TEST 2: Config Events (config.validation_failed)'));
  console.log('='.repeat(80) + '\n');
  
  console.log('2.1 Creating route with invalid data (validation should fail)...');
  try {
    await axios.post(`${PROXY_URL}/api/routes`, {
      path: '/test-validation',
      // Missing required field: upstream
      methods: ['GET']
    });
    console.log(chalk.yellow('  ⚠ Route creation succeeded (unexpected)'));
  } catch (error) {
    if (error.response?.status === 400) {
      console.log(chalk.green('  ✓ Validation failed as expected (400)'));
      console.log(chalk.gray(`    Response: ${JSON.stringify(error.response.data).substring(0, 100)}...`));
    } else {
      console.log(chalk.red(`  ✗ Unexpected error: ${error.message}`));
    }
  }
  
  await sleep(500);
  
  console.log('\n2.2 Updating route with invalid upstream URL...');
  try {
    // First get an existing route
    const routesResponse = await axios.get(`${PROXY_URL}/api/routes`);
    const testRoute = routesResponse.data.data[0];
    
    if (testRoute) {
      await axios.patch(`${PROXY_URL}/api/routes/${testRoute.id}`, {
        upstream: 'not-a-valid-url'
      });
      console.log(chalk.yellow('  ⚠ Update succeeded (unexpected)'));
    } else {
      console.log(chalk.yellow('  ⚠ No routes available to test update'));
    }
  } catch (error) {
    if (error.response?.status === 400) {
      console.log(chalk.green('  ✓ Validation failed as expected (400)'));
    } else {
      console.log(chalk.yellow(`  ? Error: ${error.message}`));
    }
  }
  
  console.log(chalk.bold.green('\n✅ Config validation events triggered!'));
}

async function testRateLimitEvents() {
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  TEST 3: Rate Limit Events (rate_limit.exceeded, rate_limit.approaching)'));
  console.log('='.repeat(80) + '\n');
  
  console.log('Note: Rate limiting is currently DISABLED in your config.');
  console.log('Checking if rate limit is enabled on /httpbin route...\n');
  
  console.log('3.1 Making rapid requests to trigger rate limit...');
  let rateLimitHit = false;
  
  for (let i = 1; i <= 100; i++) {
    try {
      await axios.get(`${PROXY_URL}/httpbin/get?rapid=${i}`, { timeout: 2000 });
      if (i % 10 === 0) {
        console.log(chalk.gray(`  → ${i}/100 requests completed`));
      }
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(chalk.green(`  ✓ Rate limit triggered at request ${i}!`));
        rateLimitHit = true;
        break;
      } else if (error.code === 'ECONNABORTED') {
        console.log(chalk.yellow(`  ⚠ Request ${i} timed out`));
      }
    }
    await sleep(50); // Small delay
  }
  
  if (rateLimitHit) {
    console.log(chalk.bold.green('\n✅ Rate limit events triggered!'));
    // Wait for rate limit to reset
    console.log('\nWaiting 5 seconds for rate limit window...');
    await sleep(5000);
  } else {
    console.log(chalk.bold.yellow('\n⚠ Rate limiting might not be enabled or threshold is high'));
  }
}

async function testCreatedEvents() {
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  TEST 4: Config Created/Updated Events (config.created, config.updated)'));
  console.log('='.repeat(80) + '\n');
  
  console.log('4.1 Creating a new valid route...');
  let createdRouteId = null;
  
  try {
    const response = await axios.post(`${PROXY_URL}/api/routes`, {
      path: '/test-events/*',
      upstream: 'https://httpbin.org',
      methods: ['GET', 'POST'],
      stripPath: '/test-events',
      description: 'Test route for event generation'
    });
    
    if (response.status === 201 || response.status === 200) {
      createdRouteId = response.data.data.id;
      console.log(chalk.green(`  ✓ Route created: ${createdRouteId}`));
    }
  } catch (error) {
    console.log(chalk.red(`  ✗ Failed to create route: ${error.message}`));
  }
  
  await sleep(500);
  
  if (createdRouteId) {
    console.log('\n4.2 Updating the route...');
    try {
      await axios.patch(`${PROXY_URL}/api/routes/${createdRouteId}`, {
        description: 'Updated description for testing config.updated event'
      });
      console.log(chalk.green('  ✓ Route updated successfully'));
    } catch (error) {
      console.log(chalk.red(`  ✗ Failed to update route: ${error.message}`));
    }
    
    await sleep(500);
    
    console.log('\n4.3 Cleaning up test route...');
    try {
      await axios.delete(`${PROXY_URL}/api/routes/${createdRouteId}`);
      console.log(chalk.green('  ✓ Route deleted'));
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ Cleanup failed: ${error.message}`));
    }
  }
  
  console.log(chalk.bold.green('\n✅ Config created/updated events triggered!'));
}

async function checkResults() {
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  CHECKING WEBHOOK DELIVERIES IN DATABASE'));
  console.log('='.repeat(80) + '\n');
  
  const { exec } = require('child_process');
  
  return new Promise((resolve) => {
    exec(
      'psql -d flexgate -c "SELECT event_type, COUNT(*) as count FROM webhook_deliveries WHERE created_at > NOW() - INTERVAL \'5 minutes\' GROUP BY event_type ORDER BY count DESC;"',
      (error, stdout, stderr) => {
        if (error) {
          console.log(chalk.red(`Database query error: ${error.message}`));
        } else {
          console.log('Recent webhook deliveries (last 5 minutes):\n');
          console.log(stdout);
        }
        resolve();
      }
    );
  });
}

async function runAllTests() {
  console.log('Starting comprehensive event testing...\n');
  console.log('Events to test:');
  console.log('  ✓ proxy.request_completed (green)');
  console.log('  ✓ proxy.request_failed (red)');
  console.log('  ✓ config.validation_failed (purple)');
  console.log('  ✓ config.created (blue)');
  console.log('  ✓ config.updated (blue)');
  console.log('  ✓ rate_limit.exceeded (orange)');
  console.log('  ✓ rate_limit.approaching (orange)\n');
  
  try {
    await testProxyEvents();
    await sleep(1000);
    
    await testConfigEvents();
    await sleep(1000);
    
    await testRateLimitEvents();
    await sleep(1000);
    
    await testCreatedEvents();
    await sleep(2000);
    
    await checkResults();
    
    console.log(chalk.bold('\n' + '='.repeat(80)));
    console.log(chalk.bold('  SUMMARY & NEXT STEPS'));
    console.log('='.repeat(80) + '\n');
    
    console.log(chalk.cyan('📊 View Results:'));
    console.log('  1. Open Admin UI: http://localhost:3001/webhooks');
    console.log('  2. Click "View Details" on each webhook');
    console.log('  3. See color-coded event badges:\n');
    
    console.log(chalk.green('     🟢 Green badges:'));
    console.log('        • proxy.request_completed');
    console.log('        • circuit_breaker.closed');
    console.log('        • rate_limit.recovered\n');
    
    console.log(chalk.red('     🔴 Red badges:'));
    console.log('        • proxy.request_failed');
    console.log('        • circuit_breaker.opened\n');
    
    console.log(chalk.blue('     🔵 Blue badges:'));
    console.log('        • config.created');
    console.log('        • config.updated\n');
    
    console.log(chalk.yellow('     🟡 Orange badges:'));
    console.log('        • rate_limit.exceeded');
    console.log('        • rate_limit.approaching');
    console.log('        • circuit_breaker.opened\n');
    
    console.log(chalk.magenta('     🟣 Purple badges:'));
    console.log('        • config.validation_failed\n');
    
    console.log(chalk.bold.green('✅ Testing Complete!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test suite failed:'), error.message);
    process.exit(1);
  }
}

runAllTests();
