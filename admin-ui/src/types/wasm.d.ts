/**
 * Type declarations for WASM module
 * Module will be available after running: cd wasm && ./build.sh
 */

declare module '../../wasm/metrics-processor/pkg' {
  export interface TimeSeriesPoint {
    timestamp: number;
    value: number;
  }

  export interface ProcessedMetrics {
    aggregated: TimeSeriesPoint[];
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    min: number;
    max: number;
    count: number;
  }

  export class MetricsProcessor {
    constructor();
    process_timeseries(
      data: TimeSeriesPoint[],
      bucket_size_ms: number,
      max_points: number
    ): TimeSeriesPoint[];
    calculate_percentiles(data: TimeSeriesPoint[]): ProcessedMetrics;
    aggregate_buckets(
      data: TimeSeriesPoint[],
      bucket_size_ms: number,
      aggregation_type: string
    ): TimeSeriesPoint[];
  }

  export function calculate_percentile(values: number[], percentile: number): number;
  export function moving_average(data: TimeSeriesPoint[], window_size: number): TimeSeriesPoint[];

  export default function init(): Promise<void>;
}
