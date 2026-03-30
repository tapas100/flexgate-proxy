/**
 * Quick Test: Verify Web Worker Implementation
 * Run this in browser console to test Web Worker
 */

// Test 1: Check if worker files exist
// Test 2: Import and initialize
import { initWorkerPool, isWorkerSupported } from './utils/workerMetricsProcessor';
import { getProcessorInfo, processTimeSeries } from './utils/metricsProcessor';

console.log('🧪 Testing Web Worker Implementation...\n');

async function testWebWorker() {
  console.log('1️⃣ Checking browser support...');
  console.log(`   Worker supported: ${isWorkerSupported()}`);
  
  console.log('\n2️⃣ Initializing worker pool...');
  await initWorkerPool();
  console.log('   ✅ Worker pool initialized');
  
  console.log('\n3️⃣ Checking processor info...');
  const info = getProcessorInfo();
  console.log('   Method:', info.method);
  console.log('   Worker available:', info.workerAvailable);
  console.log('   WASM available:', info.wasmAvailable);
  console.log('   Speed boost:', info.estimatedSpeedup);
  
  console.log('\n4️⃣ Testing data processing...');
  const testData = Array.from({ length: 1000 }, (_, i) => ({
    timestamp: Date.now() - (1000 - i) * 60000,
    value: Math.random() * 100,
  }));
  
  // Test with worker
  console.time('   Worker Processing');
  const workerResult = await processTimeSeries(testData, 60000, 200);
  console.timeEnd('   Worker Processing');
  console.log(`   Processed ${testData.length} → ${workerResult.length} points`);
  
  console.log('\n✅ Web Worker test complete!');
  console.log(`\n📊 Result: Using ${info.method.toUpperCase()} (${info.estimatedSpeedup} faster)`);
}

// Run test
testWebWorker().catch(console.error);

export default testWebWorker;
