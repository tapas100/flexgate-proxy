#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');

const PROXY_URL = 'http://localhost:3000';

console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════════════════════╗'));
console.log(chalk.bold.cyan('║              CONFIG EVENT EMISSIONS TEST                                    ║'));
console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════════════════╝\n'));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
  console.log(chalk.bold('Testing all config events:\n'));
  
  // TEST 1: config.validation_failed
  console.log(chalk.bold('='.repeat(80)));
  console.log(chalk.bold('TEST 1: config.validation_failed'));
  console.log('='.repeat(80) + '\n');
  
  console.log('1.1 Creating route with missing required field...');
  try {
    await axios.post(`${PROXY_URL}/api/routes`, {
      path: '/test',
      // Missing upstream
      methods: ['GET']
    });
    console.log(chalk.yellow('  ⚠ Validation succeeded (unexpected)'));
  } catch (error) {
    if (error.response?.status === 400) {
      console.log(chalk.green('  ✓ Validation failed as expected (400)'));
      console.log(chalk.gray(`    → config.validation_failed event should be emitted`));
    }
  }
  
  await sleep(500);
  
  console.log('\n1.2 Updating route with invalid URL...');
  try {
    await axios.patch(`${PROXY_URL}/api/routes/nonexistent`, {
      upstream: 'not-a-url'
    });
    console.log(chalk.yellow('  ⚠ Update succeeded (unexpected)'));
  } catch (error) {
    if (error.response?.status === 400) {
      console.log(chalk.green('  ✓ Validation failed as expected (400)'));
      console.log(chalk.gray(`    → config.validation_failed event should be emitted`));
    } else if (error.response?.status === 404) {
      console.log(chalk.yellow('  ⚠ Route not found (404) - expected for nonexistent route'));
    }
  }
  
  await sleep(1000);
  
  // TEST 2: config.created
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('TEST 2: config.created'));
  console.log('='.repeat(80) + '\n');
  
  let testRouteId = null;
  console.log('2.1 Creating a valid route...');
  try {
    const response = await axios.post(`${PROXY_URL}/api/routes`, {
      path: '/config-events-test/*',
      upstream: 'https://httpbin.org',
      methods: ['GET', 'POST'],
      stripPath: '/config-events-test',
      description: 'Test route for config.created event'
    });
    
    if (response.status === 201 || response.status === 200) {
      testRouteId = response.data.data.id;
      console.log(chalk.green(`  ✓ Route created: ${testRouteId}`));
      console.log(chalk.gray(`    → config.created event should be emitted`));
    }
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(chalk.yellow('  ⚠ Route already exists (409)'));
    } else {
      console.log(chalk.red(`  ✗ Failed: ${error.message}`));
    }
  }
  
  await sleep(1000);
  
  // TEST 3: config.updated
  if (testRouteId) {
    console.log(chalk.bold('\n' + '='.repeat(80)));
    console.log(chalk.bold('TEST 3: config.updated'));
    console.log('='.repeat(80) + '\n');
    
    console.log('3.1 Updating the route via PATCH...');
    try {
      await axios.patch(`${PROXY_URL}/api/routes/${testRouteId}`, {
        description: 'Updated description to trigger config.updated event'
      });
      console.log(chalk.green('  ✓ Route updated via PATCH'));
      console.log(chalk.gray(`    → config.updated event should be emitted`));
    } catch (error) {
      console.log(chalk.red(`  ✗ PATCH failed: ${error.message}`));
    }
    
    await sleep(500);
    
    console.log('\n3.2 Updating the route via PUT...');
    try {
      await axios.put(`${PROXY_URL}/api/routes/${testRouteId}`, {
        upstream: 'https://jsonplaceholder.typicode.com',
        description: 'Updated upstream to trigger another config.updated event'
      });
      console.log(chalk.green('  ✓ Route updated via PUT'));
      console.log(chalk.gray(`    → config.updated event should be emitted`));
    } catch (error) {
      console.log(chalk.red(`  ✗ PUT failed: ${error.message}`));
    }
    
    await sleep(1000);
    
    // TEST 4: config.deleted
    console.log(chalk.bold('\n' + '='.repeat(80)));
    console.log(chalk.bold('TEST 4: config.deleted'));
    console.log('='.repeat(80) + '\n');
    
    console.log('4.1 Deleting the test route...');
    try {
      await axios.delete(`${PROXY_URL}/api/routes/${testRouteId}`);
      console.log(chalk.green('  ✓ Route deleted'));
      console.log(chalk.gray(`    → config.deleted event should be emitted`));
    } catch (error) {
      console.log(chalk.red(`  ✗ Delete failed: ${error.message}`));
    }
  }
  
  await sleep(2000);
  
  // CHECK RESULTS
  console.log(chalk.bold('\n' + '='.repeat(80)));
  console.log(chalk.bold('CHECKING WEBHOOK DELIVERIES'));
  console.log('='.repeat(80) + '\n');
  
  const { exec } = require('child_process');
  exec(
    'psql -d flexgate -c "SELECT event_type, COUNT(*) as count, status FROM webhook_deliveries WHERE event_type LIKE \'config.%\' AND created_at > NOW() - INTERVAL \'2 minutes\' GROUP BY event_type, status ORDER BY event_type;"',
    (error, stdout) => {
      if (!error) {
        console.log('Config events in database (last 2 minutes):\n');
        console.log(stdout);
      }
      
      console.log(chalk.bold('\n' + '='.repeat(80)));
      console.log(chalk.bold('SUMMARY'));
      console.log('='.repeat(80) + '\n');
      
      console.log(chalk.cyan('Events tested:'));
      console.log(chalk.magenta('  🟣 config.validation_failed') + ' - Purple badge');
      console.log(chalk.blue('  🔵 config.created') + ' - Blue badge');
      console.log(chalk.blue('  🔵 config.updated') + ' - Blue badge');
      console.log(chalk.gray('  ⚫ config.deleted') + ' - Gray badge');
      
      console.log(chalk.cyan('\n📊 View in Admin UI:'));
      console.log('  1. Open: http://localhost:3001/webhooks');
      console.log('  2. Look for webhooks subscribed to config.* events');
      console.log('  3. Click "View Details" to see color-coded badges!');
      
      console.log(chalk.bold.green('\n✅ Testing Complete!\n'));
    }
  );
}

runTests().catch(error => {
  console.error(chalk.red('\n❌ Test failed:'), error.message);
  process.exit(1);
});
