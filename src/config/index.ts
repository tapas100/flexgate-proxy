/**
 * FlexGate Configuration Initialization
 * 
 * This module initializes the configuration system on app startup.
 * Import this at the very top of your app.ts or bin/www file.
 */

import { getConfig } from './jsonLoader.js';

// Load configuration immediately
const config = getConfig();

// Export for use in other modules
export default config;
export { config };
