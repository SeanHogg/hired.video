/**
 * Vitest configuration for comprehensive testing
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Test environment
    environment: 'jsdom',
    
    // Global setup and teardown
    setupFiles: ['./client/lib/test-setup.ts'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '**/test-utils/**',
        '**/*.test.*',
        '**/*.spec.*',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    
    // Test patterns
    include: [
      'client/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'server/**/*.{test,spec}.{js,ts}',
      'shared/**/*.{test,spec}.{js,ts}',
    ],
    
    // Test timeout
    testTimeout: 10000,
    
    // Globals
    globals: true,
    
    // Mock configuration
    deps: {
      inline: ['@testing-library/jest-dom'],
    },
    
    // Reporter configuration
    reporter: ['verbose', 'json', 'html'],
    
    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
  
  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client'),
      '@shared': path.resolve(__dirname, './shared'),
      '@server': path.resolve(__dirname, './server'),
    },
  },
  
  // Define global constants for tests
  define: {
    'import.meta.vitest': undefined,
  },
});
