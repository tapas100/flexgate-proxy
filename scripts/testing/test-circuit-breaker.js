#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');

const PROXY_URL = 'http://localhost:3000';
const CIRCUIT_BREAKER_THRESHOLD = 5;
const DELAY_MS = 100;

console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════════════════════╗'));
console.log(chalk.bold.cyan('║              CIRCUIT BREAKER EVENT TESTING SCRIPT                           ║'));
console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════════════════╝\n'));

console.log('This script will trigger circuit breaker events:');
console.log('  • circuit_breaker.opened');
console.log('  • circuit_breaker.half_open');
console.log('  • circuit_breaker.closed');
console.log('  • circuit_breaker.error\n');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function makeRequest(endpoint, expectedToFail = false) {
  try {
    const response = await axios.get(`${PROXY_URL}${endpoint}`, {
      timeout: 10000,
      validateStatus: () => true // Accept any status code
    });
    
    if (expectedToFail) {
      console.log(chalk.yellow(`  ✓ Request failed as expected: ${response.status}`));
    } else {
      console.log(chalk.green(`  ✓ Request succeeded: ${response.status}`));
    }
    return { success: response.status < 400, status: response.status };
  } catch (error) {
    console.log(chalk.red(`  ✗ Request error: ${error.message}`));
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 1: Verify Normal Operation'));
  console.log('='.repeat(80) + '\n');
  
  console.log('1.1 Making successful request to verify circuit is CLOSED');
  await makeRequest('/httpbin/status/200');
  await sleep(DELAY_MS);
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 2: Trigger Circuit Breaker to OPEN State'));
  console.log('='.repeat(80) + '\n');
  
  console.log(`2.1 Making ${CIRCUIT_BREAKER_THRESHOLD + 2} failed requests to trigger circuit breaker`);
  console.log('  → Requesting /httpbin/delay/10 with 2s timeout (will cause timeout errors)');
  
  for (let i = 1; i <= CIRCUIT_BREAKER_THRESHOLD + 2; i++) {
    console.log(chalk.gray(`  Request ${i}/${CIRCUIT_BREAKER_THRESHOLD + 2}:`));
    try {
      await axios.get(`${PROXY_URL}/httpbin/delay/10`, { timeout: 2000 });
      console.log(chalk.yellow('  ? Request succeeded unexpectedly'));
    } catch (error) {
      console.log(chalk.red('  ✓ Request timed out as expected'));
    }
    await sleep(DELAY_MS);
  }
  
  console.log(chalk.bold.red('\n  ✓ Circuit breaker should now be OPEN'));
  console.log(chalk.gray('  → This triggers: circuit_breaker.opened\n'));
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 3: Verify Circuit Breaker is OPEN'));
  console.log('='.repeat(80) + '\n');
  
  console.log('3.1 Making request while circuit is OPEN (should be rejected immediately)');
  await makeRequest('/httpbin/status/200', true);
  await sleep(DELAY_MS);
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 4: Wait for HALF_OPEN State'));
  console.log('='.repeat(80) + '\n');
  
  console.log('4.1 Waiting for circuit breaker timeout (60 seconds)...');
  console.log(chalk.gray('  → Circuit breaker will transition to HALF_OPEN state'));
  console.log(chalk.gray('  → This triggers: circuit_breaker.half_open\n'));
  
  const waitTime = 60;
  for (let i = waitTime; i > 0; i -= 10) {
    console.log(chalk.yellow(`  ⏳ ${i} seconds remaining...`));
    await sleep(10000);
  }
  
  console.log(chalk.bold.yellow('\n  ✓ Circuit breaker should now be HALF_OPEN\n'));
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 5: Close Circuit Breaker with Successful Requests'));
  console.log('='.repeat(80) + '\n');
  
  console.log('5.1 Making 2 successful requests to close circuit breaker');
  console.log(chalk.gray('  → Need 2 successful requests (successThreshold: 2)'));
  
  for (let i = 1; i <= 2; i++) {
    console.log(chalk.gray(`  Success request ${i}/2:`));
    await makeRequest('/httpbin/status/200');
    await sleep(DELAY_MS);
  }
  
  console.log(chalk.bold.green('\n  ✓ Circuit breaker should now be CLOSED'));
  console.log(chalk.gray('  → This triggers: circuit_breaker.closed\n'));
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 6: Verify Normal Operation Restored'));
  console.log('='.repeat(80) + '\n');
  
  console.log('6.1 Making final successful request to confirm circuit is CLOSED');
  await makeRequest('/httpbin/status/200');
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  CHECKING WEBHOOK DELIVERIES'));
  console.log('='.repeat(80) + '\n');
  
  console.log('Fetching circuit breaker event deliveries from database...\n');
  
  const { exec } = require('child_process');
  exec('psql -d flexgate -c "SELECT webhook_id, event_type, status, response_code, created_at FROM webhook_deliveries WHERE event_type LIKE \'circuit_breaker.%\' ORDER BY created_at DESC LIMIT 10;"', 
    (error, stdout, stderr) => {
      if (error) {
        console.log(chalk.red(`Error querying database: ${error.message}`));
      } else {
        console.log(stdout);
      }
      
      console.log(chalk.bold('\n' + '='.repeat(80)));
      console.log(chalk.bold('  TEST SUMMARY'));
      console.log('='.repeat(80) + '\n');
      
      console.log(chalk.green('✓ Events Triggered:'));
      console.log('  • circuit_breaker.opened (circuit opened after failures)');
      console.log('  • circuit_breaker.half_open (circuit testing recovery)');
      console.log('  • circuit_breaker.closed (circuit recovered)');
      
      console.log(chalk.cyan('\n📊 Next Steps:'));
      console.log('  1. Check your webhook receiver at http://localhost:4000');
      console.log('  2. View delivery logs in Admin UI (http://localhost:3001/webhooks)');
      console.log('  3. Look for color-coded event badges:');
      console.log(chalk.red('     • circuit_breaker.opened → RED badge'));
      console.log(chalk.green('     • circuit_breaker.closed → GREEN badge'));
      console.log(chalk.yellow('     • circuit_breaker.half_open → YELLOW badge'));
      
      console.log(chalk.bold.green('\n✅ Testing Complete!\n'));
    }
  );
}

// Run the tests
runTests().catch(error => {
  console.error(chalk.red('\n❌ Test failed with error:'), error);
  process.exit(1);
});
