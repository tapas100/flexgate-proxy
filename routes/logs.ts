import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const router = express.Router();
const readFile = promisify(fs.readFile);

/**
 * Logs API
 * Provides JSON API for Winston logs
 */

const LOG_DIR = path.join(process.cwd(), 'logs');
const COMBINED_LOG = path.join(LOG_DIR, 'combined.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');

/**
 * GET /api/logs
 * @desc Get logs with pagination and filtering
 * @query limit - Number of logs to return (default: 100)
 * @query offset - Offset for pagination (default: 0)
 * @query level - Filter by log level (DEBUG, INFO, WARN, ERROR, FATAL)
 * @query search - Search term for filtering logs
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const levelFilter = (req.query.level as string)?.toUpperCase();
    const searchTerm = req.query.search as string;
    
    // Read log file
    const logPath = levelFilter === 'ERROR' || levelFilter === 'FATAL' ? ERROR_LOG : COMBINED_LOG;
    
    let logs: any[] = [];
    
    try {
      const logContent = await readFile(logPath, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      // Parse JSON logs
      logs = lines
        .map((line, index) => {
          try {
            const parsed = JSON.parse(line);
            return {
              id: `log-${Date.now()}-${index}`,
              timestamp: parsed.timestamp || new Date().toISOString(),
              level: parsed.level?.toUpperCase() || 'INFO',
              message: parsed.message || line,
              correlationId: parsed.correlationId,
              service: parsed.service || 'proxy-server',
              ...parsed
            };
          } catch {
            // Non-JSON log line
            return {
              id: `log-${Date.now()}-${index}`,
              timestamp: new Date().toISOString(),
              level: 'INFO',
              message: line,
              service: 'proxy-server'
            };
          }
        })
        .reverse(); // Most recent first
      
    } catch (error) {
      // Log file doesn't exist or can't be read
      console.log('No log file found, returning empty array');
    }
    
    // Apply filters
    if (levelFilter) {
      logs = logs.filter(log => log.level === levelFilter);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      logs = logs.filter(log => 
        JSON.stringify(log).toLowerCase().includes(term)
      );
    }
    
    const total = logs.length;
    const paginatedLogs = logs.slice(offset, offset + limit);
    
    res.json({
      success: true,
      data: {
        logs: paginatedLogs,
        total,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch logs',
      message: error.message,
    });
  }
});

/**
 * GET /api/logs/:id
 * @desc Get single log by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Read all logs and find the one with matching ID
    const logContent = await readFile(COMBINED_LOG, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      try {
        const parsed = JSON.parse(line);
        const logId = `log-${parsed.timestamp}-${i}`;
        
        if (logId === id || parsed.correlationId === id) {
          res.json({
            success: true,
            data: {
              id: logId,
              ...parsed
            },
          });
          return;
        }
      } catch {
        // Skip non-JSON lines
      }
    }
    
    res.status(404).json({
      success: false,
      error: 'Log not found',
    });
  } catch (error: any) {
    console.error('Error fetching log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch log',
      message: error.message,
    });
  }
});

/**
 * GET /api/logs/stats
 * @desc Get log statistics
 */
router.get('/stats/summary', async (_req: Request, res: Response) => {
  try {
    const logContent = await readFile(COMBINED_LOG, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    
    const stats = {
      total: 0,
      byLevel: {
        DEBUG: 0,
        INFO: 0,
        WARN: 0,
        ERROR: 0,
        FATAL: 0,
      },
      bySource: {
        proxy: 0,
        auth: 0,
        metrics: 0,
        admin: 0,
        system: 0,
      },
      errorRate: 0,
    };
    
    lines.forEach(line => {
      try {
        const parsed = JSON.parse(line);
        stats.total++;
        
        const level = parsed.level?.toUpperCase() || 'INFO';
        if (stats.byLevel.hasOwnProperty(level)) {
          (stats.byLevel as any)[level]++;
        }
        
        const service = parsed.service || 'system';
        if (service.includes('proxy')) stats.bySource.proxy++;
        else if (service.includes('auth')) stats.bySource.auth++;
        else if (service.includes('metric')) stats.bySource.metrics++;
        else if (service.includes('admin')) stats.bySource.admin++;
        else stats.bySource.system++;
      } catch {
        stats.total++;
        stats.byLevel.INFO++;
        stats.bySource.system++;
      }
    });
    
    const errorCount = stats.byLevel.ERROR + stats.byLevel.FATAL;
    stats.errorRate = stats.total > 0 ? (errorCount / stats.total) * 100 : 0;
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error fetching log stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch log statistics',
      message: error.message,
    });
  }
});

export default router;
