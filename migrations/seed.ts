#!/usr/bin/env node
/**
 * Database Seed
 * Populates database with sample data for development
 */

import database from '../src/database/index';
import { logger } from '../src/logger';

async function seedDatabase() {
  try {
    logger.info('Starting database seeding...');

    // Connect to database
    await database.initialize();
    logger.info('✓ Connected to database');

    // Seed sample admin user (password: admin123)
    await database.query(
      `INSERT INTO users (email, username, password_hash, full_name, role, is_active, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO NOTHING`,
      ['admin@flexgate.dev', 'admin', '$2b$10$rOJ4KXqEXGgZvqZ3qQXd0OqLZqXGZ0K3VZvZ3qQXd0OqLZqXGZ0K3', 'Admin User', 'admin', true, true]
    );
    logger.info('✓ Admin user created (email: admin@flexgate.dev, username: admin, password: admin123)');

    // Seed sample routes
    await database.query(
      `INSERT INTO routes (route_id, path, upstream, methods, enabled, strip_path, description)
       VALUES 
       ($1, $2, $3, $4, $5, $6, $7),
       ($8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (route_id) DO NOTHING`,
      [
        'jsonplaceholder-api', '/external/api/*', 'https://jsonplaceholder.typicode.com', ['GET','POST','PUT','DELETE'], true, '/external/api/', 'JSONPlaceholder test API',
        'httpbin-api', '/httpbin/*', 'https://httpbin.org', ['GET','POST','PUT','DELETE'], true, '/httpbin/', 'HTTPBin test API'
      ]
    );
    logger.info('✓ Sample routes created');

    // Seed sample webhook
    await database.query(
      `INSERT INTO webhooks (webhook_id, name, url, events, secret, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (webhook_id) DO NOTHING`,
      [
        'route-created-webhook',
        'Route Created Notification',
        'https://example.com/webhooks/route-created',
        ['route.created', 'route.updated'],
        'webhook-secret-123',
        true
      ]
    );
    logger.info('✓ Sample webhook created');

    logger.info('✓ Database seeding completed successfully');

  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await database.close();
  }
}

// Run seeding
seedDatabase();
