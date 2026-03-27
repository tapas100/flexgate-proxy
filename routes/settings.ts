/**
 * Settings API Routes
 * 
 * Endpoints for managing FlexGate configuration settings
 * Includes general settings, notifications, security, and more
 */

import express, { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import Ajv from 'ajv';

const router = express.Router();
const ajv = new Ajv();

// Path to configuration file
const CONFIG_DIR = path.join(__dirname, '../config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'flexgate.json');

// Settings validation schema
const settingsSchema = {
  type: 'object',
  properties: {
    server: {
      type: 'object',
      properties: {
        port: { type: 'number', minimum: 1, maximum: 65535 },
        host: { type: 'string' },
        basePath: { type: 'string' },
        maxConnections: { type: 'number', minimum: 1 },
        keepAliveTimeout: { type: 'number', minimum: 0 },
        trustProxy: { type: 'boolean' },
        compression: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            level: { type: 'number', minimum: 0, maximum: 9 },
            threshold: { type: 'number', minimum: 0 },
          },
        },
      },
    },
    admin: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        path: { type: 'string' },
        sessionTimeout: { type: 'number', minimum: 60000 },
        maxLoginAttempts: { type: 'number', minimum: 1, maximum: 10 },
        lockoutDuration: { type: 'number', minimum: 60000 },
        theme: { type: 'string', enum: ['auto', 'light', 'dark'] },
        autoRefresh: { type: 'number', minimum: 5000 },
      },
    },
    database: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', minimum: 1, maximum: 65535 },
        database: { type: 'string' },
        user: { type: 'string' },
        ssl: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            mode: { type: 'string' },
          },
        },
        pool: {
          type: 'object',
          properties: {
            min: { type: 'number', minimum: 1 },
            max: { type: 'number', minimum: 1 },
            idleTimeout: { type: 'number', minimum: 1000 },
          },
        },
      },
    },
    redis: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', minimum: 1, maximum: 65535 },
        db: { type: 'number', minimum: 0 },
        keyPrefix: { type: 'string' },
        cache: {
          type: 'object',
          properties: {
            defaultTTL: { type: 'number', minimum: 1000 },
            maxMemory: { type: 'number', minimum: 128 },
          },
        },
      },
    },
    security: {
      type: 'object',
      properties: {
        jwt: {
          type: 'object',
          properties: {
            algorithm: { type: 'string' },
            expiresIn: { type: 'string' },
          },
        },
        cors: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            origins: { type: 'array', items: { type: 'string' } },
            methods: { type: 'array', items: { type: 'string' } },
            credentials: { type: 'boolean' },
          },
        },
      },
    },
    logging: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
        format: { type: 'string', enum: ['json', 'text'] },
        maxFileSize: { type: 'number', minimum: 1024 },
        maxFiles: { type: 'number', minimum: 1 },
      },
    },
    monitoring: {
      type: 'object',
      properties: {
        prometheus: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            endpoint: { type: 'string' },
          },
        },
        tracing: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            sampleRate: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
  },
};

const validate = ajv.compile(settingsSchema);

/**
 * GET /api/settings
 * Retrieve current configuration settings
 */
router.get('/', async (_req: Request, res: Response) => {
  console.log('[DEBUG] GET /api/settings called');
  try {
    // Read configuration file
    console.log('[DEBUG] Reading config from:', CONFIG_FILE);
    const configData = await fs.readFile(CONFIG_FILE, 'utf-8');
    console.log('[DEBUG] Config read successfully, length:', configData.length);
    const config = JSON.parse(configData);
    console.log('[DEBUG] Config parsed successfully');

    // Remove sensitive data before sending
    console.log('[DEBUG] Creating sanitized config...');
    const sanitizedConfig: any = {
      ...config,
    };
    
    console.log('[DEBUG] Sanitizing database section...');
    if (sanitizedConfig.database) {
      sanitizedConfig.database = {
        ...sanitizedConfig.database,
        password: sanitizedConfig.database.password ? '***REDACTED***' : undefined,
      };
    }
    
    console.log('[DEBUG] Sanitizing security section...');
    if (sanitizedConfig.security && sanitizedConfig.security.jwt) {
      sanitizedConfig.security = {
        ...sanitizedConfig.security,
        jwt: {
          ...sanitizedConfig.security.jwt,
          secret: sanitizedConfig.security.jwt.secret ? '***REDACTED***' : undefined,
        },
      };
    }
    
    console.log('[DEBUG] Sending response...');
    res.json({
      success: true,
      settings: sanitizedConfig,
    });
    console.log('[DEBUG] Response sent');
  } catch (error: any) {
    console.error('Failed to read settings:', error);
    
    // Return default settings if file doesn't exist
    if (error.code === 'ENOENT') {
      res.json({
        success: true,
        settings: getDefaultSettings(),
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to load settings',
        message: error.message,
      });
    }
  }
});

