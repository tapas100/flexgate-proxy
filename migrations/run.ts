#!/usr/bin/env node
/**
 * Migration Runner
 * Runs database migrations from SQL files
 */

import * as fs from 'fs';
import * as path from 'path';
import database from '../src/database/index';
import { logger } from '../src/logger';

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Connect to database
    await database.initialize();
    logger.info('✓ Connected to database');

    // Read migration files
    const migrationsDir = path.join(__dirname);
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      logger.warn('No migration files found');
      return;
    }

    logger.info(`Found ${migrationFiles.length} migration file(s)`);

    // Run each migration
    for (const file of migrationFiles) {
      logger.info(`Running migration: ${file}`);
      
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      await database.query(sql);
      logger.info(`✓ Migration ${file} completed`);
    }

    logger.info('✓ All migrations completed successfully');

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await database.close();
  }
}

// Run migrations
runMigrations();
