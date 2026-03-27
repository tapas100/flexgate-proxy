/**
 * Unified Metrics Processor with WASM + Web Worker support
 * Automatically chooses best available processing method:
 * 1. WASM (fastest - 10-20x)
 * 2. Web Worker (fast - 2-3x)
 * 3. JavaScript (fallback - 1x)
 */

import {
  TimeSeriesPoint,
  ProcessedMetrics,
  processTimeSeriesWorker,
  calculatePercentilesWorker,
  processTimeSeriesSync,
  isWorkerSupported,
  initWorkerPool,
} from './workerMetricsProcessor';

// WASM module - now imported properly so Webpack can bundle it
// @ts-ignore - WASM types are in separate .d.ts file
import wasmInit from '../wasm/metrics_processor.js';

// Try to import WASM module (will be available after build)
let wasmModule: any = null;
let wasmLoaded = false;

/**
 * Processing method enum
 */
export enum ProcessingMethod {
  WASM = 'wasm',
  WORKER = 'worker',
  SYNC = 'sync',
}

/**
 * Initialize WASM module (call once on app startup)
 */
export async function initWasmProcessor(): Promise<boolean> {
  if (wasmLoaded) return true;

  try {
    console.log('🔄 Initializing WASM module...');
    
    // Initialize the WASM module (Webpack bundles this properly)
    await wasmInit();
    
    // Import the WASM module classes
    const { MetricsProcessor } = await import('../wasm/metrics_processor.js');
    
    wasmModule = { MetricsProcessor };
    wasmLoaded = true;
    
    console.log('✅ WASM metrics processor loaded successfully!');
    return true;
  } catch (error) {
    console.warn('⚠️  WASM initialization failed:', error);
    wasmLoaded = false;
    return false;
  }
}

/**
 * Initialize all processors (WASM + Worker)
 */
export async function initProcessors(): Promise<void> {
  // Try WASM first
  await initWasmProcessor().catch(() => {});
  
  // Initialize Web Worker
  if (isWorkerSupported()) {
    await initWorkerPool().catch(() => {});
  }
}

/**
 * Check which processing method is available
 */
export function getAvailableMethod(): ProcessingMethod {
  if (wasmLoaded && wasmModule) {
    return ProcessingMethod.WASM;
  }
  if (isWorkerSupported()) {
    return ProcessingMethod.WORKER;
  }
  return ProcessingMethod.SYNC;
}

/**
 * Process time-series data (auto-selects best method)
 */
export async function processTimeSeries(
  points: TimeSeriesPoint[],
  bucketSizeMs: number = 60000,
  maxPoints: number = 200
): Promise<TimeSeriesPoint[]> {
  const method = getAvailableMethod();

  try {
    switch (method) {
      case ProcessingMethod.WASM:
        return await processTimeSeriesWasm(points, bucketSizeMs, maxPoints);
      
      case ProcessingMethod.WORKER:
        return await processTimeSeriesWorker(points, bucketSizeMs, maxPoints);
      
      case ProcessingMethod.SYNC:
      default:
        return processTimeSeriesSync(points, bucketSizeMs, maxPoints);
    }
  } catch (error) {
    console.error(`Processing failed with ${method}, falling back to sync:`, error);
    return processTimeSeriesSync(points, bucketSizeMs, maxPoints);
  }
}

/**
 * Calculate percentiles (auto-selects best method)
 */
export async function calculatePercentiles(
  points: TimeSeriesPoint[]
): Promise<ProcessedMetrics> {
  const method = getAvailableMethod();

  try {
    switch (method) {
      case ProcessingMethod.WASM:
        return await calculatePercentilesWasm(points);
      
      case ProcessingMethod.WORKER:
        return await calculatePercentilesWorker(points);
      
      case ProcessingMethod.SYNC:
      default:
        return calculatePercentilesSync(points);
    }
  } catch (error) {
    console.error(`Percentile calculation failed with ${method}:`, error);
    return calculatePercentilesSync(points);
  }
}

/**
 * WASM implementation: Process time-series
 */
async function processTimeSeriesWasm(
  points: TimeSeriesPoint[],
  bucketSizeMs: number,
  maxPoints: number
): Promise<TimeSeriesPoint[]> {
  if (!wasmModule) {
    throw new Error('WASM module not loaded');
  }

  const processor = new wasmModule.MetricsProcessor();
  const result = processor.process_timeseries(points, bucketSizeMs, maxPoints);
  return result;
}

/**
 * WASM implementation: Calculate percentiles
 */
async function calculatePercentilesWasm(
  points: TimeSeriesPoint[]
): Promise<ProcessedMetrics> {
  if (!wasmModule) {
    throw new Error('WASM module not loaded');
  }

  const processor = new wasmModule.MetricsProcessor();
  const result = processor.calculate_percentiles(points);
  return result;
}

/**
 * Synchronous JavaScript implementation: Calculate percentiles
 */
function calculatePercentilesSync(points: TimeSeriesPoint[]): ProcessedMetrics {
  if (points.length === 0) {
    return {
      aggregated: [],
      p50: 0,
      p95: 0,
      p99: 0,
      avg: 0,
      min: 0,
      max: 0,
      count: 0,
    };
  }

  const values = points.map((p) => p.value).sort((a, b) => a - b);
  const len = values.length;

  const p50Idx = Math.floor(len * 0.5);
  const p95Idx = Math.floor(len * 0.95);
  const p99Idx = Math.floor(len * 0.99);
  const avg = values.reduce((a, b) => a + b, 0) / len;

  return {
    aggregated: points,
    p50: values[p50Idx],
    p95: values[p95Idx],
    p99: values[p99Idx],
    avg,
    min: values[0],
    max: values[len - 1],
    count: len,
  };
}

/**
 * Get performance info
 */
export function getProcessorInfo(): {
  method: ProcessingMethod;
  wasmAvailable: boolean;
  workerAvailable: boolean;
  estimatedSpeedup: string;
} {
  const method = getAvailableMethod();
  
  let speedup = '1x';
  if (method === ProcessingMethod.WASM) speedup = '10-20x';
  if (method === ProcessingMethod.WORKER) speedup = '2-3x';

  return {
    method,
    wasmAvailable: wasmLoaded && wasmModule !== null,
    workerAvailable: isWorkerSupported(),
    estimatedSpeedup: speedup,
  };
}

export type { TimeSeriesPoint, ProcessedMetrics };
export { ProcessingMethod as default };
