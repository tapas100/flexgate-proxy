# Dashboard WASM Optimization Plan

**Date:** 2026-02-15  
**Issue:** Metrics dashboard takes significant time to load initially  
**Solution:** WebAssembly (WASM) for high-performance data processing

---

## Current Performance Analysis

### Bottlenecks Identified

1. **Large Data Processing** (JavaScript)
   - Recharts processes 1000+ data points in JavaScript
   - Array transformations for time-series data
   - Percentile calculations (p50, p95, p99)
   - Data aggregation and filtering

2. **Chart Rendering** (Recharts)
   - Recharts bundle size: ~118KB (gzipped)
   - SVG rendering for multiple charts
   - Real-time updates trigger re-renders

3. **Initial Bundle Size**
   - Total metrics page bundle: ~200KB+
   - Recharts + dependencies
   - Material-UI components

### Current Load Times (Estimated)

| Metric | Current | Target |
|--------|---------|--------|
| Initial Page Load | 2-3s | <1s |
| Chart Rendering | 200-500ms | <100ms |
| Data Processing | 100-200ms | <20ms |
| Bundle Size | 200KB+ | <150KB |

---

## WASM Optimization Strategy

### Phase 1: WASM Module for Data Processing

**Use Case:** Offload CPU-intensive calculations to WebAssembly

#### 1.1 Create Rust WASM Module

**File:** `admin-ui/wasm/metrics-processor/src/lib.rs`

```rust
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct TimeSeriesPoint {
    timestamp: f64,
    value: f64,
}

#[derive(Serialize, Deserialize)]
pub struct ProcessedMetrics {
    aggregated: Vec<TimeSeriesPoint>,
    p50: f64,
    p95: f64,
    p99: f64,
    avg: f64,
    min: f64,
    max: f64,
}

#[wasm_bindgen]
pub struct MetricsProcessor;

#[wasm_bindgen]
impl MetricsProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> MetricsProcessor {
        MetricsProcessor
    }

    /// Process time-series data with aggregation
    /// Returns downsampled data for efficient chart rendering
    #[wasm_bindgen]
    pub fn process_timeseries(
        &self,
        data: &JsValue,
        bucket_size_ms: f64,
        max_points: usize,
    ) -> Result<JsValue, JsValue> {
        let points: Vec<TimeSeriesPoint> = serde_wasm_bindgen::from_value(data.clone())?;
        
        // Downsample using aggregation buckets
        let aggregated = Self::downsample(&points, bucket_size_ms, max_points);
        
        Ok(serde_wasm_bindgen::to_value(&aggregated)?)
    }

    /// Calculate percentiles (p50, p95, p99) efficiently
    #[wasm_bindgen]
    pub fn calculate_percentiles(&self, data: &JsValue) -> Result<JsValue, JsValue> {
        let points: Vec<TimeSeriesPoint> = serde_wasm_bindgen::from_value(data.clone())?;
        
        let mut values: Vec<f64> = points.iter().map(|p| p.value).collect();
        values.sort_by(|a, b| a.partial_cmp(b).unwrap());
        
        let len = values.len();
        if len == 0 {
            return Ok(serde_wasm_bindgen::to_value(&ProcessedMetrics {
                aggregated: vec![],
                p50: 0.0,
                p95: 0.0,
                p99: 0.0,
                avg: 0.0,
                min: 0.0,
                max: 0.0,
            })?);
        }

        let p50_idx = (len as f64 * 0.50) as usize;
        let p95_idx = (len as f64 * 0.95) as usize;
        let p99_idx = (len as f64 * 0.99) as usize;

        let avg = values.iter().sum::<f64>() / len as f64;
        
        let result = ProcessedMetrics {
            aggregated: points,
            p50: values[p50_idx],
            p95: values[p95_idx],
            p99: values[p99_idx],
            avg,
            min: values[0],
            max: values[len - 1],
        };

        Ok(serde_wasm_bindgen::to_value(&result)?)
    }

    /// Aggregate metrics over time buckets
    fn downsample(
        points: &[TimeSeriesPoint],
        bucket_size_ms: f64,
        max_points: usize,
    ) -> Vec<TimeSeriesPoint> {
        if points.len() <= max_points {
            return points.to_vec();
        }

        let mut buckets: Vec<Vec<f64>> = Vec::new();
        let mut bucket_timestamps: Vec<f64> = Vec::new();

        let start_time = points.first().map(|p| p.timestamp).unwrap_or(0.0);
        let end_time = points.last().map(|p| p.timestamp).unwrap_or(0.0);

        let num_buckets = ((end_time - start_time) / bucket_size_ms).ceil() as usize;
        let num_buckets = num_buckets.min(max_points);

        for i in 0..num_buckets {
            buckets.push(Vec::new());
            bucket_timestamps.push(start_time + (i as f64) * bucket_size_ms);
        }

        for point in points {
            let bucket_idx = ((point.timestamp - start_time) / bucket_size_ms) as usize;
            if bucket_idx < num_buckets {
                buckets[bucket_idx].push(point.value);
            }
        }

        buckets
            .iter()
            .enumerate()
            .filter(|(_, values)| !values.is_empty())
            .map(|(idx, values)| {
                let avg = values.iter().sum::<f64>() / values.len() as f64;
                TimeSeriesPoint {
                    timestamp: bucket_timestamps[idx],
                    value: avg,
                }
            })
            .collect()
    }
}
```

