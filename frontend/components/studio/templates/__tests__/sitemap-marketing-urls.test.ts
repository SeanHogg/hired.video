// Regression guard for the marketing-page sitemap entries.
//
// The static [public/sitemap.xml](../../../../../public/sitemap.xml) hand-
// lists every `/for/:audience` + `/templates/:slug` URL the public crawler
// should index. If those slugs drift from the actual route resolvers
// (`AudienceLandingPage` matches against `AUDIENCE_BY_ID`,
// `TemplateLandingPage` matches against `TEMPLATE_CATALOG`), the
// crawler hits a 404-equivalent (`<Navigate to="/studio" />`) and SEO
// silently dies.
//
// This test parses the sitemap and asserts every marketing URL resolves
// to a live audience or template id. Caught the plural-vs-singular bug
// in 2026-05-22 (/for/athletes → 404 because the id is `athlete`); the
// proper long-term fix is sitemap auto-generation (#920).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { AUDIENCE_BY_ID } from "@/lib/studio/templates/audiences";
import { TEMPLATE_CATALOG } from "@/lib/studio/templates/catalog";
import { LIFE_STAGE_AUDIENCES, audienceSlug } from "../../../../../shared/audiences";
import { LIFE_STAGE_AUDIENCE_REGISTRY } from "../../../../../shared/audiences-registry";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITEMAP_PATH = resolve(__dirname, "../../../../public/sitemap.xml");
const sitemap = readFileSync(SITEMAP_PATH, "utf8");

function extractPaths(prefix: string): string[] {
  // Scope to canonical `<loc>...</loc>` URLs only — `<xhtml:link>`
  // hreflang annotations (gap #1471) embed `?lang=X` variants of the
  // same URLs and would otherwise double-match. The original looser
  // pattern was `[^<]+` across the whole file, which pulled in the
  // trailing `" />` fragment of the xhtml:link tag once hreflang
  // annotations existed.
  const re = new RegExp(
    `<loc>https://hired\\.video${prefix.replace(/\//g, "\\/")}([^<]+)</loc>`,
    "g",
  );
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(sitemap)) !== null) {
    out.push(match[1]);
  }
  return out;
}

describe("sitemap.xml marketing URLs", () => {
  it("every /for/:audience slug resolves to a profession OR life-stage audience", () => {
    const slugs = extractPaths("/for/");
    expect(slugs.length).toBeGreaterThan(0);
    // Two taxonomies live under /for/: profession audiences (in
    // AUDIENCE_BY_ID, snake_case ids that double as their URL slug) and
    // life-stage audiences (LIFE_STAGE_AUDIENCES, snake_case enum keys
    // converted to kebab-case via audienceSlug()). The dispatcher in
    // AudienceLandingPage routes by taxonomy; the sitemap test mirrors
    // both lookup tables so neither axis can drift out of coverage.
    const lifeStageSlugs = new Set<string>(
      LIFE_STAGE_AUDIENCES.map((k) => audienceSlug(k)),
    );
    for (const slug of slugs) {
      const isProfession = slug in AUDIENCE_BY_ID;
      const isLifeStage = lifeStageSlugs.has(slug);
      expect(
        isProfession || isLifeStage,
        `sitemap lists /for/${slug} but no audience (profession or life-stage) with that slug exists`,
      ).toBe(true);
    }
  });

  it("every /templates/:slug points to a real template id", () => {
    const slugs = extractPaths("/templates/");
    expect(slugs.length).toBeGreaterThan(0);
    const ids = new Set(TEMPLATE_CATALOG.map((t) => t.id));
    for (const slug of slugs) {
      expect(
        ids.has(slug as never),
        `sitemap lists /templates/${slug} but no template with id "${slug}" exists`,
      ).toBe(true);
    }
  });

  it("every populated audience has a sitemap entry (no audience pages left un-indexed)", () => {
    const slugs = new Set(extractPaths("/for/"));
    for (const id of Object.keys(AUDIENCE_BY_ID)) {
      expect(
        slugs.has(id),
        `audience "${id}" is registered but has no /for/${id} entry in sitemap.xml`,
      ).toBe(true);
    }
  });

  it("every live life-stage audience has a sitemap entry", () => {
    // Only audiences whose persona is offered. With HIRING_PERSONAS_ENABLED
    // on, /for/employers + /for/recruiters are live and must be indexed; with
    // it off they drop out of the registry (and the page redirects).
    const slugs = new Set(extractPaths("/for/"));
    for (const { key } of LIFE_STAGE_AUDIENCE_REGISTRY) {
      const slug = audienceSlug(key);
      expect(
        slugs.has(slug),
        `life-stage audience "${key}" → /for/${slug} is missing from sitemap.xml`,
      ).toBe(true);
    }
  });

  it("every catalog template has a sitemap entry", () => {
    const slugs = new Set(extractPaths("/templates/"));
    for (const t of TEMPLATE_CATALOG) {
      expect(
        slugs.has(t.id),
        `template "${t.id}" is in TEMPLATE_CATALOG but has no /templates/${t.id} entry in sitemap.xml`,
      ).toBe(true);
    }
  });

  // gap #1471: every <url> block must carry hreflang annotations so the
  // Mexican / Quebec / Spanish-locale crawlers see the localized variants
  // of every URL — not just the marketing-funnel subset. The regenerator
  // at frontend/scripts/regenerate-sitemap-hreflang.mjs keeps this rule
  // satisfied; this test pins the invariant so a hand-added <url> block
  // without hreflang fails fast in CI instead of silently dropping the
  // long-tail URL from non-English crawls.
  it("every <url> block carries hreflang annotations for x-default + en + es + fr-CA", () => {
    const urlBlocks = sitemap.match(/<url>[\s\S]*?<\/url>/g) ?? [];
    expect(urlBlocks.length).toBeGreaterThan(50);
    for (const block of urlBlocks) {
      const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "(unknown)";
      expect(
        /hreflang="x-default"/.test(block),
        `<url> for ${loc} is missing hreflang="x-default" — run scripts/regenerate-sitemap-hreflang.mjs`,
      ).toBe(true);
      expect(
        /hreflang="en"/.test(block),
        `<url> for ${loc} is missing hreflang="en"`,
      ).toBe(true);
      expect(
        /hreflang="es"/.test(block),
        `<url> for ${loc} is missing hreflang="es"`,
      ).toBe(true);
      expect(
        /hreflang="fr-CA"/.test(block),
        `<url> for ${loc} is missing hreflang="fr-CA"`,
      ).toBe(true);
    }
  });
});
