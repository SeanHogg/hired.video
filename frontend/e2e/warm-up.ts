/**
 * Playwright global setup for the visual suite: load each harness page once
 * in a throwaway browser so the Vite dev server transforms (and caches) the
 * module graph before the timed tests start. Without it the first
 * `page.goto` on a cold server spends its whole budget on transforms.
 */
import { chromium, type FullConfig } from "@playwright/test";

const HARNESS_PAGES = ["/e2e/visual/widget-parity.html"];

export default async function warmUp(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const path of HARNESS_PAGES) {
      await page.goto(new URL(path, baseURL).toString(), { waitUntil: "load", timeout: 240_000 });
      await page.waitForFunction(() => (window as unknown as { __parityReady?: boolean }).__parityReady === true, null, {
        timeout: 240_000,
      });
    }
  } finally {
    await browser.close();
  }
}
