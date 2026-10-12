/**
 * Marketing-page sitemap + prerender entries, generated from the registries
 * (#920) instead of hand-listed XML:
 *
 *   /for/<id>           every live profession audience (lib/studio/templates/audiences.ts)
 *   /for/<kebab-key>    every live life-stage audience (shared/audiences-registry.ts)
 *   /templates/<id>     every TEMPLATE_CATALOG entry (lib/studio/templates/catalog.ts)
 *
 * Pure (strings in, strings out) so it is unit-tested without a build;
 * scripts/generate-sitemap.mjs loads the registries through Vite and calls
 * these to rewrite the generated section of public/sitemap.xml and the
 * prerender manifest for /for/:audience pages. Everything outside the
 * generated markers in sitemap.xml (legal, blog, tools, …) stays
 * hand-maintained.
 */

export const SITEMAP_ORIGIN = "https://hired.video";

/** Locales every <url> carries hreflang alternates for (gap #1471). */
export const SITEMAP_LOCALES = ["en", "es", "fr-CA"] as const;

export const GENERATED_BEGIN =
  "<!-- BEGIN GENERATED: /for/:audience + /templates/:slug from AUDIENCES, the life-stage registry and TEMPLATE_CATALOG (scripts/generate-sitemap.mjs, #920). Do not hand-edit. -->";
export const GENERATED_END = "<!-- END GENERATED -->";

export interface SitemapEntry {
  path: string;
  changefreq: "daily" | "weekly" | "monthly";
  priority: string;
}

export interface MarketingRegistries {
  /** Live profession audience ids (snake_case — the URL slug as-is). */
  professionIds: readonly string[];
  /** Live life-stage audience URL slugs (kebab-case). */
  lifeStageSlugs: readonly string[];
  /** TEMPLATE_CATALOG ids. */
  templateIds: readonly string[];
}

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

function assertSlugs(kind: string, slugs: readonly string[]): void {
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (!SLUG_RE.test(slug)) throw new Error(`[sitemap] invalid ${kind} slug: "${slug}"`);
    if (seen.has(slug)) throw new Error(`[sitemap] duplicate ${kind} slug: "${slug}"`);
    seen.add(slug);
  }
}

/** Every generated entry, in sitemap order (professions, life stages, templates). */
export function marketingSitemapEntries(reg: MarketingRegistries): SitemapEntry[] {
  assertSlugs("profession audience", reg.professionIds);
  assertSlugs("life-stage audience", reg.lifeStageSlugs);
  assertSlugs("template", reg.templateIds);
  const forPaths = [...reg.professionIds, ...reg.lifeStageSlugs];
  const clash = forPaths.find((p, i) => forPaths.indexOf(p) !== i);
  if (clash) throw new Error(`[sitemap] /for/${clash} is claimed by both audience taxonomies`);
  return [
    ...reg.professionIds.map((id) => ({ path: `/for/${id}`, changefreq: "weekly" as const, priority: "0.8" })),
    ...reg.lifeStageSlugs.map((slug) => ({ path: `/for/${slug}`, changefreq: "weekly" as const, priority: "0.7" })),
    ...reg.templateIds.map((id) => ({ path: `/templates/${id}`, changefreq: "weekly" as const, priority: "0.7" })),
  ];
}

/** One <url> block with x-default + per-locale hreflang alternates. */
export function renderUrlBlock(entry: SitemapEntry, lastmod: string): string {
  const url = `${SITEMAP_ORIGIN}${entry.path}`;
  const alternates = [
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${url}" />`,
    ...SITEMAP_LOCALES.map((lang) =>
      `    <xhtml:link rel="alternate" hreflang="${lang}" href="${lang === "en" ? url : `${url}?lang=${lang}`}" />`,
    ),
  ];
  return [
    `  <url><loc>${url}</loc><lastmod>${lastmod}</lastmod><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority>`,
    ...alternates,
    "  </url>",
  ].join("\n");
}

/** The whole generated section, markers included. */
export function renderGeneratedSection(entries: readonly SitemapEntry[], lastmod: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) throw new Error(`[sitemap] lastmod must be YYYY-MM-DD, got "${lastmod}"`);
  return [`  ${GENERATED_BEGIN}`, ...entries.map((e) => renderUrlBlock(e, lastmod)), `  ${GENERATED_END}`].join("\n");
}

/**
 * Replace the generated section of `xml` (markers included) with `section`.
 * Throws when the markers are missing or out of order, and when a marketing
 * URL is still hand-listed outside them — the hand-written entries are gone
 * for good, so one creeping back in fails the build instead of drifting.
 */
export function spliceGeneratedSection(xml: string, section: string): string {
  const begin = xml.indexOf(`  ${GENERATED_BEGIN}`);
  const endMarker = xml.indexOf(GENERATED_END);
  if (begin < 0 || endMarker < 0 || endMarker < begin) {
    throw new Error("[sitemap] generated-section markers missing or out of order in sitemap.xml");
  }
  const end = endMarker + GENERATED_END.length;
  const outside = xml.slice(0, begin) + xml.slice(end);
  const stray = outside.match(/<loc>https:\/\/hired\.video\/(?:for|templates)\/[^<]+<\/loc>/);
  if (stray) throw new Error(`[sitemap] hand-written marketing URL outside the generated section: ${stray[0]}`);
  return xml.slice(0, begin) + section + xml.slice(end);
}

/** A prerendered /for/:audience page (scripts/prerender.mjs reads these). */
export interface LandingPrerenderRoute {
  path: string;
  /** The audience's English plural label (the page's h1). */
  label: string;
  title: string;
  description: string;
  eyebrow: string;
}

export interface LandingCopy {
  slug: string;
  label: string;
  description: string;
}

/** `{{name}}` interpolation, the i18next syntax the locale files use. */
export function interpolate(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Prerender routes for every /for/:audience page, titled with the same
 * English locale templates the pages pass to useSEO (so the crawler's
 * first paint and the hydrated page agree).
 */
export function landingPrerenderRoutes(
  professions: readonly LandingCopy[],
  lifeStages: readonly LandingCopy[],
  titles: { profession: string; lifeStage: string; professionDescription: string; eyebrow: string },
): LandingPrerenderRoute[] {
  const route = (c: LandingCopy, title: string, description: string): LandingPrerenderRoute => ({
    path: `/for/${c.slug}`,
    label: c.label,
    title: interpolate(title, { label: c.label }),
    description,
    eyebrow: interpolate(titles.eyebrow, { label: c.label }),
  });
  return [
    ...professions.map((c) =>
      route(c, titles.profession, interpolate(titles.professionDescription, { blurb: c.description })),
    ),
    ...lifeStages.map((c) => route(c, titles.lifeStage, c.description)),
  ];
}
