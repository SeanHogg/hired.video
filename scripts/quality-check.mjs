#!/usr/bin/env node

/**
 * Quality check script for MyVideoResume Frontend
 * Runs typecheck, lint, and optionally build to verify code quality
 */

import { execSync } from 'child_process';

const args = process.argv.slice(2);
const requiredOnly = args.includes('--required-only');

const CHECKS = [
  {
    name: 'TypeScript Type Check',
    command: 'npm run typecheck',
    description: 'Checking TypeScript types and compilation errors...',
    required: true
  },
  {
    name: 'ESLint Code Quality',
    command: process.env.CI ? 'npm run lint:ci' : 'npm run lint',
    description: 'Running ESLint to check code quality and standards...',
    required: true
  },
  {
    name: 'Build Compilation',
    command: 'npm run build',
    description: 'Building project to ensure no compilation errors...',
    required: true
  },
  {
    name: 'Test Suite',
    command: 'npm run test',
    description: 'Executing test suite to verify functionality...',
    required: false
  }
];

const results = [];
let hasRequiredFailure = false;

console.log('🚀 Starting Quality Checks for MyVideoResume Frontend\n');

for (const check of CHECKS) {
  if (requiredOnly && !check.required) {
    console.log(`[SKIP] ${check.name} (not required)`);
    continue;
  }

  const startTime = Date.now();
  const timestamp = new Date().toLocaleTimeString();
  
  console.log(`[${timestamp}] ℹ️  ${check.description}`);
  
  try {
    execSync(check.command, { 
      stdio: 'inherit',
      encoding: 'utf8'
    });
    
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toLocaleTimeString()}] ✅ ${check.name} passed (${duration}ms)\n`);
    
    results.push({
      name: check.name,
      passed: true,
      duration,
      required: check.required
    });
  } catch (_error) {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toLocaleTimeString()}] ❌ ${check.name} failed (${duration}ms)\n`);

    results.push({
      name: check.name,
      passed: false,
      duration,
      required: check.required
    });
    
    if (check.required) {
      hasRequiredFailure = true;
    }
  }
}

// Print summary
console.log('\n📊 QUALITY CHECK REPORT');
console.log('============================================================');

const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
const requiredFailed = results.filter(r => !r.passed && r.required).length;

console.log(`Total Duration: ${totalDuration}ms`);
console.log(`Checks Passed: ${passed}`);
console.log(`Checks Failed: ${failed}`);
console.log(`Required Failures: ${requiredFailed}`);
console.log('');

for (const result of results) {
  const status = result.passed ? '✅' : '❌';
  const required = result.required ? '[REQUIRED]' : '[OPTIONAL]';
  console.log(`${status} ${result.name} ${required} - ${result.duration}ms`);
}

console.log('');

if (hasRequiredFailure) {
  console.log('❌ Some required quality checks failed. Please fix the issues above.');
  process.exit(1);
} else {
  console.log('✅ All required quality checks passed! Code is ready for production.');
  process.exit(0);
}