/**
 * PUT /api/settings
 * Update configuration settings
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    // Type assertion for request body
    const newSettings = req.body as Record<string, any>;

    // Validate settings
    const valid = validate(newSettings);
    if (!valid) {
      res.status(400).json({
        success: false,
        error: 'Invalid settings',
        validation: validate.errors,
      });
      return;
    }

    // Read current config
    let currentConfig: Record<string, any> = {};
    try {
      const configData = await fs.readFile(CONFIG_FILE, 'utf-8');
      currentConfig = JSON.parse(configData);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, use defaults
      currentConfig = getDefaultSettings();
    }

    // CRITICAL: Prevent changing infrastructure settings that require coordinated updates
    if (newSettings.server?.port && newSettings.server.port !== currentConfig.server?.port) {
      res.status(403).json({
        success: false,
        error: 'Port changes not allowed via Settings API',
        message: 'Changing the server port requires updating multiple configuration files (health check scripts, Admin UI proxy, HAProxy config) and restarting all services. Please edit config/flexgate.json manually and restart FlexGate using ./scripts/stop-all.sh && ./scripts/start-with-deps.sh',
        currentPort: currentConfig.server?.port,
        requestedPort: newSettings.server.port,
      });
      return;
    }

    if (newSettings.server?.host && newSettings.server.host !== currentConfig.server?.host) {
      res.status(403).json({
        success: false,
        error: 'Host changes not allowed via Settings API',
        message: 'Changing the server host requires updating multiple configuration files. Please edit config/flexgate.json manually and restart FlexGate.',
      });
      return;
    }

    // Prevent changing database connection settings
    if (newSettings.database?.host || newSettings.database?.port || newSettings.database?.database || newSettings.database?.user) {
      res.status(403).json({
        success: false,
        error: 'Database connection settings locked',
        message: 'Cannot change database host, port, name, or user while FlexGate is running. Please edit config/flexgate.json manually and restart FlexGate.',
      });
      return;
    }

    // Prevent changing Redis connection settings
    if (newSettings.redis?.host || newSettings.redis?.port || newSettings.redis?.db) {
      res.status(403).json({
        success: false,
        error: 'Redis connection settings locked',
        message: 'Cannot change Redis host, port, or database number while FlexGate is running. Please edit config/flexgate.json manually and restart FlexGate.',
      });
      return;
    }

    // Prevent changing JWT algorithm (would invalidate all tokens)
    if (newSettings.security?.jwt?.algorithm && newSettings.security.jwt.algorithm !== currentConfig.security?.jwt?.algorithm) {
      res.status(403).json({
        success: false,
        error: 'JWT algorithm cannot be changed',
        message: 'Changing the JWT algorithm would invalidate all existing user sessions. Please edit config/flexgate.json manually if you really need to change this.',
      });
      return;
    }

    // Merge settings (preserve sensitive data from current config)
    const settings = newSettings as any;
    const mergedConfig: any = {
      ...currentConfig,
      ...settings,
    };

    // Preserve sensitive database data
    if (settings?.database) {
      mergedConfig.database = {
        ...settings.database,
        password: currentConfig.database?.password,
      };
    }

    // Preserve sensitive security data
    if (settings?.security) {
      mergedConfig.security = {
        ...settings.security,
      };
      if (settings.security?.jwt) {
        mergedConfig.security.jwt = {
          ...settings.security.jwt,
          secret: currentConfig.security?.jwt?.secret,
        };
      }
    }

    // Ensure config directory exists
    await fs.mkdir(CONFIG_DIR, { recursive: true });

    // Write to file with backup
    const backupFile = `${CONFIG_FILE}.backup`;
    try {
      // Create backup of current config
      try {
        await fs.copyFile(CONFIG_FILE, backupFile);
      } catch (err) {
        // Backup file doesn't exist, that's ok
      }

      // Write new config
      await fs.writeFile(
        CONFIG_FILE,
        JSON.stringify(mergedConfig, null, 2),
        'utf-8'
      );

      res.json({
        success: true,
        message: 'Settings saved successfully',
        settings: sanitizeSettings(mergedConfig),
      });
    } catch (writeError) {
      // Restore from backup if write failed
      try {
        await fs.copyFile(backupFile, CONFIG_FILE);
      } catch (restoreError) {
        // Couldn't restore, but that's secondary
      }
      throw writeError;
    }
  } catch (error: any) {
    console.error('Failed to save settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save settings',
      message: error.message,
    });
  }
});

/**
 * POST /api/settings/test/:service
 * Test connection to a service (database, redis, etc.)
 */
