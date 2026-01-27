const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { validateConfig, getSchemaVersion, migrateConfig } = require('./schema');

class Config {
  constructor() {
    this.config = null;
    this.watchers = [];
    this.schemaVersion = getSchemaVersion();
  }
  
  load(configPath = 'config/proxy.yml') {
    try {
      const fullPath = path.resolve(process.cwd(), configPath);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const rawConfig = yaml.load(fileContents);
      
      // Check version and migrate if needed
      const configVersion = rawConfig.version || '1.0.0';
      const migratedConfig = migrateConfig(rawConfig, configVersion);
      
      // Validate config against schema
      const { error, value, warnings } = validateConfig(migratedConfig);
      
      if (error) {
        console.error('❌ Config validation failed:', error.message);
        if (error.details) {
          error.details.forEach(detail => {
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
      
      this.config = value;
      console.log(`✅ Config loaded from ${fullPath} (schema v${this.schemaVersion})`);
      return this.config;
    } catch (error) {
      console.error('❌ Failed to load config:', error.message);
      throw error;
    }
  }
  
  validate() {
    if (!this.config) {
      throw new Error('Config not loaded');
    }
    
    // Use schema validation
    const { error, warnings } = validateConfig(this.config);
    
    if (error) {
      throw error;
    }
    
    if (warnings && warnings.length > 0) {
      warnings.forEach(warning => {
        console.warn(`⚠️  ${warning}`);
      });
    }
    
    console.log('✅ Config validation passed');
  }
  
  get(key, defaultValue = null) {
    if (!this.config) {
      this.load();
    }
    
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }
  
  reload(configPath = 'config/proxy.yml') {
    console.log('🔄 Reloading config...');
    try {
      const oldConfig = this.config;
      this.load(configPath);
      
      // Notify watchers
      this.watchers.forEach(callback => {
        try {
          callback(this.config, oldConfig);
        } catch (error) {
          console.error('Error in config watcher:', error);
        }
      });
      
      console.log('✅ Config reloaded successfully');
      return true;
    } catch (error) {
      console.error('❌ Config reload failed, keeping old config:', error.message);
      return false;
    }
  }
  
  watch(callback) {
    this.watchers.push(callback);
  }
}

module.exports = new Config();
