#!/usr/bin/env node

/**
 * Updates the runtime configuration with build-time information
 * This script runs after the build to inject build timestamp and version
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '../dist/config.js');
const packagePath = path.join(__dirname, '../package.json');

try {
  // Read package.json for version
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const version = packageJson.version || '1.0.0';
  
  // Read the config file
  let configContent = fs.readFileSync(configPath, 'utf8');
  
  // Update app version only
  configContent = configContent.replace(
    /VERSION: "[\d.]+"/,
    `VERSION: "${version}"`
  );

  // Write the updated config
  fs.writeFileSync(configPath, configContent);

  console.log(`✅ Updated config.js with version ${version}`);
} catch (error) {
  console.error('❌ Failed to update config.js:', error.message);
  process.exit(1);
}