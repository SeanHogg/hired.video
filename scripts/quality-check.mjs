#!/usr/bin/env node

/**
 * Quality Check Script for MyVideoResume Frontend
 * 
 * This script implements the Augment Quality Rules for automated quality checks
 * after task completion. It runs TypeScript type checking, ESLint, build compilation,
 * and tests in sequence, reporting results and failing fast on errors.
 */

import { execSync } from 'child_process';
import { performance } from 'perf_hooks';
// Note: chalk is not installed, using console colors instead
const chalk = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`
};

const CHECKS = [
  {
    name: 'TypeScript Type Check',
    command: 'npm run typecheck',
    description: 'Checking TypeScript types and compilation errors...',
    required: true
  },
  {
    name: 'ESLint Code Quality',
    command: 'npm run lint',
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
    required: false // Tests are recommended but not required for completion
  }
];

class QualityChecker {
  constructor() {
    this.results = [];
    this.startTime = performance.now();
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;
    
    switch (type) {
      case 'success':
        console.log(chalk.green(`${prefix} ✅ ${message}`));
        break;
      case 'error':
        console.log(chalk.red(`${prefix} ❌ ${message}`));
        break;
      case 'warning':
        console.log(chalk.yellow(`${prefix} ⚠️  ${message}`));
        break;
      case 'info':
        console.log(chalk.blue(`${prefix} ℹ️  ${message}`));
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  async runCheck(check) {
    this.log(check.description, 'info');
    const checkStart = performance.now();
    
    try {
      const output = execSync(check.command, { 
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 300000 // 5 minutes timeout
      });
      
      const duration = Math.round(performance.now() - checkStart);
      const result = {
        name: check.name,
        status: 'passed',
        duration,
        output: output.trim(),
        required: check.required
      };
      
      this.results.push(result);
      this.log(`${check.name} passed (${duration}ms)`, 'success');
      
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - checkStart);
      const result = {
        name: check.name,
        status: 'failed',
        duration,
        error: error.message,
        output: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || '',
        required: check.required
      };
      
      this.results.push(result);
      this.log(`${check.name} failed (${duration}ms)`, 'error');
      
      if (error.stdout) {
        console.log(chalk.gray('STDOUT:'));
        console.log(error.stdout.toString());
      }
      
      if (error.stderr) {
        console.log(chalk.gray('STDERR:'));
        console.log(error.stderr.toString());
      }
      
      return result;
    }
  }

  async runAllChecks() {
    this.log('🚀 Starting Quality Checks for MyVideoResume Frontend', 'info');
    this.log(`Running ${CHECKS.length} quality checks...`, 'info');
    
    let hasRequiredFailures = false;
    let hasOptionalFailures = false;
    
    for (const check of CHECKS) {
      const result = await this.runCheck(check);
      
      if (result.status === 'failed') {
        if (result.required) {
          hasRequiredFailures = true;
        } else {
          hasOptionalFailures = true;
        }
      }
    }
    
    this.generateReport();
    
    if (hasRequiredFailures) {
      this.log('❌ Quality checks failed! Required checks must pass before task completion.', 'error');
      process.exit(1);
    } else if (hasOptionalFailures) {
      this.log('⚠️  Some optional checks failed. Consider fixing these issues.', 'warning');
      process.exit(0);
    } else {
      this.log('✅ All quality checks passed! Code is ready for production.', 'success');
      process.exit(0);
    }
  }

  generateReport() {
    const totalDuration = Math.round(performance.now() - this.startTime);
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const requiredFailed = this.results.filter(r => r.status === 'failed' && r.required).length;
    
    console.log('\n' + '='.repeat(60));
    console.log(chalk.bold('📊 QUALITY CHECK REPORT'));
    console.log('='.repeat(60));
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Checks Passed: ${chalk.green(passed)}`);
    console.log(`Checks Failed: ${chalk.red(failed)}`);
    console.log(`Required Failures: ${chalk.red(requiredFailed)}`);
    console.log('');
    
    this.results.forEach(result => {
      const status = result.status === 'passed' 
        ? chalk.green('✅ PASSED') 
        : chalk.red('❌ FAILED');
      const required = result.required ? chalk.red('(REQUIRED)') : chalk.yellow('(OPTIONAL)');
      
      console.log(`${status} ${result.name} ${required} - ${result.duration}ms`);
    });
    
    console.log('='.repeat(60));
  }
}

// Run quality checks if this script is executed directly
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule || process.argv[1]?.includes('quality-check.mjs')) {
  const checker = new QualityChecker();
  checker.runAllChecks().catch(error => {
    console.error(chalk.red('Fatal error during quality checks:'), error);
    process.exit(1);
  });
}

export { QualityChecker, CHECKS };