**File:** `admin-ui/wasm/metrics-processor/Cargo.toml`

```toml
[package]
name = "metrics-processor"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1.0", features = ["derive"] }
serde-wasm-bindgen = "0.6"
serde_json = "1.0"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
```

---

### Phase 2: TypeScript Integration Layer

**File:** `admin-ui/src/utils/wasmMetricsProcessor.ts`

```typescript
import { TimeSeriesPoint, ProcessedMetrics } from '../types';

let wasmModule: any = null;
let wasmLoaded = false;

/**
 * Initialize WASM module (call once on app startup)
 */
export async function initWasmProcessor(): Promise<void> {
  if (wasmLoaded) return;

  try {
    // Dynamic import for code splitting
    const wasm = await import('../../wasm/metrics-processor/pkg');
    await wasm.default(); // Initialize WASM
    wasmModule = new wasm.MetricsProcessor();
    wasmLoaded = true;
    console.log('✅ WASM metrics processor loaded');
  } catch (error) {
    console.error('❌ Failed to load WASM module:', error);
    wasmLoaded = false;
  }
}

/**
 * Check if WASM is available, fallback to JavaScript
 */
export function isWasmAvailable(): boolean {
  return wasmLoaded && wasmModule !== null;
}

/**
 * Process time-series data with WASM (or fallback to JS)
 */
export function processTimeSeries(
  data: TimeSeriesPoint[],
  bucketSizeMs: number = 60000, // 1 minute buckets
  maxPoints: number = 200 // Limit chart points
): TimeSeriesPoint[] {
  if (!isWasmAvailable()) {
    // JavaScript fallback
    return downsampleJavaScript(data, bucketSizeMs, maxPoints);
  }

  try {
    const result = wasmModule.process_timeseries(data, bucketSizeMs, maxPoints);
    return result;
  } catch (error) {
    console.error('WASM processing failed, falling back to JS:', error);
    return downsampleJavaScript(data, bucketSizeMs, maxPoints);
  }
}

/**
 * Calculate percentiles with WASM (or fallback to JS)
 */
export function calculatePercentiles(
  data: TimeSeriesPoint[]
): ProcessedMetrics {
  if (!isWasmAvailable()) {
    return calculatePercentilesJavaScript(data);
  }

  try {
    const result = wasmModule.calculate_percentiles(data);
    return result;
  } catch (error) {
    console.error('WASM percentile calculation failed:', error);
    return calculatePercentilesJavaScript(data);
  }
}

/**
 * JavaScript fallback for downsampling
 */
function downsampleJavaScript(
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
 * JavaScript fallback for percentile calculation
 */
function calculatePercentilesJavaScript(
  points: TimeSeriesPoint[]
): ProcessedMetrics {
  const values = points.map((p) => p.value).sort((a, b) => a - b);
  const len = values.length;

  if (len === 0) {
    return {
      aggregated: [],
      p50: 0,
      p95: 0,
      p99: 0,
      avg: 0,
      min: 0,
      max: 0,
    };
  }

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
  };
}
```

---

### Phase 3: Optimize Chart Components

**File:** `admin-ui/src/components/Charts/RequestRateChartWasm.tsx`

