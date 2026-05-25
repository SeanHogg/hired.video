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

// Mock CanvasRenderingContext2D (#948 — DrawingStage canvas-pixel tests).
// jsdom returns null for getContext("2d"); patch in a usable shim so the
// drawing-engine pure helpers (stampBrushDab / floodFillAt / compositeLayers /
// pickColorAt) can be unit-tested. The shim is in-memory only — it doesn't
// run the actual rasterisation, just gives the engine functions a context
// object whose methods are no-ops and whose getImageData / putImageData
// round-trip through an internal Uint8ClampedArray so callers that read
// what they wrote get consistent bytes.
//
// This is a pragmatic mock: it catches function-call regressions + arg
// shape errors. For pixel-accurate visual regression, the Playwright
// integration path (logged separately) runs against the real DOM.
const installCanvasMock = (): void => {
  if (typeof HTMLCanvasElement === "undefined") return;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patchedGetContext(
    this: HTMLCanvasElement,
    contextType: string,
    ...rest: unknown[]
  ): unknown {
    if (contextType === "2d") {
      // Per-canvas internal pixel buffer. Sized lazily on first
      // putImageData / getImageData / fillRect call.
      const internal: { pixels: Uint8ClampedArray | null; width: number; height: number } = {
        pixels: null,
        width: 0,
        height: 0,
      };
      const ensureBuffer = (): void => {
        if (internal.pixels && internal.width === this.width && internal.height === this.height) return;
        internal.width = this.width;
        internal.height = this.height;
        internal.pixels = new Uint8ClampedArray(this.width * this.height * 4);
      };
      const ctx: Record<string, unknown> = {
        canvas: this,
        fillStyle: "#000000",
        strokeStyle: "#000000",
        lineWidth: 1,
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        filter: "none",
        font: "10px sans-serif",
        textBaseline: "alphabetic",
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        rect: () => {},
        roundRect: () => {},
        ellipse: () => {},
        arc: () => {},
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        fill: () => {},
        stroke: () => {},
        clip: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        transform: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        fillText: () => {},
        strokeText: () => {},
        drawImage: () => {},
        createImageData: (w: number, h: number) =>
          ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) as ImageData,
        getImageData: (sx: number, sy: number, sw: number, sh: number) => {
          ensureBuffer();
          const out = new Uint8ClampedArray(sw * sh * 4);
          for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
              const srcIdx = ((sy + y) * internal.width + (sx + x)) * 4;
              const dstIdx = (y * sw + x) * 4;
              if (internal.pixels && srcIdx >= 0 && srcIdx + 3 < internal.pixels.length) {
                out[dstIdx] = internal.pixels[srcIdx];
                out[dstIdx + 1] = internal.pixels[srcIdx + 1];
                out[dstIdx + 2] = internal.pixels[srcIdx + 2];
                out[dstIdx + 3] = internal.pixels[srcIdx + 3];
              }
            }
          }
          return { data: out, width: sw, height: sh } as ImageData;
        },
        putImageData: (imageData: ImageData, dx: number, dy: number) => {
          ensureBuffer();
          if (!internal.pixels) return;
          const { data, width: w, height: h } = imageData;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const srcIdx = (y * w + x) * 4;
              const dstIdx = ((dy + y) * internal.width + (dx + x)) * 4;
              if (dstIdx >= 0 && dstIdx + 3 < internal.pixels.length) {
                internal.pixels[dstIdx] = data[srcIdx];
                internal.pixels[dstIdx + 1] = data[srcIdx + 1];
                internal.pixels[dstIdx + 2] = data[srcIdx + 2];
                internal.pixels[dstIdx + 3] = data[srcIdx + 3];
              }
            }
          }
        },
        clearRect: (x: number, y: number, w: number, h: number) => {
          ensureBuffer();
          if (!internal.pixels) return;
          for (let yy = y; yy < y + h; yy++) {
            for (let xx = x; xx < x + w; xx++) {
              const idx = (yy * internal.width + xx) * 4;
              if (idx >= 0 && idx + 3 < internal.pixels.length) {
                internal.pixels[idx] = 0;
                internal.pixels[idx + 1] = 0;
                internal.pixels[idx + 2] = 0;
                internal.pixels[idx + 3] = 0;
              }
            }
          }
        },
        fillRect: (x: number, y: number, w: number, h: number) => {
          ensureBuffer();
          if (!internal.pixels) return;
          // Parse the fillStyle as #rrggbb; fall back to black on
          // unknown formats. Sufficient for the brush / fill / mask
          // helpers — they all pass hex strings.
          const fill = String(ctx.fillStyle ?? "#000000");
          let r = 0, g = 0, b = 0, a = 255;
          if (fill.startsWith("#") && fill.length >= 7) {
            r = parseInt(fill.slice(1, 3), 16);
            g = parseInt(fill.slice(3, 5), 16);
            b = parseInt(fill.slice(5, 7), 16);
          }
          for (let yy = y; yy < y + h; yy++) {
            for (let xx = x; xx < x + w; xx++) {
              const idx = (yy * internal.width + xx) * 4;
              if (idx >= 0 && idx + 3 < internal.pixels.length) {
                internal.pixels[idx] = r;
                internal.pixels[idx + 1] = g;
                internal.pixels[idx + 2] = b;
                internal.pixels[idx + 3] = a;
              }
            }
          }
        },
        strokeRect: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => null,
        measureText: (text: string) => ({ width: text.length * 6 }),
      };
      return ctx;
    }
    return originalGetContext.call(this, contextType, ...rest);
  } as typeof HTMLCanvasElement.prototype.getContext;

  // toDataURL just needs to return a syntactically valid data URL so
  // serializeLayer roundtrip tests can compare strings without
  // exploding. Real PNG bytes are out of scope for jsdom.
  HTMLCanvasElement.prototype.toDataURL = function toDataURL(): string {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQYV2NkYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==";
  };

  // Path2D shim — jsdom doesn't ship one. The hydrateVectorLayer
  // helper uses `new Path2D(d)`; we just store the string and let the
  // 2D context's fill/stroke no-op handle the rest.
  if (typeof (globalThis as any).Path2D === "undefined") {
    (globalThis as any).Path2D = class { constructor(public d?: string) {} };
  }
};

installCanvasMock();


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
