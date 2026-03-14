import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  constructor() {}
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {}
  disconnect() {}
  unobserve() {}
} as any;


// Global fetch mock for production API calls to ensure deterministic tests
const ORIGINAL_FETCH = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : ((input as Request).url ?? String(input));
  try {
    if (urlStr.startsWith('https://api.hired.video')) {
      const url = new URL(urlStr);
      const path = url.pathname;
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'access-control-allow-origin': '*', 'Access-Control-Allow-Origin': '*' };

      // Example: simulate auth guard behavior for tasks endpoint
      if (path === '/api/task') {
        const isAuthed = !!(init?.headers && (init.headers as any)['Authorization']);
        if (!isAuthed) {
          return new Response(
            JSON.stringify({
              success: false,
              data: null,
              message: 'Unauthorized',
              timestamp: new Date().toISOString(),
              // New structured error shape used by ApiClient
              error: { code: 'AUTH_REQUIRED', message: 'Unauthorized' },
              // Legacy props kept for backward-compat tests
              errorMessage: 'Unauthorized',
              errorCode: 'AUTH_REQUIRED'
            }),
            { status: 401, statusText: 'Unauthorized', headers }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: [],
            message: null,
            timestamp: new Date().toISOString(),
            // Legacy props (not used by ApiClient but harmless)
            errorMessage: null,
            errorCode: null
          }),
          { status: 200, statusText: 'OK', headers }
        );
      }

      // Fallback for other API routes
      return new Response(
        JSON.stringify({
          success: true,
          data: null,
          message: null,
          timestamp: new Date().toISOString(),
          errorMessage: null,
          errorCode: null
        }),
        { status: 200, statusText: 'OK', headers }
      );
    }

    // Pass through to original fetch for non-production API calls
    if (typeof ORIGINAL_FETCH === 'function') {
      return ORIGINAL_FETCH(input as any, init as any) as any;
    }

    // Minimal fallback if no original fetch exists
    return new Response(JSON.stringify({ success: true, data: null }), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (typeof ORIGINAL_FETCH === 'function') {
      return ORIGINAL_FETCH(input as any, init as any) as any;
    }
    return new Response(
      JSON.stringify({
        success: false,
        data: null,
        message: 'Test fetch mock error',
        timestamp: new Date().toISOString(),
        error: { code: 'TEST_FETCH_ERROR', message: 'Test fetch mock error' },
        errorMessage: 'Test fetch mock error',
        errorCode: 'TEST_FETCH_ERROR'
      }),
      { status: 500, statusText: 'Internal Server Error', headers: { 'Content-Type': 'application/json' } }
    );
  }
}) as any;
