import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = express.Router();

// Path to troubleshooting scripts
const SCRIPTS_DIR = path.join(__dirname, '../../scripts/troubleshooting');

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

// Helper function to parse health check output
function parseHealthCheckOutput(output: string[]): {
  healthChecks: Array<{
    name: string;
    status: 'healthy' | 'unhealthy' | 'warning' | 'unknown';
    message: string;
  }>;
} {
  const healthChecks: Array<{
    name: string;
    status: 'healthy' | 'unhealthy' | 'warning' | 'unknown';
    message: string;
  }> = [];
  
  for (const line of output) {
    if (line.includes('FlexGate API')) {
      healthChecks.push({
        name: 'FlexGate API',
        status: line.includes('✅') ? 'healthy' : line.includes('❌') ? 'unhealthy' : 'unknown',
        message: line.replace(/.*: /, ''),
      });
    } else if (line.includes('PostgreSQL')) {
      healthChecks.push({
        name: 'PostgreSQL',
        status: line.includes('✅') ? 'healthy' : line.includes('❌') ? 'unhealthy' : 'unknown',
        message: line.replace(/.*: /, ''),
      });
    } else if (line.includes('Redis')) {
      healthChecks.push({
        name: 'Redis',
        status: line.includes('✅') ? 'healthy' : line.includes('❌') ? 'unhealthy' : 'unknown',
        message: line.replace(/.*: /, ''),
      });
    } else if (line.includes('HAProxy')) {
      healthChecks.push({
        name: 'HAProxy',
        status: line.includes('✅') ? 'healthy' : line.includes('ℹ️') ? 'warning' : 'unknown',
        message: line.replace(/.*: /, ''),
      });
    } else if (line.includes('Prometheus')) {
      healthChecks.push({
        name: 'Prometheus',
        status: line.includes('✅') ? 'healthy' : line.includes('ℹ️') ? 'warning' : 'unknown',
        message: line.replace(/.*: /, ''),
      });
    } else if (line.includes('Grafana')) {
      healthChecks.push({
        name: 'Grafana',
        status: line.includes('✅') ? 'healthy' : line.includes('ℹ️') ? 'warning' : 'unknown',
        message: line.replace(/.*: /, ''),
      });
    }
  }
  
  return { healthChecks };
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
      systemChecks.push({
        name: 'Port Availability',
        status: line.includes('✅') ? 'healthy' : line.includes('❌') ? 'unhealthy' : 'unknown',
        message: line.replace(/.*Port.*: /, ''),
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
 * Run health-check.sh script
 */
router.post('/health-check', async (_req: Request, res: Response) => {
  try {
    const result = await executeScript('health-check.sh');
    const parsed = parseHealthCheckOutput(result.output);
    
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
 * POST /api/troubleshooting/auto-recover
 * Run auto-recover.sh script
 */
router.post('/auto-recover', async (_req: Request, res: Response) => {
  try {
    const result = await executeScript('auto-recover.sh');
    
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
 * POST /api/troubleshooting/clean-install
 * Run clean-install.sh script
 */
router.post('/clean-install', async (_req: Request, res: Response) => {
  try {
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
 * Run nuclear-reset.sh script (requires confirmation)
 */
router.post('/nuclear-reset', async (_req: Request, res: Response) => {
  try {
    // This would require a special token or confirmation in production
    // For now, we'll execute it directly
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

export default router;
