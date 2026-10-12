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

// Dist paths
const DIST_DIR = path.join(__dirname, '../dist');
const distIndexPath = path.join(DIST_DIR, 'index.html');

// In a monorepo layout, the root package.json lives one level above `frontend/`
const packagePath = path.join(__dirname, '../../package.json');

try {
  // Read package.json for version
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const version = packageJson.version || '1.0.0';
  // Build unique cache-busting id (version + UTC timestamp)
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const buildTimestamp = `${ts.getUTCFullYear()}${pad(ts.getUTCMonth() + 1)}${pad(ts.getUTCDate())}${pad(ts.getUTCHours())}${pad(ts.getUTCMinutes())}${pad(ts.getUTCSeconds())}`;
  const buildId = `v${version}-${buildTimestamp}`;
  const buildDate = `${ts.getUTCFullYear()}.${pad(ts.getUTCMonth() + 1)}.${pad(ts.getUTCDate())}`;

  // Check if config file exists
  if (fs.existsSync(configPath)) {
    // Read the config file
    let configContent = fs.readFileSync(configPath, 'utf8');

    // Update app version and optionally override API URL from build env.
    configContent = configContent.replace(
      /VERSION: "[\d.]+"/,
      `VERSION: "${version}"`
    );
    configContent = configContent.replace(
      /BUILD: "[^"]*"/,
      `BUILD: "${buildDate}"`
    );

    const apiUrlFromEnv = process.env.VITE_API_URL;
    if (apiUrlFromEnv) {
      configContent = configContent.replace(
        /API_URL: "[^"]*"/,
        `API_URL: "${apiUrlFromEnv}"`
      );
      console.log(`✅ Overwrote API_URL in config.js with ${apiUrlFromEnv}`);
    }

    // Write the updated config
    fs.writeFileSync(configPath, configContent);
    console.log(`✅ Updated config.js with version ${version}`);
  } else {
    console.log('ℹ️ No dist/config.js found - skipping config update');
  }

  // Cache-bust /config.js reference in dist/index.html so prerendered pages inherit it
  if (fs.existsSync(distIndexPath)) {
    let indexHtml = fs.readFileSync(distIndexPath, 'utf8');
    const before = indexHtml;
    // Replace any script src to /config.js (with or without existing query) with id param
    indexHtml = indexHtml.replace(/(<script[^>]+src=["']\/config\.js)(\?[^"']*)?(["'])/g, `$1?id=${buildId}$3`);

    if (indexHtml !== before) {
      fs.writeFileSync(distIndexPath, indexHtml, 'utf8');
      console.log(`✅ Updated index.html to reference /config.js?id=${buildId}`);
    } else {
      console.log('ℹ️ No /config.js reference found in index.html to update');
    }
  }

  console.log(`✅ Build configuration complete (Build ID: ${buildId})`);
} catch (error) {
  console.error('❌ Error updating config:', error.message);
  // Don't fail the build for config updates
  process.exit(0);
}

