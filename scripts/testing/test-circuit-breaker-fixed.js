#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');

const PROXY_URL = 'http://localhost:3000';

console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════════════════════╗'));
console.log(chalk.bold.cyan('║         CIRCUIT BREAKER TEST - HIGH VOLUME FAILURES                         ║'));
console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════════════════╝\n'));

console.log('Circuit Breaker Configuration:');
console.log('  • Volume Threshold: 10 requests in 10-second window');
console.log('  • Failure Threshold: 5% (50% as configured in YAML)');
console.log('  • Strategy: Make 15 rapid requests to invalid host\n');

async function makeRequest(num) {
  try {
    const startTime = Date.now();
    await axios.get(`${PROXY_URL}/failing-service/test${num}`, {
      timeout: 3000
    });
    const duration = Date.now() - startTime;
    console.log(chalk.green(`  ✓ Request ${num}: Success (${duration}ms)`));
    return { success: true, duration };
  } catch (error) {
    const duration = Date.now() - (error.config?._startTime || Date.now());
    if (error.response) {
      console.log(chalk.yellow(`  • Request ${num}: HTTP ${error.response.status} (${duration}ms)`));
      return { success: error.response.status < 500, status: error.response.status };
    } else {
      console.log(chalk.red(`  ✗ Request ${num}: ${error.code || error.message} (${duration}ms)`));
      return { success: false, error: error.code || error.message };
    }
  }
}

async function runTest() {
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 1: Create Route with Invalid Upstream'));
  console.log('='.repeat(80) + '\n');
  
  try {
    const response = await axios.post(`${PROXY_URL}/api/routes`, {
      path: '/failing-service/*',
      upstream: 'http://invalid-host-12345.local:9999',
      methods: ['GET', 'POST'],
      stripPath: '/failing-service',
      description: 'Test route - will cause connection errors'
    });
    console.log(chalk.green('✓ Test route created'));
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(chalk.yellow('⚠ Route already exists, continuing...'));
    } else {
      console.log(chalk.red('✗ Failed to create route:', error.message));
      return;
    }
  }
  
  // Wait for route to be loaded
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 2: Make 15 Rapid Requests (triggers circuit breaker)'));
  console.log('='.repeat(80) + '\n');
  
  console.log('Making requests as fast as possible within 10-second window...\n');
  
  const results = [];
  for (let i = 1; i <= 15; i++) {
    const result = await makeRequest(i);
    results.push(result);
    // Small delay to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const failures = results.filter(r => !r.success).length;
  const failureRate = ((failures / results.length) * 100).toFixed(1);
  
  console.log(chalk.bold(`\n📊 Results: ${failures}/${results.length} failed (${failureRate}% failure rate)`));
  
  if (failures >= results.length * 0.05) {
    console.log(chalk.bold.red('✓ Failure threshold exceeded - circuit breaker should be OPEN'));
  } else {
    console.log(chalk.bold.yellow(`⚠ Failure rate (${failureRate}%) below threshold (5%)`));
  }
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 3: Verify Circuit is OPEN'));
  console.log('='.repeat(80) + '\n');
  
  console.log('Making one more request (should be rejected immediately)...\n');
  const testResult = await makeRequest('test');
  if (testResult.status === 503) {
    console.log(chalk.bold.green('\n✓ Circuit breaker is OPEN (request rejected with 503)'));
  } else {
    console.log(chalk.bold.yellow('\n⚠ Circuit might not be open yet'));
  }
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 4: Wait for HALF_OPEN'));
  console.log('='.repeat(80) + '\n');
  
  console.log('Waiting 35 seconds for circuit to transition to HALF_OPEN...\n');
  for (let i = 35; i > 0; i -= 5) {
    console.log(chalk.yellow(`  ⏳ ${i} seconds remaining...`));
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log(chalk.bold.yellow('\n✓ Circuit should now be HALF_OPEN'));
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 5: Fix Route and Close Circuit'));
  console.log('='.repeat(80) + '\n');
  
  // Get route ID
  try {
    const routesResponse = await axios.get(`${PROXY_URL}/api/routes`);
    const testRoute = routesResponse.data.data.find(r => r.path === '/failing-service/*');
    
    if (testRoute) {
      // Update to valid upstream
      await axios.patch(`${PROXY_URL}/api/routes/${testRoute.id}`, {
        upstream: 'https://httpbin.org'
      });
      console.log(chalk.green('✓ Route updated to valid upstream\n'));
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Make successful requests to close circuit
      console.log('Making 3 successful requests to close circuit...\n');
      for (let i = 1; i <= 3; i++) {
        await axios.get(`${PROXY_URL}/failing-service/status/200`);
        console.log(chalk.green(`  ✓ Success request ${i}/3`));
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      console.log(chalk.bold.green('\n✓ Circuit breaker should now be CLOSED'));
      
      // Clean up
      console.log(chalk.bold('\n' + '='.repeat(80)));
      console.log(chalk.bold('  CLEANUP'));
      console.log('='.repeat(80) + '\n');
      
      await axios.delete(`${PROXY_URL}/api/routes/${testRoute.id}`);
      console.log(chalk.green('✓ Test route deleted'));
    }
  } catch (error) {
    console.log(chalk.red('✗ Cleanup failed:', error.message));
  }
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  CHECK RESULTS'));
  console.log('='.repeat(80) + '\n');
  
  console.log('Query database for circuit breaker events:\n');
  console.log(chalk.cyan('  psql -d flexgate -c "SELECT event_type, status, created_at FROM webhook_deliveries WHERE event_type LIKE \'circuit_breaker.%\' ORDER BY created_at DESC LIMIT 10;"'));
  
  console.log(chalk.bold.green('\n✅ Test Complete!\n'));
  console.log('Check Admin UI at: http://localhost:3001/webhooks');
  console.log('Look for circuit_breaker webhook with deliveries showing color-coded badges\n');
}

runTest().catch(error => {
  console.error(chalk.red('\n❌ Test failed:'), error.message);
  process.exit(1);
});
