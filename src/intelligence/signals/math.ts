// Copyright (c) 2026 Tapas Adhikary. All rights reserved.
// This file is part of the FlexGate Runtime Intelligence Layer.
// Licensed under the Business Source License 1.1 (BUSL-1.1).
// See LICENSE in the project root for full terms.
// Commercial use requires a separate license. Change Date: 2030-04-06.

/**
 * Module 1: Metrics & Signal Engine — Math Utilities
 *
 * ALL calculations live here. Pure functions, no side effects.
 * ⚠️  LLMs must never call these functions. They are deterministic only.
 */

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  if (p <= 0) return sorted[0]!;
  if (p >= 100) return sorted[sorted.length - 1]!;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const frac = index - lower;
  const lo = sorted[lower]!;
  const hi = sorted[upper]!;
  if (lower === upper) return lo;
  return lo + frac * (hi - lo);
}

export function mergeSorted(a: number[], b: number[]): number[] {
  const result: number[] = new Array(a.length + b.length);
  let i = 0, j = 0, k = 0;
  while (i < a.length && j < b.length) {
    if ((a[i] as number) <= (b[j] as number)) result[k++] = a[i++] as number;
    else result[k++] = b[j++] as number;
  }
  while (i < a.length) result[k++] = a[i++] as number;
  while (j < b.length) result[k++] = b[j++] as number;
  return result;
}

export function insertSorted(arr: number[], value: number): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((arr[mid] as number) <= value) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, value);
}

export function truncateSamples(sorted: number[], maxSize: number): number[] {
  if (sorted.length <= maxSize) return sorted;
  const result: number[] = new Array(maxSize);
  const step = (sorted.length - 1) / (maxSize - 1);
  for (let i = 0; i < maxSize; i++) {
    result[i] = sorted[Math.round(i * step)] as number;
  }
  return result;
}

export function arithmeticMean(sum: number, count: number): number {
  if (count === 0) return 0;
  return sum / count;
}

export function rps(requestCount: number, windowSeconds: number): number {
  if (windowSeconds <= 0) return 0;
  return requestCount / windowSeconds;
}

export function errorRate(errorCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return errorCount / totalCount;
}

export function dominanceRatio(topCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return topCount / totalCount;
}

export function toBucketMs(timestampMs: number): number {
  return Math.floor(timestampMs / 1000) * 1000;
}
