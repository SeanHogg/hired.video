#!/usr/bin/env node
/**
 * One-shot sitemap hreflang regenerator (gap #1471).
 *
 * Walks `public/sitemap.xml`, finds every `<url>` block that does NOT already
 * carry `<xhtml:link rel="alternate" hreflang="…">` annotations, and inserts
 * one block per supported locale + an `x-default`. The original `<loc>` is
 * used to build the `?lang=X` variants — matching the SPA's i18n bootstrap
 * which honours `?lang=` as the locale override.
 *
 * Idempotent: re-runs are no-ops on URLs that already have hreflang blocks.
 *
 * Why a regenerator instead of hand-editing 163 blocks: the sitemap is the
 * canonical SEO surface for the long-tail of `/tools/*`, `/companies/*`,
 * `/salaries/*`, `/resume-guide/*` URLs, and forgetting any of them silently
 * hides the localized Spanish + Quebec-French variants from Google. The
 * regen happens in O(seconds) and stays trustworthy under future edits.
 *
 * Run: `node frontend/scripts/regenerate-sitemap-hreflang.mjs`
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SITEMAP_PATH = resolve(__dirname, "..", "public", "sitemap.xml");

const SUPPORTED_LOCALES = ["en", "es", "fr-CA"];
const DEFAULT_LOCALE = "en";

/** Build the `<xhtml:link>` block for a given canonical URL. The English
 *  variant is the canonical (no `?lang=` query); the rest append `?lang=X`
 *  via the existing SPA bootstrap convention. */
function buildHreflangBlock(canonicalUrl) {
  const lines = [
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${canonicalUrl}" />`,
  ];
  for (const locale of SUPPORTED_LOCALES) {
    const href =
      locale === DEFAULT_LOCALE
        ? canonicalUrl
        : `${canonicalUrl}${canonicalUrl.includes("?") ? "&" : "?"}lang=${locale}`;
    lines.push(
      `    <xhtml:link rel="alternate" hreflang="${locale}" href="${href}" />`,
    );
  }
  return lines.join("\n");
}

const src = readFileSync(SITEMAP_PATH, "utf8");

// Match every `<url>...</url>` block. The (?:[\s\S]*?) inner pattern is
// lazy so blocks don't overlap; multi-line `<loc>` and `<lastmod>` placement
// inside the block doesn't matter.
const URL_BLOCK_RE = /<url>([\s\S]*?)<\/url>/g;

let touched = 0;
let skipped = 0;

const next = src.replace(URL_BLOCK_RE, (match, inner) => {
  // Already has hreflang annotations — leave untouched.
  if (/xhtml:link\s+rel="alternate"\s+hreflang=/.test(inner)) {
    skipped += 1;
    return match;
  }
  // Extract the canonical URL from `<loc>...</loc>`. We can't synthesize
  // a sitemap entry without one.
  const locMatch = inner.match(/<loc>([^<]+)<\/loc>/);
  if (!locMatch) {
    skipped += 1;
    return match;
  }
  const canonical = locMatch[1].trim();
  const block = buildHreflangBlock(canonical);
  // Insert before the closing `</url>` so the hreflang block sits at the
  // end of the entry — same shape as the hand-authored entries.
  touched += 1;
  return `<url>${inner.trimEnd()}\n${block}\n  </url>`;
});

if (touched === 0) {
  console.log(`No changes — every <url> already has hreflang (${skipped} skipped).`);
  process.exit(0);
}

writeFileSync(SITEMAP_PATH, next);
console.log(`Updated ${touched} <url> blocks (${skipped} already had hreflang).`);