```typescript
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Paper, Typography } from '@mui/material';
import { TimeSeriesMetric } from '../../types';
import { formatTimestamp } from '../../utils/metricsHelpers';
import { processTimeSeries, isWasmAvailable } from '../../utils/wasmMetricsProcessor';

interface RequestRateChartProps {
  data: TimeSeriesMetric;
  height?: number;
  maxPoints?: number;
}

const RequestRateChartWasm: React.FC<RequestRateChartProps> = ({ 
  data, 
  height = 300,
  maxPoints = 200 
}) => {
  // Use WASM to process and downsample data
  const chartData = useMemo(() => {
    const processed = processTimeSeries(data?.data || [], 60000, maxPoints);
    return processed.map((point) => ({
      time: point.timestamp,
      value: point.value,
    }));
  }, [data, maxPoints]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Request Rate {isWasmAvailable() && <span style={{ fontSize: '10px', color: '#4caf50' }}>⚡ WASM</span>}
      </Typography>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tickFormatter={(timestamp) => formatTimestamp(timestamp, 'HH:mm')}
            stroke="#666"
          />
          <YAxis
            label={{ value: data.unit, angle: -90, position: 'insideLeft' }}
            stroke="#666"
          />
          <Tooltip
            labelFormatter={(timestamp) => formatTimestamp(timestamp as number)}
            formatter={(value: number | undefined) => [value?.toFixed(1) || '0', 'Requests/sec']}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#1976d2"
            strokeWidth={2}
            dot={false}
            name="Request Rate"
            isAnimationActive={false} // Disable animation for performance
          />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default React.memo(RequestRateChartWasm);
```

---

### Phase 4: App Initialization

**File:** `admin-ui/src/App.tsx` (Add WASM initialization)

```typescript
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { initWasmProcessor } from './utils/wasmMetricsProcessor';
// ... other imports

function App() {
  useEffect(() => {
    // Initialize WASM module on app startup
    initWasmProcessor().catch(console.error);
  }, []);

  return (
    <Router>
      {/* ... routes */}
    </Router>
  );
}

export default App;
```

---

## Build Configuration

### Step 1: Install Rust & wasm-pack

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Add wasm32 target
rustup target add wasm32-unknown-unknown
```

### Step 2: Build WASM Module

**File:** `admin-ui/wasm/build.sh`

```bash
#!/bin/bash
set -e

echo "🔨 Building WASM metrics processor..."

cd "$(dirname "$0")/metrics-processor"

# Build with optimizations
wasm-pack build --target web --release --out-dir pkg

# Copy to React public folder for easier import
cp -r pkg ../../public/wasm/

echo "✅ WASM module built successfully!"
echo "📦 Output: admin-ui/public/wasm/pkg/"
```

### Step 3: Update package.json

**File:** `admin-ui/package.json`

```json
{
  "scripts": {
    "wasm:build": "cd wasm && ./build.sh",
    "prebuild": "npm run wasm:build",
    "start": "npm run wasm:build && react-scripts start",
    "build": "react-scripts build"
  },
  "devDependencies": {
    "@types/react-router-dom": "^5.3.3"
  }
}
```

---

## Alternative: Web Workers for Data Processing

If WASM is too complex, use Web Workers instead:

**File:** `admin-ui/src/workers/metricsProcessor.worker.ts`

```typescript
// Web Worker for CPU-intensive metrics processing
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'PROCESS_TIMESERIES':
      const { points, bucketSize, maxPoints } = data;
      const processed = downsample(points, bucketSize, maxPoints);
      self.postMessage({ type: 'PROCESSED', data: processed });
      break;

    case 'CALCULATE_PERCENTILES':
      const metrics = calculatePercentiles(data.points);
      self.postMessage({ type: 'PERCENTILES', data: metrics });
      break;

    default:
      console.error('Unknown worker message type:', type);
  }
});

