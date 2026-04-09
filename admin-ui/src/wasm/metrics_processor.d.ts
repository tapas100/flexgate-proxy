/* tslint:disable */
/* eslint-disable */

/**
 * Main metrics processor struct
 */
export class MetricsProcessor {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Aggregate data by buckets with different strategies
     */
    aggregate_buckets(data: any, bucket_size_ms: number, aggregation_type: string): any;
    /**
     * Calculate percentiles and statistics
     *
     * # Arguments
     * * `data` - JSON array of time-series points
     *
     * # Returns
     * ProcessedMetrics with percentiles and stats
     */
    calculate_percentiles(data: any): any;
    /**
     * Create new processor instance
     */
    constructor();
    /**
     * Process time-series data with downsampling
     *
     * # Arguments
     * * `data` - JSON array of time-series points
     * * `bucket_size_ms` - Bucket size in milliseconds
     * * `max_points` - Maximum number of points to return
     *
     * # Returns
     * Downsampled array of time-series points
     */
    process_timeseries(data: any, bucket_size_ms: number, max_points: number): any;
}

/**
 * Standalone function: Fast percentile calculation
 */
export function calculate_percentile(values: Float64Array, percentile: number): number;

/**
 * Standalone function: Moving average
 */
export function moving_average(data: any, window_size: number): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_metricsprocessor_free: (a: number, b: number) => void;
    readonly calculate_percentile: (a: number, b: number, c: number) => number;
    readonly metricsprocessor_aggregate_buckets: (a: number, b: any, c: number, d: number, e: number) => [number, number, number];
    readonly metricsprocessor_calculate_percentiles: (a: number, b: any) => [number, number, number];
    readonly metricsprocessor_new: () => number;
    readonly metricsprocessor_process_timeseries: (a: number, b: any, c: number, d: number) => [number, number, number];
    readonly moving_average: (a: any, b: number) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
