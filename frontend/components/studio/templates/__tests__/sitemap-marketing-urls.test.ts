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
import { AUDIENCE_BY_ID } from "../audiences";
import { TEMPLATE_CATALOG } from "../catalog";
import { LIFE_STAGE_AUDIENCES, audienceSlug } from "../../../../../shared/audiences";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITEMAP_PATH = resolve(__dirname, "../../../../public/sitemap.xml");
const sitemap = readFileSync(SITEMAP_PATH, "utf8");

function extractPaths(prefix: string): string[] {
  // Cheap regex over the static XML — we don't need a real parser since
  // every entry is a single `<url><loc>…</loc>…</url>` block.
  const re = new RegExp(
    `https://hired\\.video${prefix.replace(/\//g, "\\/")}([^<]+)`,
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

  it("every life-stage audience has a sitemap entry", () => {
    const slugs = new Set(extractPaths("/for/"));
    for (const key of LIFE_STAGE_AUDIENCES) {
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
});
