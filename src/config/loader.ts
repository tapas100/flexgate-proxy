/**
 * Configuration Loader
 * Handles loading, validation, and reloading of proxy configuration
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { validateConfig, getSchemaVersion, migrateConfig } from './schema';
import { metrics } from '../metrics';
import type { ProxyConfig, ConfigWatcher, ConfigLoader as IConfigLoader } from '../types';

class Config implements IConfigLoader {
  public config: ProxyConfig | null;
  public watchers: ConfigWatcher[];
  public schemaVersion: string;
  
  constructor() {
    this.config = null;
    this.watchers = [];
    this.schemaVersion = getSchemaVersion();
  }
  
  /**
   * Load configuration from file
   * @param configPath - Path to configuration file (default: config/proxy.yml)
   * @returns Loaded and validated configuration
   */
  load(configPath: string = 'config/proxy.yml'): ProxyConfig {
    try {
      const fullPath = path.resolve(process.cwd(), configPath);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const rawConfig = yaml.load(fileContents) as any;
      
      // Check version and migrate if needed
      const configVersion = rawConfig.version || '1.0.0';
      const migratedConfig = migrateConfig(rawConfig, configVersion);
      
      // Validate config against schema
      const { error, value, warnings } = validateConfig(migratedConfig);
      
      if (error) {
        console.error('❌ Config validation failed:', error.message);
        if ((error as any).details) {
          (error as any).details.forEach((detail: any) => {
            console.error(`  - ${detail.path.join('.')}: ${detail.message}`);
          });
        }
        throw error;
      }
      
      // Show warnings
      if (warnings && warnings.length > 0) {
        warnings.forEach(warning => {
          console.warn(`⚠️  ${warning}`);
        });
      }
      
      this.config = value as ProxyConfig;
      
      // Record successful config load metrics
      metrics.configReloadTotal.inc({ status: 'success' });
      metrics.configLastReloadTimestamp.set(Date.now());
      metrics.configVersionInfo.set(
        { version: configVersion, config_file: configPath },
        1
      );
      
      console.log(`✅ Config loaded from ${fullPath} (schema v${this.schemaVersion})`);
      return this.config;
    } catch (error) {
      const err = error as Error;
      
      // Record config load failure metrics
      metrics.configReloadTotal.inc({ status: 'failure' });
      metrics.configReloadFailuresTotal.inc({ 
        error_type: err.name || 'unknown'
      });
      
      console.error('❌ Failed to load config:', err.message);
      throw error;
    }
  }
  
  /**
   * Reload configuration from file
   * @param configPath - Path to configuration file
   * @returns true if reload successful, false otherwise
   */
  reload(configPath: string = 'config/proxy.yml'): boolean {
    try {
      const oldConfig = this.config;
      this.load(configPath);
      
      // Notify watchers
      this.watchers.forEach(callback => {
        try {
          callback(this.config!, oldConfig!);
        } catch (error) {
          console.error('Error in config watcher:', error);
        }
      });
      
      console.log('✅ Config reloaded successfully');
      return true;
    } catch (error) {
      const err = error as Error;
      console.error('❌ Config reload failed, keeping old config:', err.message);
      return false;
    }
  }
  
  /**
   * Get configuration value by path
   * @param path - Dot-separated path to configuration value
   * @param defaultValue - Default value if path not found
   * @returns Configuration value or default
   */
  get<T = any>(path: string, defaultValue?: T): T | null {
    // Auto-load config if not loaded
    if (!this.config) {
      try {
        this.load();
      } catch (error) {
        // If auto-load fails, return default or null
        return defaultValue !== undefined ? defaultValue as T : null;
      }
    }
    
    const keys = path.split('.');
    let value: any = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue !== undefined ? defaultValue as T : null;
      }
    }
    
    return value as T;
  }
  
  /**
   * Register a watcher callback for configuration changes
   * @param callback - Function to call when config changes
   */
  watch(callback: ConfigWatcher): void {
    this.watchers.push(callback);
  }
}

// Export the class for testing and the singleton for production use
const configInstance = new Config();
export default configInstance;
export { Config };
