#!/usr/bin/env node

/**
 * Browser front-end smoke test for hired.video (Playwright / headless Chromium).
 *
 * The HTTP harness (scripts/smoke.mjs) confirms the SPA *shell* serves, but a
 * 200 on index.html says nothing about whether the app actually renders — a
 * broken bundle, a missing hashed chunk, or a render-time exception all still
 * return a perfectly valid shell and then white-screen in the browser.
 *
 * This test drives a real headless browser and asserts, per public route:
 *   1. the document responded < 400
 *   2. no document/script/stylesheet request 404'd or 5xx'd
 *      (the classic post-deploy "hashed JS chunk vanished" break)
 *   3. React actually MOUNTED — #root gains child nodes within the timeout
 *   4. no uncaught page exception fired during load (the real white-screen cause)
 *
 * Console.error output is reported but does NOT fail the run: production pages
 * legitimately emit third-party console noise (pixels, SW, analytics), so
 * treating it as fatal would just create false negatives. Uncaught exceptions
 * (pageerror) and an empty #root are the high-signal failures.
 *
 * Read-only: it only GET-navigates public marketing/listing pages. No writes.
 *
 * Usage:
 *   node scripts/smoke-browser.mjs            # defaults to PRODUCTION
 *   SMOKE_WEB_URL=http://localhost:4003 node scripts/smoke-browser.mjs
 *   node scripts/smoke-browser.mjs --json
 *
 * Config (env):
 *   SMOKE_WEB_URL       default https://hired.video
 *   SMOKE_NAV_TIMEOUT   per-page navigation timeout ms, default 20000
 *   SMOKE_MOUNT_TIMEOUT React-mount wait ms, default 10000
 *
 * Exit code: 0 = every route rendered, 1 = at least one route failed.
 */

import { chromium } from "playwright";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");

const WEB_BASE = (process.env.SMOKE_WEB_URL || "https://hired.video").replace(/\/$/, "");
const NAV_TIMEOUT = parseInt(process.env.SMOKE_NAV_TIMEOUT || "20000", 10);
const MOUNT_TIMEOUT = parseInt(process.env.SMOKE_MOUNT_TIMEOUT || "10000", 10);

// Public, no-auth pages. Each must mount React, not just serve the shell.
const ROUTES = ["/", "/pricing", "/jobs", "/companies", "/people", "/articles"];

async function checkRoute(browser, route) {
  const url = WEB_BASE + route;
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];

  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", (r) => {
    const rt = r.request().resourceType();
    if (["document", "script", "stylesheet"].includes(rt) && r.status() >= 400) {
      badResponses.push(`${r.status()} ${rt} ${r.url()}`);
    }
  });

  const started = Date.now();
  let status = 0;
  let mounted = false;
  let title = "";
  let navError = "";

  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    status = resp ? resp.status() : 0;
    // The real assertion: did the app render anything into #root?
    try {
      await page.waitForFunction(
        () => {
          const r = document.getElementById("root");
          return !!r && r.children.length > 0;
        },
        { timeout: MOUNT_TIMEOUT },
      );
      mounted = true;
    } catch { /* mounted stays false → reported below */ }
    title = await page.title().catch(() => "");
  } catch (e) {
    navError = String(e?.message || e).split("\n")[0];
  }

  const ms = Date.now() - started;

  const failures = [];
  if (navError) failures.push(`navigation failed: ${navError}`);
  if (status >= 400) failures.push(`document status ${status}`);
  if (badResponses.length) failures.push(`asset failures: ${badResponses.slice(0, 3).join(" | ")}`);
  if (!mounted && !navError) failures.push("React did not mount (#root has no children) — white screen");
  if (pageErrors.length) failures.push(`uncaught: ${pageErrors.slice(0, 2).join(" | ")}`);

  await context.close();

  return {
    name: `GET ${route}`,
    passed: failures.length === 0,
    status, mounted, ms, title,
    reason: failures.join("; "),
    consoleErrors: consoleErrors.slice(0, 5),
  };
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const route of ROUTES) {
    results.push(await checkRoute(browser, route));
  }
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;

if (JSON_OUT) {
  console.log(JSON.stringify({ base: WEB_BASE, passed, failed, results }, null, 2));
} else {
  console.log("\n🌐 hired.video browser smoke test");
  console.log(`   Target: ${WEB_BASE}\n`);
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const mount = r.mounted ? "mounted" : "NO-MOUNT";
    console.log(`${icon} [${r.status || "---"}] ${r.name}  (${mount}, ${r.ms}ms)`);
    if (!r.passed) console.log(`      ↳ ${r.reason}`);
    if (r.consoleErrors.length) {
      console.log(`      · ${r.consoleErrors.length} console error(s) (not failing): ${r.consoleErrors[0].slice(0, 100)}`);
    }
  }
  console.log("\n────────────────────────────────────────");
  console.log(`${failed === 0 ? "✅" : "❌"} ${passed}/${results.length} pages rendered`);
}

process.exit(failed === 0 ? 0 : 1);