function downsample(points: any[], bucketSizeMs: number, maxPoints: number): any[] {
  // Same logic as JavaScript fallback
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

function calculatePercentiles(points: any[]): any {
  const values = points.map((p) => p.value).sort((a, b) => a - b);
  const len = values.length;

  if (len === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  }

  return {
    p50: values[Math.floor(len * 0.5)],
    p95: values[Math.floor(len * 0.95)],
    p99: values[Math.floor(len * 0.99)],
    avg: values.reduce((a, b) => a + b, 0) / len,
    min: values[0],
    max: values[len - 1],
  };
}
```

**Usage in React:**

```typescript
const worker = new Worker(new URL('../workers/metricsProcessor.worker.ts', import.meta.url));

worker.postMessage({ type: 'PROCESS_TIMESERIES', data: { points, bucketSize, maxPoints } });

worker.addEventListener('message', (event) => {
  if (event.data.type === 'PROCESSED') {
    setProcessedData(event.data.data);
  }
});
```

---

## Performance Improvements Expected

| Optimization | Impact | Load Time Reduction |
|--------------|--------|---------------------|
| WASM Data Processing | High | 100-150ms saved |
| Downsampling (200 pts max) | High | 100ms saved |
| React.memo for Charts | Medium | 50ms saved |
| Disable Chart Animations | Low | 20ms saved |
| Code Splitting (lazy load) | Medium | 200ms saved |
| **Total Improvement** | **~500ms** | **2s → 1.5s** |

### Benchmarks (Projected)

**Current (JavaScript):**
- Process 1000 data points: ~150ms
- Calculate percentiles: ~50ms
- Render 5 charts: ~300ms
- **Total: ~500ms**

**With WASM:**
- Process 1000 data points: ~15ms (10x faster)
- Calculate percentiles: ~5ms (10x faster)
- Render 5 charts: ~100ms (downsampled)
- **Total: ~120ms** (4x faster)

---

## Implementation Timeline

### Phase 1: Quick Wins (1 day)
- ✅ Add React.memo to chart components
- ✅ Disable chart animations
- ✅ Downsample data to 200 points max
- ✅ Add useMemo for data transformations

### Phase 2: Web Workers (2 days)
- ⬜ Create Web Worker for data processing
- ⬜ Move percentile calculations to worker
- ⬜ Update chart components to use worker data

### Phase 3: WASM Module (5 days)
- ⬜ Set up Rust WASM project
- ⬜ Implement data processing in Rust
- ⬜ Build WASM module
- ⬜ Create TypeScript bindings
- ⬜ Integrate with React app
- ⬜ Add fallback to JavaScript

### Phase 4: Testing & Optimization (2 days)
- ⬜ Performance benchmarking
- ⬜ Browser compatibility testing
- ⬜ Bundle size analysis
- ⬜ Add performance monitoring

**Total Timeline: ~10 days**

---

## Alternative Solutions (Non-WASM)

### 1. Code Splitting & Lazy Loading

```typescript
// Lazy load Metrics page
const Metrics = React.lazy(() => import('./pages/Metrics'));

<Suspense fallback={<CircularProgress />}>
  <Routes>
    <Route path="/metrics" element={<Metrics />} />
  </Routes>
</Suspense>
```

### 2. Virtual Scrolling for Large Datasets

```typescript
import { FixedSizeList } from 'react-window';

// Only render visible chart data
<FixedSizeList
  height={400}
  itemCount={chartData.length}
  itemSize={50}
  width="100%"
>
  {/* Render row */}
</FixedSizeList>
```

### 3. Server-Side Aggregation

```typescript
// Backend pre-processes data
GET /api/metrics?range=24h&resolution=1m&maxPoints=200

// Returns already downsampled data
{
  "requestRate": {
    "data": [ /* 200 points instead of 10,000 */ ]
  }
}
```

---

## Recommendation

**For Immediate Impact (This Week):**
1. ✅ Add downsampling (JS) - 30 minutes
2. ✅ Add React.memo to charts - 15 minutes
3. ✅ Disable animations - 5 minutes
4. ✅ Add useMemo for transformations - 20 minutes

**For Long-Term (Next Sprint):**
1. ⬜ Implement Web Workers - 2 days
2. ⬜ Add WASM module - 5 days (optional)

**Quick Win Implementation:** Start with JavaScript optimizations today, then progressively enhance with WASM.

---

## Next Steps

1. **Today:** Implement Phase 1 quick wins
2. **This Week:** Create Web Worker version
3. **Next Week:** WASM proof-of-concept
4. **Measure:** Add performance monitoring to track improvements

---

**Status:** 📝 Ready for Implementation  
**Priority:** HIGH  
**Complexity:** Medium (Quick wins), High (WASM)
