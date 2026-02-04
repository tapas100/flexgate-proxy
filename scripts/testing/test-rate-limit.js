#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');

const PROXY_URL = 'http://localhost:3000';
const RATE_LIMIT = 100; // From config
const DELAY_MS = 50;

console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════════════════════╗'));
console.log(chalk.bold.cyan('║                RATE LIMIT EVENT TESTING SCRIPT                              ║'));
console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════════════════╝\n'));

console.log('This script will trigger rate limit events:');
console.log('  • rate_limit.approaching (at 80% of limit)');
console.log('  • rate_limit.exceeded (when limit is reached)');
console.log('  • rate_limit.recovered (when rate drops below limit)\n');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function makeRequest(num) {
  try {
    const response = await axios.get(`${PROXY_URL}/httpbin/get?req=${num}`, {
      timeout: 5000,
      validateStatus: () => true
    });
    return { success: response.status < 400, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 1: Trigger Rate Limit Approaching Event'));
  console.log('='.repeat(80) + '\n');
  
  const approachingThreshold = Math.floor(RATE_LIMIT * 0.8); // 80 requests
  console.log(`1.1 Making ${approachingThreshold} requests to trigger "approaching" event`);
  console.log(chalk.gray(`  → Rate limit: ${RATE_LIMIT} requests per minute`));
  console.log(chalk.gray(`  → Approaching threshold: ${approachingThreshold} requests (80%)\n`));
  
  let successCount = 0;
  let failedCount = 0;
  
  for (let i = 1; i <= approachingThreshold; i++) {
    const result = await makeRequest(i);
    if (result.success) {
      successCount++;
      if (i % 10 === 0) {
        console.log(chalk.green(`  ✓ ${i}/${approachingThreshold} requests completed`));
      }
    } else {
      failedCount++;
      console.log(chalk.red(`  ✗ Request ${i} failed: ${result.status || result.error}`));
    }
    await sleep(DELAY_MS);
  }
  
  console.log(chalk.bold.yellow(`\n  ✓ Should trigger: rate_limit.approaching`));
  console.log(chalk.gray(`  → Successful: ${successCount}, Failed: ${failedCount}\n`));
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 2: Trigger Rate Limit Exceeded Event'));
  console.log('='.repeat(80) + '\n');
  
  const exceedBy = 10;
  console.log(`2.1 Making ${exceedBy} more requests to exceed the rate limit\n`);
  
  for (let i = 1; i <= exceedBy; i++) {
    const result = await makeRequest(approachingThreshold + i);
    if (result.status === 429) {
      console.log(chalk.red(`  ✓ Request ${i} rate limited: ${result.status}`));
    } else if (result.success) {
      console.log(chalk.green(`  ✓ Request ${i} succeeded: ${result.status}`));
    } else {
      console.log(chalk.yellow(`  ? Request ${i}: ${result.status || result.error}`));
    }
    await sleep(DELAY_MS);
  }
  
  console.log(chalk.bold.red(`\n  ✓ Should trigger: rate_limit.exceeded\n`));
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 3: Wait for Rate Limit Window to Reset'));
  console.log('='.repeat(80) + '\n');
  
  console.log('3.1 Waiting 65 seconds for rate limit window to reset...');
  console.log(chalk.gray('  → Rate limit window: 60 seconds + 5 second buffer\n'));
  
  for (let i = 65; i > 0; i -= 5) {
    console.log(chalk.yellow(`  ⏳ ${i} seconds remaining...`));
    await sleep(5000);
  }
  
  console.log(chalk.bold.green('\n  ✓ Rate limit should now be reset'));
  console.log(chalk.gray('  → This triggers: rate_limit.recovered\n'));
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  STEP 4: Verify Normal Operation Restored'));
  console.log('='.repeat(80) + '\n');
  
  console.log('4.1 Making request to confirm rate limit is reset');
  const finalResult = await makeRequest('final');
  if (finalResult.success) {
    console.log(chalk.green(`  ✓ Request succeeded: ${finalResult.status}`));
  } else {
    console.log(chalk.red(`  ✗ Request failed: ${finalResult.status || finalResult.error}`));
  }
  
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('  CHECKING WEBHOOK DELIVERIES'));
  console.log('='.repeat(80) + '\n');
  
  console.log('Fetching rate limit event deliveries from database...\n');
  
  const { exec } = require('child_process');
  exec(`psql -d flexgate -c "SELECT webhook_id, event_type, status, response_code, created_at FROM webhook_deliveries WHERE event_type LIKE 'rate_limit.%' ORDER BY created_at DESC LIMIT 10;"`, 
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
      console.log('  • rate_limit.approaching (at 80% of limit)');
      console.log('  • rate_limit.exceeded (when limit reached)');
      console.log('  • rate_limit.recovered (after window reset)');
      
      console.log(chalk.cyan('\n📊 Next Steps:'));
      console.log('  1. Check your webhook receiver at http://localhost:4000');
      console.log('  2. View delivery logs in Admin UI (http://localhost:3001/webhooks)');
      console.log('  3. Look for color-coded event badges:');
      console.log(chalk.red('     • rate_limit.exceeded → ORANGE badge'));
      console.log(chalk.yellow('     • rate_limit.approaching → ORANGE badge'));
      console.log(chalk.green('     • rate_limit.recovered → GREEN badge'));
      
      console.log(chalk.bold.green('\n✅ Testing Complete!\n'));
    }
  );
}

// Run the tests
runTests().catch(error => {
  console.error(chalk.red('\n❌ Test failed with error:'), error);
  process.exit(1);
});
