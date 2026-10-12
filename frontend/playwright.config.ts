/**
 * Playwright config for the visual suite (`npm run test:visual`, #2312).
 *
 * Specs are `*.pw.ts` so vitest (which collects `*.test.*` / `*.spec.*`)
 * never picks them up. The harness pages under e2e/ are test-only: the Vite
 * dev server serves them, and they are not build inputs, so they never
 * reach a deployed build or a public route. Headless Chromium, like
 * scripts/smoke-browser.mjs.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.VISUAL_PORT ?? 4317);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  // A cold Vite server transforms the whole widget / timeline graph on the
  // first page load (tens of seconds in CI); a warm one answers in < 1 s.
  // The warm-up (e2e/warm-up.ts) pays that cost once, before any test.
  globalSetup: "./e2e/warm-up.ts",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    navigationTimeout: 120_000,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // 1× pixels: a stage at zoom 1 and a canvas of the same size line up
      // pixel for pixel.
      // Wide enough for a DOM + canvas pair side by side (2 × 640 + gaps).
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1, viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `${BASE_URL}/e2e/visual/widget-parity.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
