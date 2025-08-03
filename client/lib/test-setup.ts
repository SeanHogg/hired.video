/**
 * Global test setup and configuration
 */

import { expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { server } from './test-utils/mock-server';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock server setup
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
  
  // Clear localStorage and sessionStorage
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear any timers
  vi.clearAllTimers();
});

afterAll(() => {
  server.close();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = vi.fn();
}

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args: any[]) => {
  // Suppress React error boundary errors in tests
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Error: Uncaught [Error:')
  ) {
    return;
  }
  originalConsoleError(...args);
};

console.warn = (...args: any[]) => {
  // Suppress specific warnings that are expected in tests
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('React Router') || args[0].includes('validateDOMNesting'))
  ) {
    return;
  }
  originalConsoleWarn(...args);
};

// Global test configuration
export const TEST_CONFIG = {
  // API base URL for tests
  API_BASE_URL: 'http://localhost:3000/api',
  
  // Default test timeouts
  TIMEOUT: {
    SHORT: 1000,
    MEDIUM: 5000,
    LONG: 10000,
  },
  
  // Test user data
  TEST_USERS: {
    ADMIN: {
      id: 'test-admin-id',
      email: 'admin@test.com',
      name: 'Test Admin',
      role: 'admin' as const,
    },
    USER: {
      id: 'test-user-id',
      email: 'user@test.com',
      name: 'Test User',
      role: 'job_seeker' as const,
    },
    RECRUITER: {
      id: 'test-recruiter-id',
      email: 'recruiter@test.com',
      name: 'Test Recruiter',
      role: 'recruiter' as const,
    },
  },
  
  // Test tokens
  TEST_TOKENS: {
    VALID: 'valid-test-token',
    EXPIRED: 'expired-test-token',
    INVALID: 'invalid-test-token',
  },
} as const;
