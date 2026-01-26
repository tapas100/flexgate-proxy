const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

class Config {
  constructor() {
    this.config = null;
    this.watchers = [];
  }
  
  load(configPath = 'config/proxy.yml') {
    try {
      const fullPath = path.resolve(process.cwd(), configPath);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      this.config = yaml.load(fileContents);
      
      // Validate config
      this.validate();
      
      console.log(`✅ Config loaded from ${fullPath}`);
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
    
    // Required fields
    if (!this.config.upstreams || !Array.isArray(this.config.upstreams)) {
      throw new Error('Config must have upstreams array');
    }
    
    if (!this.config.routes || !Array.isArray(this.config.routes)) {
      throw new Error('Config must have routes array');
    }
    
    // Validate upstreams
    this.config.upstreams.forEach((upstream, idx) => {
      if (!upstream.name) {
        throw new Error(`Upstream at index ${idx} missing name`);
      }
      if (!upstream.url) {
        throw new Error(`Upstream ${upstream.name} missing url`);
      }
    });
    
    // Validate routes
    this.config.routes.forEach((route, idx) => {
      if (!route.path) {
        throw new Error(`Route at index ${idx} missing path`);
      }
      if (!route.upstream) {
        throw new Error(`Route ${route.path} missing upstream`);
      }
      
      // Check upstream exists
      const upstreamExists = this.config.upstreams.some(u => u.name === route.upstream);
      if (!upstreamExists) {
        throw new Error(`Route ${route.path} references unknown upstream: ${route.upstream}`);
      }
    });
    
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
