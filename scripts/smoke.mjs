#!/usr/bin/env node

/**
 * Runtime smoke harness for hired.video.
 *
 * The static quality gate (frontend/scripts/quality-check.mjs) proves the code
 * *compiles, lints, and type-checks*. It does NOT prove the running app answers
 * an HTTP request — which is exactly how a change can pass CI and still 500 in
 * the browser. This harness closes that gap: it drives the live API + web dev
 * servers over HTTP and asserts the real, no-auth surface actually responds.
 *
 * It deliberately needs NO credentials: every probe targets a public endpoint
 * or the auth gate itself (which must answer 401, never 500). That keeps the
 * check fast, deterministic, and runnable on every change.
 *
 * Usage:
 *   node scripts/smoke.mjs                 # probe API + web
 *   node scripts/smoke.mjs --api-only      # probe API only
 *   node scripts/smoke.mjs --web-only      # probe web only
 *   node scripts/smoke.mjs --json          # machine-readable output for CI
 *
 * Config (env):
 *   SMOKE_API_URL   default http://localhost:8787   (wrangler dev; node serve = :3000)
 *   SMOKE_WEB_URL   default http://localhost:4003   (vite dev)
 *   SMOKE_TIMEOUT   per-request timeout ms, default 8000
 *
 * Exit code: 0 = all green, 1 = at least one failure (use in CI / pre-deploy).
 */

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const API_ONLY = args.includes("--api-only");
const WEB_ONLY = args.includes("--web-only");

const API_BASE = (process.env.SMOKE_API_URL || "http://localhost:8787").replace(/\/$/, "");
const WEB_BASE = (process.env.SMOKE_WEB_URL || "http://localhost:4003").replace(/\/$/, "");
const TIMEOUT = parseInt(process.env.SMOKE_TIMEOUT || "8000", 10);

/**
 * Each check is one assertion against the running app.
 *   base     'api' | 'web'      which server to hit
 *   method   HTTP verb          default GET
 *   path     request path
 *   expect   number[]           acceptable status codes (default [200])
 *   contains string             substring the response body MUST contain
 *   json     (body) => true|str return a string to describe a body-shape failure
 *
 * NOTE on `expect`: a 4xx from a public listing is "the app answered" — fine.
 * The failure signal we care about is 5xx (server threw) or a refused socket
 * (server down). Auth-gated probes assert [401] so a regression that turns the
 * auth middleware into a 500 is caught.
 */
const CHECKS = [
  // ── API: liveness + DB connectivity ───────────────────────────────────
  {
    base: "api", path: "/health", expect: [200, 503],
    json: (b) => (b && (b.status === "ok" || b.status === "error") ? true : "no status field"),
    note: "200 = DB reachable, 503 = API up but DB down (still a real answer)",
  },
  { base: "api", path: "/api/health", expect: [200, 503] },

  // ── API: public, no-param GET surface (must be 200) ────────────────────
  { base: "api", path: "/api/openapi.json", expect: [200], contains: "openapi" },
  { base: "api", path: "/api/billing/pricing-config", expect: [200] },
  { base: "api", path: "/api/_meta/geo", expect: [200] },
  { base: "api", path: "/api/legal/list", expect: [200] },
  { base: "api", path: "/api/jobs/public", expect: [200] },
  { base: "api", path: "/sitemap.xml", expect: [200] },

  // ── API: auth gate sanity — must REJECT cleanly, not crash ─────────────
  // If this returns 5xx the auth/middleware stack is broken; 401 proves the
  // gate is intact. This is the single most useful "did I break the API" probe.
  { base: "api", path: "/api/users/me", expect: [401] },

  // ── Web: SPA shell serves ──────────────────────────────────────────────
  { base: "web", path: "/", expect: [200], contains: 'id="root"' },
  // Deep route → SPA fallback must still return the shell (not a 404/500).
  { base: "web", path: "/pricing", expect: [200], contains: 'id="root"' },
];

const baseUrl = (base) => (base === "api" ? API_BASE : WEB_BASE);

async function runCheck(check) {
  const url = baseUrl(check.base) + check.path;
  const method = check.method || "GET";
  const expect = check.expect || [200];
  const started = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { method, signal: controller.signal, redirect: "manual" });
    const ms = Date.now() - started;
    const statusOk = expect.includes(res.status);

    let bodyText = "";
    if (check.contains || check.json) {
      bodyText = await res.text();
    }

    const failures = [];
    if (!statusOk) failures.push(`status ${res.status}, expected ${expect.join("|")}`);
    if (check.contains && !bodyText.includes(check.contains)) {
      failures.push(`body missing "${check.contains}"`);
    }
    if (check.json) {
      let parsed;
      try { parsed = JSON.parse(bodyText); } catch { failures.push("body is not JSON"); }
      if (parsed !== undefined) {
        const verdict = check.json(parsed);
        if (verdict !== true) failures.push(`json: ${verdict}`);
      }
    }

    return {
      name: `${method} ${check.base}:${check.path}`,
      passed: failures.length === 0,
      status: res.status, ms, reason: failures.join("; "), note: check.note,
    };
  } catch (err) {
    const ms = Date.now() - started;
    const refused = /ECONNREFUSED|fetch failed|aborted/i.test(String(err?.message || err));
    return {
      name: `${method} ${check.base}:${check.path}`,
      passed: false, status: 0, ms,
      reason: refused ? `UNREACHABLE — is the ${check.base} server up? (${baseUrl(check.base)})` : String(err?.message || err),
      note: check.note,
    };
  } finally {
    clearTimeout(timer);
  }
}

const selected = CHECKS.filter((c) => (API_ONLY ? c.base === "api" : WEB_ONLY ? c.base === "web" : true));

const results = [];
for (const check of selected) {
  results.push(await runCheck(check));
}

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;

if (JSON_OUT) {
  console.log(JSON.stringify({ passed, failed, results }, null, 2));
} else {
  console.log("\n🔎 hired.video smoke harness");
  console.log(`   API: ${API_BASE}   WEB: ${WEB_BASE}\n`);
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const status = r.status ? `[${r.status}]` : "[---]";
    console.log(`${icon} ${status} ${r.name}  (${r.ms}ms)`);
    if (!r.passed) console.log(`      ↳ ${r.reason}`);
  }
  console.log("\n────────────────────────────────────────");
  console.log(`${failed === 0 ? "✅" : "❌"} ${passed}/${results.length} checks passed`);
  if (failed > 0) {
    console.log("\nThe running app is NOT fully healthy. Start the servers if they are down:");
    console.log("   API:  cd api && npm run dev          (→ :8787)");
    console.log("   WEB:  cd frontend && npm run dev     (→ :4003)");
  }
}

process.exit(failed === 0 ? 0 : 1);
