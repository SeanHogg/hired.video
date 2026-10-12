#!/usr/bin/env node
/**
 * Build-time generator for the marketing part of `public/sitemap.xml` and
 * `public/landing-manifest.json` (#920).
 *
 *   - sitemap.xml: rewrites ONLY the section between the GENERATED markers —
 *     every /for/:audience (profession + life-stage) and /templates/:slug
 *     URL — from AUDIENCES, LIFE_STAGE_AUDIENCE_REGISTRY and
 *     TEMPLATE_CATALOG, stamped with today's date. Everything else in the
 *     file (legal, blog, tools, …) stays hand-maintained. A marketing URL
 *     hand-listed outside the markers fails the build.
 *   - landing-manifest.json: one prerender route per /for/:audience page,
 *     consumed by scripts/prerender.mjs.
 *
 * The registries are TypeScript behind `@/` + `@shared` aliases, so they
 * load through Vite's SSR module loader (same approach as
 * generate-templates-manifest.mjs); the logic lives in the pure,
 * unit-tested scripts/sitemap/marketing-sitemap.ts.
 *
 * Run: from `npm run build` before prerender. Standalone:
 *   node frontend/scripts/generate-sitemap.mjs
 */

import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITEMAP = path.join(ROOT, "public", "sitemap.xml");
const MANIFEST = path.join(ROOT, "public", "landing-manifest.json");
const EN_LOCALE = path.join(ROOT, "public", "locales", "en.json");

function englishString(en, key) {
  const value = en[key];
  if (typeof value !== "string" || !value) throw new Error(`[sitemap] missing en.json key "${key}"`);
  return value;
}

async function main() {
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  try {
    const mod = await server.ssrLoadModule("/scripts/sitemap/registries.ts");
    const { registries, professions, lifeStages } = mod.loadMarketingRegistries();
    const lastmod = new Date().toISOString().slice(0, 10);

    const entries = mod.marketingSitemapEntries(registries);
    const xml = fs.readFileSync(SITEMAP, "utf8");
    const next = mod.spliceGeneratedSection(xml, mod.renderGeneratedSection(entries, lastmod));
    fs.writeFileSync(SITEMAP, next, "utf8");

    const en = JSON.parse(fs.readFileSync(EN_LOCALE, "utf8"));
    const routes = mod.landingPrerenderRoutes(professions, lifeStages, {
      profession: englishString(en, "seoLanding.profession.seoTitle"),
      professionDescription: englishString(en, "seoLanding.profession.seoDescription"),
      lifeStage: englishString(en, "seoLanding.lifeStage.seoTitle"),
      eyebrow: englishString(en, "audiences.forBadge"),
    });
    fs.writeFileSync(MANIFEST, JSON.stringify(routes, null, 2) + "\n", "utf8");

    console.log(
      `[sitemap] ${entries.length} generated URLs (${registries.professionIds.length} profession + ${registries.lifeStageSlugs.length} life-stage audiences, ${registries.templateIds.length} templates) → public/sitemap.xml; ${routes.length} /for/ routes → public/landing-manifest.json`,
    );
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error("[sitemap] FAILED:", err);
  process.exit(1);
});
