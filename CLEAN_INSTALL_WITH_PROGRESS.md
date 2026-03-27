# Clean Install with Live Progress Tracking

## Overview

The Clean Install feature now includes **real-time progress tracking** using Server-Sent Events (SSE), ensuring the Admin UI remains functional throughout the installation process.

## Key Improvements

### ✅ Admin UI Stays Running
- **Before**: Clean Install would delete `admin-ui/node_modules`, breaking the UI
- **After**: Only backend dependencies are removed, UI stays accessible

### ✅ Real-Time Progress Updates
- Live installation logs stream to the UI
- Progress bar shows completion percentage
- Step-by-step visibility into what's happening

### ✅ Better User Experience
- Users can see exactly what's being installed
- No confusion about whether the process is stuck
- Clear success/failure messaging

## How It Works

### Backend (Server-Sent Events)

**Endpoint**: `GET /api/troubleshooting/clean-install/stream?password=<admin_password>`

The backend uses SSE to stream installation progress:

```typescript
// Spawn the bash script
executeScriptWithStreaming(
  'clean-install.sh',
  (data: string) => {
    // Send each log line to the client
    res.write(`data: ${JSON.stringify({
      type: 'progress',
      step: currentStep,
      totalSteps: 10,
      progress: Math.round((currentStep / 10) * 100),
      message: data,
    })}\n\n`);
  },
  (exitCode: number) => {
    // Send completion message
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: exitCode === 0,
      exitCode,
      message: exitCode === 0 ? '✅ Installation completed' : '❌ Installation failed',
    })}\n\n`);
    res.end();
  }
);
```

### Frontend (EventSource)

The Admin UI connects to the SSE stream:

```tsx
const eventSource = new EventSource(
  `/api/troubleshooting/clean-install/stream?password=${password}`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'progress':
      setInstallProgress(data.progress);
      setInstallLogs(prev => [...prev, data.message]);
      break;
      
    case 'complete':
      setInstallComplete(true);
      setInstallSuccess(data.success);
      break;
  }
};
```

## What Gets Cleaned

### ✅ Backend Only
- `/node_modules` (root dependencies)
- `/dist` (compiled backend)
- `/package-lock.json`
- npm cache

### ❌ NOT Touched
- `/admin-ui/node_modules` (UI stays running)
- `/admin-ui/build` (UI stays accessible)
- Database data (PostgreSQL, Redis)
- Configuration files

## Installation Steps (10 Total)

The script performs these steps in order:

1. **Stop Services**: Kill backend processes
2. **Remove Containers**: Clean old Docker/Podman containers
3. **Clean Backend Dependencies**: Remove `node_modules`, `package-lock.json`
4. **Clean Build Artifacts**: Remove `dist` folder
5. **Clean npm Cache**: Clear npm cache
6. **Install Root Dependencies**: `npm install` (~5 minutes)
7. **Skip Admin UI**: Keep UI dependencies intact
8. **Build Backend**: `npm run build`
9. **Skip Admin UI Build**: Keep UI build intact
10. **Start Databases**: Bring up PostgreSQL and Redis

## Progress Dialog UI

The progress dialog shows:

### Header
- ⏳ "Installing Backend Dependencies..." (during installation)
- ✅ "Clean Installation Complete" (on success)
- ❌ "Installation Failed" (on error)

### Progress Bar
- Percentage complete (0-100%)
- Linear progress bar with percentage label
- Note: "The Admin UI will remain accessible during installation"

### Live Logs
- Terminal-style output (dark background, monospace font)
- Auto-scrolling log viewer
- Each line from the bash script appears in real-time

### Actions
- "Please wait..." button (disabled during installation)
- "Close" button (enabled when complete)

## Security

- Requires admin password verification
- Password passed as query parameter in SSE endpoint
- Same `admin123` password as other destructive operations

## Usage

1. Navigate to **Troubleshooting** page
2. Click **"Clean Install"** button
3. Enter admin password in dialog
4. Watch live progress in modal dialog
5. Wait for completion (typically 5-7 minutes)
6. Click "Close" when done

## Benefits

### For Users
- **Transparency**: See exactly what's happening
- **No Confusion**: Progress bar shows it's not stuck
- **Accessibility**: UI remains functional throughout
- **Confidence**: Live logs show installation is progressing

### For Developers
- **Debugging**: Easy to see where installation fails
- **Monitoring**: Real-time visibility into npm install
- **Flexibility**: Can extend to other long-running operations

## Future Enhancements

Possible improvements:

- [ ] Add pause/resume capability
- [ ] Allow cancellation mid-installation
- [ ] Show estimated time remaining
- [ ] Add email notification on completion
- [ ] Extend to other operations (Nuclear Reset, Auto-Recovery)
- [ ] Add installation history/logs

## Technical Details

### SSE vs WebSockets

We chose Server-Sent Events because:
- ✅ One-way communication (server → client)
- ✅ Auto-reconnection built-in
- ✅ Simpler than WebSockets
- ✅ Works through HAProxy easily
- ✅ No need for bidirectional communication

### Error Handling

- Network errors: Dialog shows "Connection error" message
- Script failures: Shows failed step and exit code
- Timeout: SSE connection has no explicit timeout
- Client disconnect: Server cleans up resources

## Files Modified

1. **`/scripts/troubleshooting/clean-install.sh`**
   - Removed `admin-ui/node_modules` deletion
   - Removed `admin-ui/build` deletion
   - Added notes explaining why UI is preserved

2. **`/routes/troubleshooting.ts`**
   - Added `executeScriptWithStreaming()` helper
   - Added `GET /clean-install/stream` SSE endpoint
   - Streams bash script output in real-time

3. **`/admin-ui/src/pages/Troubleshooting.tsx`**
   - Added progress dialog state management
   - Implemented EventSource for SSE consumption
   - Added progress bar and live log viewer
   - Updated descriptions to mention backend-only cleaning

## Testing

```bash
# Test the SSE endpoint directly
curl -N http://localhost:8081/api/troubleshooting/clean-install/stream?password=admin123

# Expected output: stream of JSON events
data: {"type":"connected","message":"🔌 Connected to installation stream"}

data: {"type":"progress","step":1,"totalSteps":10,"progress":10,"message":"📛 Step 1/10: Stopping services..."}

data: {"type":"progress","step":2,"totalSteps":10,"progress":20,"message":"🗑️  Step 2/10: Removing old containers..."}

...

data: {"type":"complete","success":true,"exitCode":0,"message":"✅ Clean installation completed successfully!"}
```

## Conclusion

The Clean Install feature is now much more user-friendly with:
- ✅ Real-time progress visibility
- ✅ UI remains functional throughout
- ✅ Clear success/failure messaging
- ✅ Professional progress tracking

This provides a better experience for users who were previously left wondering if the installation was frozen or still running.
