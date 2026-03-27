import express, { Request, Response } from 'express';
import { exec, spawn } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = express.Router();

// Path to troubleshooting scripts (from project root)
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts/troubleshooting');

// Helper function to execute scripts with real-time streaming
function executeScriptWithStreaming(
  scriptName: string,
  onData: (data: string) => void,
  onComplete: (exitCode: number) => void
): void {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const child = spawn('bash', [scriptPath], {
    cwd: path.join(__dirname, '../..'),
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter((line: string) => line.trim());
    lines.forEach((line: string) => onData(line));
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter((line: string) => line.trim());
    lines.forEach((line: string) => onData(line));
  });

  child.on('close', (code) => {
    onComplete(code || 0);
  });

  child.on('error', (error) => {
    onData(`❌ Error: ${error.message}`);
    onComplete(1);
  });
}

// Helper function to execute scripts and return formatted output
async function executeScript(scriptName: string): Promise<{
  output: string[];
  exitCode: number;
  success: boolean;
}> {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);

  try {
    const { stdout, stderr } = await execAsync(`bash ${scriptPath}`, {
      cwd: path.join(__dirname, '../..'),
      timeout: 300000, // 5 minutes max
    });

    const output = (stdout + stderr).split('\n').filter((line: string) => line.trim());
    
    return {
      output,
      exitCode: 0,
      success: true,
    };
  } catch (error: any) {
    const output = (error.stdout + error.stderr).split('\n').filter((line: string) => line.trim());
    
    return {
      output,
      exitCode: error.code || 1,
      success: false,
    };
  }
}

// Helper function to parse requirements check output
function parseRequirementsCheckOutput(output: string[]): {
  systemChecks: Array<{
    name: string;
    status: 'healthy' | 'unhealthy' | 'warning' | 'unknown';
    message: string;
  }>;
} {
  const systemChecks: Array<{
    name: string;
    status: 'healthy' | 'unhealthy' | 'warning' | 'unknown';
    message: string;
  }> = [];
  
  for (const line of output) {
    // Skip npm warnings about always-auth config
    if (line.includes('npm warn') && line.includes('always-auth')) {
      continue;
    }
    
    if (line.includes('Node.js')) {
      systemChecks.push({
        name: 'Node.js Version',
        status: line.includes('✅') ? 'healthy' : line.includes('❌') ? 'unhealthy' : 'unknown',
        message: line.replace(/.*: /, ''),
      });
    } else if (line.includes('npm')) {
      systemChecks.push({
        name: 'npm',
        status: line.includes('✅') ? 'healthy' : line.includes('❌') ? 'unhealthy' : 'unknown',
        message: line.replace(/.*: /, ''),
      });
    } else if (line.includes('Podman') || line.includes('Docker')) {
      systemChecks.push({
        name: 'Podman/Docker',
        status: line.includes('✅') ? 'healthy' : line.includes('⚠️') ? 'warning' : 'unknown',
        message: line.replace(/.*: /, ''),
      });
    } else if (line.includes('Port')) {
      // Extract port number and usage info
      const portMatch = line.match(/Port (\d+)/);
      const portNum = portMatch ? portMatch[1] : 'unknown';
      
      let message = line.replace(/.*Port.*: /, '');
      const isHealthy = line.includes('✅');
      const isUnhealthy = line.includes('❌');
      
      // If port is in use, extract what's using it
      if (isUnhealthy && line.includes('by:')) {
        const usageMatch = line.match(/by: (.+)/);
        if (usageMatch) {
          message = `Port ${portNum}: ${usageMatch[1]}`;
        }
      } else if (isHealthy) {
        // Extract service name from parentheses
        const serviceMatch = line.match(/available \((.+)\)/);
        if (serviceMatch) {
          message = `Port ${portNum} available (${serviceMatch[1]})`;
        } else {
          message = `Port ${portNum} available`;
        }
      }
      
      systemChecks.push({
        name: 'Port Availability',
        status: isHealthy ? 'healthy' : isUnhealthy ? 'unhealthy' : 'unknown',
        message,
      });
    } else if (line.includes('disk space')) {
      systemChecks.push({
        name: 'Disk Space',
        status: 'healthy',
        message: line.replace(/.*: /, ''),
      });
    } else if (line.includes('memory')) {
      systemChecks.push({
        name: 'Memory',
        status: 'healthy',
        message: line.replace(/.*: /, ''),
      });
    }
  }
  
  return { systemChecks };
}

/**
 * POST /api/troubleshooting/health-check
 * Run health-check.sh script with JSON output
 */
router.post('/health-check', async (_req: Request, res: Response) => {
  try {
    // Use path from project root (works for both dev and compiled)
    const scriptPath = path.join(process.cwd(), 'scripts/troubleshooting/health-check.sh');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Run script with --json flag
    const { stdout } = await execAsync(`${scriptPath} --json`);
    
    // Parse JSON output
    const healthData = JSON.parse(stdout);
    
    res.json({
      success: healthData.success,
      timestamp: healthData.timestamp,
      services: healthData.services,
      exitCode: healthData.success ? 0 : 1,
      output: [stdout] // Keep for backward compatibility
    });
  } catch (error: any) {
    // Try to parse JSON from error output
    try {
      const healthData = JSON.parse(error.stdout || '{}');
      res.json({
        ...healthData,
        exitCode: error.code || 1,
        output: [error.stdout || error.message]
      });
    } catch {
      res.status(500).json({
        error: error.message,
        output: [error.message],
        exitCode: 1,
        success: false,
        services: []
      });
    }
  }
});

/**
 * POST /api/troubleshooting/check-requirements
 * Run check-requirements.sh script
 */