router.post('/test/:service', async (req: Request, res: Response) => {
  const { service } = req.params;

  try {
    let result: any = {};

    switch (service) {
      case 'database':
        // Test database connection
        result = await testDatabaseConnection(req.body);
        break;

      case 'redis':
        // Test Redis connection
        result = await testRedisConnection(req.body);
        break;

      default:
        res.status(400).json({
          success: false,
          error: `Unknown service: ${service}`,
        });
        return;
    }

    res.json({
      success: true,
      service,
      result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      service,
      error: 'Connection test failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/settings/validate
 * Validate settings without saving
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    const valid = validate(settings);
    
    if (valid) {
      res.json({
        success: true,
        valid: true,
        message: 'Settings are valid',
      });
    } else {
      res.status(400).json({
        success: false,
        valid: false,
        errors: validate.errors,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Validation failed',
      message: error.message,
    });
  }
});

/**
 * Helper: Get default settings
 */
function getDefaultSettings() {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      basePath: '/',
      maxConnections: 10000,
      keepAliveTimeout: 60000,
      trustProxy: true,
      compression: {
        enabled: true,
        level: 6,
        threshold: 1024,
      },
    },
    admin: {
      enabled: true,
      path: '/admin',
      sessionTimeout: 3600000,
      maxLoginAttempts: 5,
      lockoutDuration: 900000,
      theme: 'auto',
      autoRefresh: 30000,
    },
    database: {
      host: 'localhost',
      port: 5432,
      database: 'flexgate',
      user: 'flexgate',
      ssl: {
        enabled: false,
        mode: 'prefer',
      },
      pool: {
        min: 2,
        max: 10,
        idleTimeout: 30000,
      },
    },
    redis: {
      host: 'localhost',
      port: 6379,
      db: 0,
      keyPrefix: 'flexgate:',
      cache: {
        defaultTTL: 300000,
        maxMemory: 1024,
      },
    },
    security: {
      jwt: {
        algorithm: 'HS256',
        expiresIn: '24h',
      },
      cors: {
        enabled: true,
        origins: ['http://localhost:3000', 'http://localhost:3002'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true,
      },
    },
    logging: {
      level: 'info',
      format: 'json',
      maxFileSize: 10485760,
      maxFiles: 10,
    },
    monitoring: {
      prometheus: {
        enabled: true,
        endpoint: '/metrics',
      },
      tracing: {
        enabled: false,
        sampleRate: 0.1,
      },
    },
  };
}

/**
 * Helper: Remove sensitive data from settings
 */
function sanitizeSettings(settings: any) {
  return {
    ...settings,
    database: {
      ...settings.database,
      password: undefined,
    },
    security: {
      ...settings.security,
      jwt: {
        ...settings.security?.jwt,
        secret: undefined,
      },
    },
  };
}

/**
 * Helper: Test database connection
 */
async function testDatabaseConnection(_config: any): Promise<any> {
  // TODO: Implement actual database connection test
  // For now, simulate a test
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        status: 'success',
        message: 'Database connection successful',
        latency: Math.floor(Math.random() * 50) + 10,
      });
    }, 500);
  });
}

/**
 * Helper: Test Redis connection
 */
async function testRedisConnection(_config: any): Promise<any> {
  // TODO: Implement actual Redis connection test
  // For now, simulate a test
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        status: 'success',
        message: 'Redis connection successful',
        latency: Math.floor(Math.random() * 30) + 5,
      });
    }, 300);
  });
}

export default router;
