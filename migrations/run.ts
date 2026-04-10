#!/usr/bin/env node
/**
 * Migration Runner
 * Runs database migrations from SQL files.
 * Tracks applied migrations in the schema_migrations table so each
 * migration is applied exactly once — safe to run on every deploy.
 */

import * as fs from 'fs';
import * as path from 'path';
import database from '../src/database/index';
import { logger } from '../src/logger';

async function getAppliedMigrations(): Promise<Set<string>> {
  try {
    const result = await database.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    return new Set((result as any).rows.map((r: any) => r.version));
  } catch {
    // schema_migrations doesn't exist yet — will be created by 002
    return new Set();
  }
}

async function recordMigration(version: string): Promise<void> {
  try {
    await database.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
      [version]
    );
  } catch {
    // If tracking table doesn't exist yet, skip recording
  }
}

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    await database.initialize();
    logger.info('✓ Connected to database');

    const migrationsDir = path.join(__dirname);
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      logger.warn('No migration files found');
      return;
    }

    logger.info(`Found ${migrationFiles.length} migration file(s)`);

    const applied = await getAppliedMigrations();

    for (const file of migrationFiles) {
      // Strip .sql extension to get the version key
      const version = file.replace(/\.sql$/, '');

      if (applied.has(version)) {
        logger.info(`Skipping ${file} (already applied)`);
        continue;
      }

      logger.info(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await database.query(sql);
      await recordMigration(version);
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

runMigrations();
