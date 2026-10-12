#!/usr/bin/env node
/**
 * Build-time generator for `public/templates-manifest.json` — the enumerated
 * list of every STATIC (non-creator) marketplace template, derived from the
 * real registry SSoT so there is zero hand-maintained duplication.
 *
 * Why a generated manifest instead of importing the catalog directly:
 *   - prerender.mjs (a node/tsx build script) and api/src/routes/sitemap.ts
 *     (a Cloudflare Worker) both need slug + name + blurb for every static
 *     template, but the studio-builtin catalog ([catalog.tsx]) couples that
 *     data with React (lucide icons, IntakeForm components) and `@/` aliases
 *     that neither a plain node script nor the Worker bundle can resolve.
 *   - Vite's SSR module loader DOES resolve the app's aliases + TSX, so we
 *     load `getStaticTemplates()` through it here, at build time, and emit a
 *     plain JSON projection. The frontend remains the single source of truth;
 *     this file is a derived artifact (regenerated every build).
 *
 * Consumers:
 *   - frontend/scripts/prerender.mjs — one prerendered page per manifest row.
 *   - api/src/routes/sitemap.ts      — fetches the served JSON (cached) for
 *                                      static template <loc>s.
 *
 * Run: invoked from `npm run build` before prerender. Standalone:
 *   node frontend/scripts/generate-templates-manifest.mjs
 */

import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "templates-manifest.json");

async function main() {
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  try {
    const mod = await server.ssrLoadModule("/lib/templates/registry.ts");
    const templates = mod.getStaticTemplates();

    // Project to the listing fields the prerender + sitemap need. Keep it
    // minimal + stable — this is a public, cacheable artifact.
    const manifest = templates.map((t) => ({
      slug: t.slug,
      kind: t.kind,
      name: t.name,
      blurb: t.blurb ?? "",
      industry: t.industry ?? null,
      tags: Array.isArray(t.tags) ? t.tags : [],
    }));

    fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    const byKind = manifest.reduce((acc, m) => {
      acc[m.kind] = (acc[m.kind] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `[templates-manifest] Wrote ${manifest.length} static templates → public/templates-manifest.json`,
      byKind,
    );
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error("[templates-manifest] FAILED:", err);
  process.exit(1);
});
