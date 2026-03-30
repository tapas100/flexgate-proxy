#!/usr/bin/env node
/**
 * Standalone Progress Server for Clean Install
 * 
 * Runs independently from main API server
 * Streams installation progress via Server-Sent Events (SSE)
 * Auto-exits after installation completes
 * 
 * Port: 8082
 * Endpoint: GET /stream?password=admin123
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 8082;
const ADMIN_PASSWORD = 'admin123';

// Enable CORS for Admin UI
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

/**
 * SSE Stream Endpoint
 * Spawns clean-install.sh and streams progress
 */
app.get('/stream', (req, res) => {
  const { password } = req.query;

  // Verify admin password
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid admin password'
    });
  }

  console.log('🔌 Client connected - starting clean installation...');

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  sendSSE(res, {
    type: 'connected',
    message: '🔌 Connected to installation stream',
    timestamp: new Date().toISOString()
  });

  // Track progress
  let currentStep = 0;
  const totalSteps = 10;
  let installationLogs = [];

  // Spawn clean-install.sh script
  const scriptPath = path.join(__dirname, 'troubleshooting', 'clean-install.sh');
  const child = spawn('bash', [scriptPath], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, FORCE_COLOR: '0' } // Disable color codes
  });

  console.log(`📦 Spawned clean-install.sh (PID: ${child.pid})`);

  // Process stdout - main output
  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      // Skip npm warnings about always-auth
      if (line.includes('npm warn') && line.includes('always-auth')) {
        return;
      }

      // Parse step number from output
      const stepMatch = line.match(/Step (\d+)\/(\d+):/);
      if (stepMatch) {
        currentStep = parseInt(stepMatch[1], 10);
      }

      // Calculate progress percentage
      const progress = Math.round((currentStep / totalSteps) * 100);

      // Store log
      installationLogs.push(line);

      // Send progress update
      sendSSE(res, {
        type: 'progress',
        step: currentStep,
        totalSteps,
        progress,
        message: line,
        timestamp: new Date().toISOString()
      });
    });
  });

  // Process stderr - error output
  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      // Skip npm warnings
      if (line.includes('npm warn') && line.includes('always-auth')) {
        return;
      }

      const progress = Math.round((currentStep / totalSteps) * 100);
      installationLogs.push(line);

      sendSSE(res, {
        type: 'progress',
        step: currentStep,
        totalSteps,
        progress,
        message: line,
        level: 'error',
        timestamp: new Date().toISOString()
      });
    });
  });

  // Handle process error
  child.on('error', (error) => {
    console.error('❌ Process error:', error);
    
    sendSSE(res, {
      type: 'error',
      message: `Process error: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  });

  // Handle process completion
  child.on('close', async (exitCode) => {
    const success = exitCode === 0;
    
    console.log(`${success ? '✅' : '❌'} Installation ${success ? 'completed' : 'failed'} (exit code: ${exitCode})`);

    // Send completion message
    sendSSE(res, {
      type: 'progress',
      step: 10,
      totalSteps: 10,
      progress: 100,
      message: success 
        ? '✅ Clean installation completed successfully!' 
        : `❌ Installation failed with exit code ${exitCode}`,
      timestamp: new Date().toISOString()
    });

    if (success) {
      // Step 11: Verify services are running
      sendSSE(res, {
        type: 'progress',
        step: 11,
        totalSteps: 11,
        progress: 100,
        message: '🔍 Step 11/11: Verifying all services restarted...',
        timestamp: new Date().toISOString()
      });

      await verifyServicesRunning(res);
    }

    // Send final completion message
    sendSSE(res, {
      type: 'complete',
      success,
      exitCode,
      progress: 100,
      message: success 
        ? '🎉 All services running! Installation complete.' 
        : `❌ Installation failed with exit code ${exitCode}`,
      totalLogs: installationLogs.length,
      timestamp: new Date().toISOString()
    });

    // Close SSE connection
    res.end();

    // Give client time to receive final message, then exit
    setTimeout(() => {
      console.log('👋 Progress server shutting down...');
      process.exit(0);
    }, 2000);
  });

  // Handle client disconnect
  req.on('close', () => {
    console.log('👋 Client disconnected');
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  });
});

/**
 * Helper: Send SSE message
 */
function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Helper: Check if a service is running on a port
 */
async function checkPort(port, _serviceName) {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Helper: Check if API server is healthy
 */
async function checkAPIHealth() {
  try {
    const http = require('http');
    
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 8080,
        path: '/health',
        method: 'GET',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.status === 'healthy');
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  } catch {
    return false;
  }
}

/**
 * Verify all backend services are running
 */
async function verifyServicesRunning(res) {
  const services = [
    { name: 'FlexGate API', port: 8080, checkHealth: true },
    { name: 'HAProxy', port: 8081, checkHealth: false },
    { name: 'PostgreSQL', port: 5432, checkHealth: false },
    { name: 'Redis', port: 6379, checkHealth: false },
    { name: 'NATS', port: 4222, checkHealth: false },
  ];

  let allRunning = true;
  let retryCount = 0;
  const maxRetries = 10; // 10 retries * 2 seconds = 20 seconds max wait

  // Wait for API server to start (it takes a few seconds)
  while (retryCount < maxRetries) {
    const apiRunning = await checkPort(8080, 'FlexGate API');
    
    if (apiRunning) {
      // Wait an additional 2 seconds for it to be fully ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      break;
    }

    retryCount++;
    sendSSE(res, {
      type: 'progress',
      step: 11,
      totalSteps: 11,
      progress: 100,
      message: `⏳ Waiting for API server to start... (${retryCount}/${maxRetries})`,
      timestamp: new Date().toISOString()
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Check each service
  for (const service of services) {
    const isRunning = await checkPort(service.port, service.name);
    
    if (isRunning) {
      // If it's the API server, also check health endpoint
      if (service.checkHealth) {
        const isHealthy = await checkAPIHealth();
        
        if (isHealthy) {
          sendSSE(res, {
            type: 'progress',
            step: 11,
            totalSteps: 11,
            progress: 100,
            message: `✅ ${service.name} is running and healthy (port ${service.port})`,
            timestamp: new Date().toISOString()
          });
        } else {
          sendSSE(res, {
            type: 'progress',
            step: 11,
            totalSteps: 11,
            progress: 100,
            message: `⚠️  ${service.name} is running but not healthy yet (port ${service.port})`,
            timestamp: new Date().toISOString()
          });
          allRunning = false;
        }
      } else {
        sendSSE(res, {
          type: 'progress',
          step: 11,
          totalSteps: 11,
          progress: 100,
          message: `✅ ${service.name} is running (port ${service.port})`,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      sendSSE(res, {
        type: 'progress',
        step: 11,
        totalSteps: 11,
        progress: 100,
        message: `❌ ${service.name} is NOT running (expected port ${service.port})`,
        timestamp: new Date().toISOString()
      });
      allRunning = false;
    }
  }

  // Summary message
  if (allRunning) {
    sendSSE(res, {
      type: 'progress',
      step: 11,
      totalSteps: 11,
      progress: 100,
      message: '🎉 All backend services verified and running!',
      timestamp: new Date().toISOString()
    });
  } else {
    sendSSE(res, {
      type: 'progress',
      step: 11,
      totalSteps: 11,
      progress: 100,
      message: '⚠️  Some services are not running. Check logs above.',
      timestamp: new Date().toISOString()
    });
  }

  return allRunning;
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ready',
    service: 'progress-server',
    port: PORT
  });
});

/**
 * Start server
 */
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 Progress Server Ready');
  console.log('========================');
  console.log(`Port: ${PORT}`);
  console.log(`Endpoint: http://localhost:${PORT}/stream?password=admin123`);
  console.log('');
  console.log('Waiting for clean install request...');
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
