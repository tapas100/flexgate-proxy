// pm2 ecosystem file for FlexGate Proxy (dev/testing/CI)
// Uses __dirname so it works from any checkout location (local, Jenkins, etc.)
const path = require('path');
const ROOT = __dirname;
const LOG_DIR = process.env.PM2_LOG_DIR || path.join(ROOT, 'logs');

module.exports = {
  apps: [
    {
      name: 'flexgate-proxy',
      script: './node_modules/.bin/ts-node',
      args: '-r dotenv/config -r tsconfig-paths/register ./bin/www',
      cwd: ROOT,
      env: {
        NODE_ENV: 'development',
        PORT: process.env.PORT || '3000',
        DB_HOST: process.env.DB_HOST || 'localhost',
        DB_PORT: process.env.DB_PORT || '5432',
        DB_NAME: process.env.DB_NAME || 'flexgate',
        DB_USER: process.env.DB_USER || 'flexgate',
        DB_PASSWORD: process.env.DB_PASSWORD || '',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
        ADMIN_API_KEY: process.env.ADMIN_API_KEY || '',
        DEMO_MODE: process.env.DEMO_MODE || 'true',
        DEMO_EMAIL: process.env.DEMO_EMAIL || 'admin@flexgate.dev',
        DEMO_PASSWORD: process.env.DEMO_PASSWORD || '',
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:8080',
        CORS_ENABLED: process.env.CORS_ENABLED || 'true',
        METRICS_ENABLED: process.env.METRICS_ENABLED || 'true',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 2000,
      log_file: path.join(LOG_DIR, 'pm2-combined.log'),
      out_file: path.join(LOG_DIR, 'pm2-out.log'),
      error_file: path.join(LOG_DIR, 'pm2-error.log'),
      time: true,
    },
  ],
};
