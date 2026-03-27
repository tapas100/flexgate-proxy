/**
 * Web Worker-based metrics processor
 * High-performance data processing without blocking UI
 */

interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

interface ProcessedMetrics {
  aggregated: TimeSeriesPoint[];
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  count?: number; // Optional for backward compatibility
}

type WorkerTask = {
  id: string;
  resolve: (data: any) => void;
  reject: (error: Error) => void;
};

class MetricsWorkerPool {
  private worker: Worker | null = null;
  private pendingTasks: Map<string, WorkerTask> = new Map();
  private taskIdCounter = 0;
  private isInitialized = false;

  /**
   * Initialize the worker
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create worker from separate file
      this.worker = new Worker(
        new URL('../workers/metricsProcessor.worker.ts', import.meta.url),
        { type: 'module' }
      );

      // Set up message handler
      this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
      this.worker.addEventListener('error', this.handleWorkerError.bind(this));

      this.isInitialized = true;
      console.log('✅ Metrics Worker initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Metrics Worker:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const { type, id, data, error } = event.data;

    const task = this.pendingTasks.get(id);
    if (!task) {
      console.warn(`Received response for unknown task ID: ${id}`);
      return;
    }

    this.pendingTasks.delete(id);

    if (type === 'ERROR') {
      task.reject(new Error(error || 'Worker processing failed'));
    } else {
      task.resolve(data);
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Worker error:', error);
    
    // Reject all pending tasks
    this.pendingTasks.forEach((task) => {
      task.reject(new Error('Worker error: ' + error.message));
    });
    this.pendingTasks.clear();
  }

  /**
   * Send task to worker and return promise
   */
  private async sendTask(type: string, data: any): Promise<any> {
    if (!this.worker) {
      await this.init();
    }

    const taskId = `task-${++this.taskIdCounter}`;

    return new Promise((resolve, reject) => {
      this.pendingTasks.set(taskId, { id: taskId, resolve, reject });

      this.worker!.postMessage({
        type,
        id: taskId,
        data,
      });
    });
  }

  /**
   * Process time-series data with downsampling
   */
  async processTimeSeries(
    points: TimeSeriesPoint[],
    bucketSizeMs: number = 60000,
    maxPoints: number = 200
  ): Promise<TimeSeriesPoint[]> {
    return this.sendTask('PROCESS_TIMESERIES', {
      points,
      bucketSize: bucketSizeMs,
      maxPoints,
    });
  }

  /**
   * Calculate percentiles
   */
  async calculatePercentiles(
    points: TimeSeriesPoint[]
  ): Promise<ProcessedMetrics> {
    return this.sendTask('CALCULATE_PERCENTILES', { points });
  }

  /**
   * Aggregate by buckets
   */
  async aggregateByBuckets(
    points: TimeSeriesPoint[],
    bucketSizeMs: number,
    aggregationType: 'avg' | 'sum' | 'max' | 'min' | 'count' = 'avg'
  ): Promise<TimeSeriesPoint[]> {
    return this.sendTask('AGGREGATE_BUCKETS', {
      points,
      bucketSize: bucketSizeMs,
      aggregationType,
    });
  }

  /**
   * Terminate worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.pendingTasks.clear();
      console.log('🛑 Metrics Worker terminated');
    }
  }

  /**
   * Check if worker is available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.worker !== null;
  }
}

// Singleton instance
let workerPool: MetricsWorkerPool | null = null;

/**
 * Get or create worker pool instance
 */
export function getWorkerPool(): MetricsWorkerPool {
  if (!workerPool) {
    workerPool = new MetricsWorkerPool();
  }
  return workerPool;
}

/**
 * Initialize worker pool on app startup
 */
export async function initWorkerPool(): Promise<void> {
  const pool = getWorkerPool();
  await pool.init();
}

/**
 * Process time-series data using worker
 */
export async function processTimeSeriesWorker(
  points: TimeSeriesPoint[],
  bucketSizeMs: number = 60000,
  maxPoints: number = 200
): Promise<TimeSeriesPoint[]> {
  const pool = getWorkerPool();
  
  if (!pool.isAvailable()) {
    await pool.init();
  }

  return pool.processTimeSeries(points, bucketSizeMs, maxPoints);
}

/**
 * Calculate percentiles using worker
 */
export async function calculatePercentilesWorker(
  points: TimeSeriesPoint[]
): Promise<ProcessedMetrics> {
  const pool = getWorkerPool();
  
  if (!pool.isAvailable()) {
    await pool.init();
  }

  return pool.calculatePercentiles(points);
}

/**
 * JavaScript fallback for browsers without worker support
 */
export function processTimeSeriesSync(
  points: TimeSeriesPoint[],
  bucketSizeMs: number,
  maxPoints: number
): TimeSeriesPoint[] {
  if (points.length <= maxPoints) return points;

  const buckets: { [key: number]: number[] } = {};
  const startTime = points[0]?.timestamp || 0;

  points.forEach((point) => {
    const bucketIdx = Math.floor((point.timestamp - startTime) / bucketSizeMs);
    if (!buckets[bucketIdx]) buckets[bucketIdx] = [];
    buckets[bucketIdx].push(point.value);
  });

  return Object.entries(buckets).map(([idx, values]) => ({
    timestamp: startTime + parseInt(idx) * bucketSizeMs,
    value: values.reduce((a, b) => a + b, 0) / values.length,
  }));
}

/**
 * Check if Web Workers are supported
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

export type { TimeSeriesPoint, ProcessedMetrics };
