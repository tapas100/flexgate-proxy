/**
 * Database Connection Pool
 * PostgreSQL connection management with automatic reconnection
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../logger';

class Database {
  private pool: Pool | null = null;
  private isConnected: boolean = false;

  /**
   * Initialize database connection pool
   */
  async initialize(): Promise<void> {
    try {
      const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'flexgate',
        user: process.env.DB_USER || 'flexgate',
        password: process.env.DB_PASSWORD || 'flexgate',
        max: parseInt(process.env.DB_POOL_SIZE || '20'), // Max connections in pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };

      this.pool = new Pool(config);

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;

      logger.info('✅ Database connected successfully', {
        host: config.host,
        database: config.database,
        poolSize: config.max,
      });

      // Handle pool errors
      this.pool.on('error', (err) => {
        logger.error('Unexpected database pool error', { error: err.message });
        this.isConnected = false;
      });

    } catch (error: any) {
      this.isConnected = false;
      logger.error('❌ Database connection failed', {
        error: error.message,
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'flexgate',
      });
      
      // Don't throw - allow app to start without DB (graceful degradation)
      logger.warn('⚠️  Application starting WITHOUT database persistence');
    }
  }

  /**
   * Execute a query
   */
  async query<T extends object = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    try {
      const start = Date.now();
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      if (duration > 1000) {
        logger.warn('Slow query detected', {
          query: text.substring(0, 100),
          duration,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error: any) {
      logger.error('Database query error', {
        error: error.message,
        query: text.substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    return this.pool.connect();
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if database is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database connections closed');
    }
  }

  /**
   * Get pool stats
   */
  getStats() {
    if (!this.pool) {
      return { totalCount: 0, idleCount: 0, waitingCount: 0 };
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Get the underlying pool instance (for direct access)
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.pool;
  }
}

// Singleton instance
const database = new Database();

export default database;
export { Database };
