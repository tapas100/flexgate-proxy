# Dashboard Multiple Re-render Fix

## 🐛 Problem Identified

The Dashboard page was rendering multiple times due to several issues in the `useJetStream` hook and Dashboard component:

### Root Causes:

1. **Callback Dependency Chain** - The `useJetStream` hook had circular dependencies:
   - Inline callback functions in Dashboard were recreated on every render
   - This caused the hook's `useEffect` to re-run unnecessarily
   - Each re-run triggered reconnection to EventSource

2. **Missing Callback Memoization** - Dashboard passed these callbacks without memoization:
   ```tsx
   onError: (err) => console.error('Stream error:', err),
   onConnect: () => console.log('Dashboard stream connected'),
   onDisconnect: () => console.log('Dashboard stream disconnected'),
   ```

3. **No Mount Guard** - The hook didn't check if component was still mounted before state updates

## ✅ Solutions Implemented

### 1. Fixed `useJetStream` Hook (`/admin-ui/src/hooks/useJetStream.ts`)

**Changes:**
- ✅ Added `mountedRef` to track component lifecycle
- ✅ Created `useRef` for callbacks (`onErrorRef`, `onConnectRef`, `onDisconnectRef`)
- ✅ Updated refs in separate `useEffect` to avoid recreating `connect` function
- ✅ Added mount guards before all state updates
- ✅ Reduced dependencies in `connect` callback from 6 to 3 (url, reconnectInterval, cleanup)

**Before:**
```tsx
const connect = useCallback(() => {
  cleanup();
  // ... uses onError, onConnect, onDisconnect directly
}, [url, reconnectInterval, onError, onConnect, onDisconnect, cleanup]);
```

**After:**
```tsx
const onErrorRef = useRef(onError);
const onConnectRef = useRef(onConnect);
const onDisconnectRef = useRef(onDisconnect);

useEffect(() => {
  onErrorRef.current = onError;
  // ... update refs
}, [onError, onConnect, onDisconnect]);

const connect = useCallback(() => {
  if (!mountedRef.current) return;
  cleanup();
  // ... uses onErrorRef.current instead
}, [url, reconnectInterval, cleanup]);
```

### 2. Fixed Dashboard Component (`/admin-ui/src/pages/Dashboard.tsx`)

**Changes:**
- ✅ Wrapped callbacks in `useCallback` to prevent recreation
- ✅ Added render counter for debugging
- ✅ Stable callback references passed to `useJetStream`

**Before:**
```tsx
const { data: metricsData, connected, error } = useJetStream({
  url: '/api/stream/metrics',
  onError: (err) => console.error('Stream error:', err), // New function every render!
  onConnect: () => console.log('Dashboard stream connected'),
  onDisconnect: () => console.log('Dashboard stream disconnected'),
});
```

**After:**
```tsx
const handleError = useCallback((err: Error) => {
  console.error('Stream error:', err);
}, []);

const handleConnect = useCallback(() => {
  console.log('Dashboard stream connected');
}, []);

const handleDisconnect = useCallback(() => {
  console.log('Dashboard stream disconnected');
}, []);

const { data: metricsData, connected, error } = useJetStream({
  url: '/api/stream/metrics',
  onError: handleError, // Same reference every render ✅
  onConnect: handleConnect,
  onDisconnect: handleDisconnect,
});
```

### 3. Added Debug Logging

Added render counter to track re-renders:
```tsx
const renderCount = useRef(0);
useEffect(() => {
  renderCount.current += 1;
  console.log(`🔄 Dashboard render #${renderCount.current}`);
});
```

## 📊 Expected Results

### Before Fix:
- Dashboard rendered multiple times (5-10+ renders on mount)
- EventSource reconnection loops
- Console logs showed repeated "Connected to JetStream" messages

### After Fix:
- Dashboard renders 2-3 times maximum on mount (normal React behavior)
  - Initial render
  - Data fetch/connection state update
  - First data arrival
- Stable EventSource connection
- No unnecessary reconnections

## 🧪 How to Verify

1. **Open the admin UI** at http://localhost:3001
2. **Navigate to Dashboard**
3. **Check browser console** - you should see:
   ```
   🔄 Dashboard render #1
   🔄 Dashboard render #2
   ✅ Connected to JetStream
   Stream connection confirmed. Client ID: xxx
   🔄 Dashboard render #3  (when data arrives)
   ```

4. **Monitor console** - After initial renders, no more "Dashboard render #X" messages unless:
   - New data arrives from stream (expected)
   - User interacts with UI
   - Route changes

## 🔍 Additional Optimizations

If you still see excessive re-renders, check:

1. **Parent component re-renders** - Check if Layout or ProtectedRoute is re-rendering
2. **Context providers** - If using React Context, ensure values are memoized
3. **React DevTools Profiler** - Use to identify which props/state are changing

## 📝 Files Modified

- `/admin-ui/src/hooks/useJetStream.ts` - Fixed hook dependencies and added mount guards
- `/admin-ui/src/pages/Dashboard.tsx` - Memoized callbacks and added debug logging

## ✅ Status

- **TypeScript compilation**: ✅ No errors
- **Hook optimization**: ✅ Complete
- **Component optimization**: ✅ Complete
- **Debug logging**: ✅ Added
- **Ready to test**: ✅ Yes

## 🚀 Next Steps

1. Restart the admin UI dev server if needed
2. Test Dashboard page and monitor console
3. Verify render count stays low (2-3 initial renders)
4. Remove debug logging once verified (optional)