router.post('/check-requirements', async (_req: Request, res: Response) => {
  try {
    const result = await executeScript('check-requirements.sh');
    const parsed = parseRequirementsCheckOutput(result.output);
    
    res.json({
      ...result,
      ...parsed,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      output: [error.message],
      exitCode: 1,
      success: false,
    });
  }
});

/**
 * GET /api/troubleshooting/clean-install/stream
 * Stream clean installation progress in real-time using Server-Sent Events
 */
router.get('/clean-install/stream', (req: Request, res: Response) => {
  // Verify admin password from query params
  const { password } = req.query;
  
  if (password !== 'admin123') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid admin password',
    });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: '🔌 Connected to installation stream' })}\n\n`);

  let currentStep = 0;
  const totalSteps = 10;

  // Execute script with streaming
  executeScriptWithStreaming(
    'clean-install.sh',
    (data: string) => {
      // Parse step number from output
      const stepMatch = data.match(/Step (\d+)\/(\d+):/);
      if (stepMatch && stepMatch[1]) {
        currentStep = parseInt(stepMatch[1], 10);
      }

      // Send progress update
      const progress = Math.round((currentStep / totalSteps) * 100);
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        step: currentStep,
        totalSteps,
        progress,
        message: data,
      })}\n\n`);
    },
    (exitCode: number) => {
      // Send completion message
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        success: exitCode === 0,
        exitCode,
        message: exitCode === 0 ? '✅ Clean installation completed successfully!' : '❌ Installation failed',
      })}\n\n`);
      res.end();
    }
  );

  // Handle client disconnect
  req.on('close', () => {
    res.end();
  });
});

/**
 * POST /api/troubleshooting/auto-recover
 * Run auto-recover.sh script (async, returns immediately)
 */
router.post('/auto-recover', async (_req: Request, res: Response) => {
  try {
    // Return immediately and run in background
    res.json({
      success: true,
      message: 'Auto-recovery started in background',
      output: ['🔧 Auto-recovery initiated...', 'This may take 30-60 seconds'],
      exitCode: 0,
    });
    
    // Run recovery in background (don't await)
    executeScript('auto-recover.sh')
      .then(result => {
        console.log('✅ Auto-recovery completed:', result);
      })
      .catch(error => {
        console.error('❌ Auto-recovery failed:', error);
      });
      
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      output: [error.message],
      exitCode: 1,
      success: false,
    });
  }
});

/**
 * POST /api/troubleshooting/clean-install
 * Run clean-install.sh script (requires admin password)
 */
router.post('/clean-install', async (req: Request, res: Response) => {
  try {
    const { adminPassword } = req.body;

    // Verify admin password
    if (adminPassword !== 'admin123') {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid admin password',
        output: ['❌ Admin authorization failed'],
        exitCode: 1,
        success: false,
      });
      return;
    }

    const result = await executeScript('clean-install.sh');
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      output: [error.message],
      exitCode: 1,
      success: false,
    });
  }
});

/**
 * POST /api/troubleshooting/nuclear-reset
 * Run nuclear-reset.sh script (requires admin password)
 */
router.post('/nuclear-reset', async (req: Request, res: Response) => {
  try {
    const { adminPassword } = req.body;

    // Verify admin password
    if (adminPassword !== 'admin123') {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid admin password',
        output: ['❌ Admin authorization failed'],
        exitCode: 1,
        success: false,
      });
      return;
    }

    const result = await executeScript('nuclear-reset.sh');
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      output: [error.message],
      exitCode: 1,
      success: false,
    });
  }
});

/**
 * GET /api/troubleshooting/logs
 * Get recent error logs
 */
router.get('/logs', async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync('tail -50 logs/error.log', {
      cwd: path.join(__dirname, '../..'),
    });
    
    const logs = stdout.split('\n').filter(line => line.trim());
    
    res.json({
      logs,
      success: true,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      logs: [],
      success: false,
    });
  }
});

/**
 * GET /api/troubleshooting/system-info
 * Get system information
 */
router.get('/system-info', async (_req: Request, res: Response) => {
  try {
    const nodeVersion = process.version;
    const platform = process.platform;
    const arch = process.arch;
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    
    res.json({
      node: nodeVersion,
      platform,
      arch,
      uptime: Math.floor(uptime),
      memory: {
        rss: Math.floor(memory.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.floor(memory.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.floor(memory.heapUsed / 1024 / 1024) + ' MB',
        external: Math.floor(memory.external / 1024 / 1024) + ' MB',
      },
      success: true,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

/**
 * POST /api/troubleshooting/start-progress-server
 * Start the standalone progress server for clean install
 * This server runs on port 8082 and survives API server restarts
 */
router.post('/start-progress-server', async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;

    // Verify admin password
    if (password !== 'admin123') {
      res.status(401).json({
        success: false,
        error: 'Invalid admin password',
      });
      return;
    }

    // Check if progress server is already running
    try {
      const checkResult = await execAsync('lsof -ti:8082');
      if (checkResult.stdout.trim()) {
        // Already running, that's okay
        res.json({
          success: true,
          message: 'Progress server already running',
          port: 8082,
          alreadyRunning: true,
        });
        return;
      }
    } catch (error) {
      // Not running, continue to start it
    }

    // Start progress server in background
    const progressServerPath = path.join(process.cwd(), 'scripts/progress-server.js');
    const child = spawn('node', [progressServerPath], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    });

    // Detach from parent so it survives API server restart
    child.unref();

    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    res.json({
      success: true,
      message: 'Progress server started successfully',
      port: 8082,
      pid: child.pid,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/troubleshooting/verify-admin
 * Verify admin password for destructive operations
 */
router.post('/verify-admin', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    // Check against admin credentials (same as login)
    // In production, this should use proper authentication middleware
    const isValid = password === 'admin123';

    res.json({
      verified: isValid,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      verified: false,
    });
  }
});

export default router;
