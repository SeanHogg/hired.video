/**
 * Dynamic XML sitemap (#SEO): static pages + live jobs, companies, public
 * profiles, templates, articles, courses, events and public studio videos.
 * The rendered document is cached 1h (crawlers hit it often). Reads come
 * from repositories/publicSitemapRepository.ts.
 */
import { publicArticlePath, publicCompanyPath, publicJobPath, publicProfilePath } from "../../../../shared/public-paths.js";
import { slugify } from "../../../../shared/slugify.js";
// Resume-preset template slugs — the always-available fallback for the static
// template list when the generated manifest can't be fetched. The full static
// catalog (resume + studio-builtin) is the generated public/templates-
// manifest.json; both prerender + this sitemap read it so the same
// /marketplace/templates/<slug> pages are crawlable.
import { RESUME_TEMPLATE_LISTINGS } from "../../../../shared/marketplace-template-listings.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import { getPopularRoles, getPopularCities } from "../job/salary-popularity.js";
import {
  listSitemapArticles,
  listSitemapCompanies,
  listSitemapCourses,
  listSitemapCreatorTemplates,
  listSitemapEvents,
  listSitemapJobs,
  listSitemapProfiles,
  listSitemapStudioProjects,
} from "../../repositories/publicSitemapRepository.js";
import { SITEMAP_BASE as BASE, STATIC_PAGES, url, videoUrlEntry } from "./sitemapEntries.js";

/**
 * The sitemap XML for a request origin. The worker serves both this sitemap
 * and /api/og/* — `reqOrigin` is used for OG/thumbnail URLs (BASE = the SPA
 * host, which doesn't proxy /api). The whole document fans out ~10 DB
 * queries and only needs hourly freshness — the rendered string is cached 1h.
 */
export function getSitemapXml(reqOrigin: string): Promise<string> {
  return getOrSetCached<string>({
    key: `sitemap:v1:xml:${reqOrigin}`,
    ttlSeconds: 3600,
    loader: () => buildSitemapXml(reqOrigin),
  });
}

/**
 * Slugs of every STATIC marketplace template (resume + studio-builtin), read
 * from the generated, Pages-served manifest. Cached read-through (1h, matches
 * the sitemap's own cache header); on any fetch/parse failure it degrades to
 * the resume-preset slugs from the shared SSoT so the sitemap never loses the
 * core template pages. Creator-published templates are queried from the DB
 * separately.
 */
async function getStaticTemplateSlugs(): Promise<string[]> {
  const fallback = () => RESUME_TEMPLATE_LISTINGS.map((l) => l.slug);
  try {
    return await getOrSetCached<string[]>({
      key: "sitemap:static-template-slugs:v1",
      ttlSeconds: 3600,
      loader: async () => {
        const res = await fetch(`${BASE}/templates-manifest.json`, {
          cf: { cacheTtl: 3600, cacheEverything: true },
        } as RequestInit);
        if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
        const rows = (await res.json()) as Array<{ slug?: string }>;
        const slugs = Array.isArray(rows)
          ? rows.map((r) => r?.slug).filter((s): s is string => !!s)
          : [];
        if (slugs.length === 0) throw new Error("manifest empty");
        return slugs;
      },
    });
  } catch {
    return fallback();
  }
}

async function buildSitemapXml(reqOrigin: string): Promise<string> {
  const now = new Date().toISOString();

  // Fetch dynamic content (limit to recent 500 of each to keep sitemap manageable)
  const [jobs, companies, publicUsers, creatorTemplates, publicProjects, publishedArticles, publishedCourses, publicEvents] = await Promise.allSettled([
    listSitemapJobs(500),
    listSitemapCompanies(300),
    listSitemapProfiles(500),
    // Creator-published marketplace templates — /marketplace/templates/<slug>.
    // First-party (resume preset) template URLs are added from the SSoT below.
    listSitemapCreatorTemplates(500),
    // Public studio projects (every mediaKind) — /m/:id with a <video:video>
    // entry so Google can index the video + its thumbnail.
    listSitemapStudioProjects(500),
    // Published DB articles — /articles/:authorSlug/:slug.
    listSitemapArticles(500),
    // Published courses — /courses/:authorSlug/:slug.
    listSitemapCourses(500),
    // Public networking events — /events/:slug.
    listSitemapEvents(500),
  ]);

  const jobRows = jobs.status === "fulfilled" ? jobs.value : [];
  const companyRows = companies.status === "fulfilled" ? companies.value : [];
  const userRows = publicUsers.status === "fulfilled" ? publicUsers.value : [];
  const creatorTemplateRows = creatorTemplates.status === "fulfilled" ? creatorTemplates.value : [];
  const projectRows = publicProjects.status === "fulfilled" ? publicProjects.value : [];
  const articleRows = publishedArticles.status === "fulfilled" ? publishedArticles.value : [];
  const courseRows = publishedCourses.status === "fulfilled" ? publishedCourses.value : [];
  const eventRows = publicEvents.status === "fulfilled" ? publicEvents.value : [];

  // Resume-guide slugs keep their legacy derivation so historical URLs
  // stay stable. Salary URLs now ride off the canonical popular-roles /
  // popular-cities helper so the city × role grid stays consistent with
  // the /salary index page and the related-links surfaces on each leaf.
  const jobSlugs = [...new Set(
    jobRows
      .map((j) =>
        slugify(j.title, { fallback: "", maxLen: Number.POSITIVE_INFINITY, stripDiacritics: false }),
      )
      .filter(Boolean)
  )].slice(0, 200) as string[];

  const [popularRoles, popularCities, staticTemplateSlugs] = await Promise.all([
    getPopularRoles(40),
    getPopularCities(20),
    getStaticTemplateSlugs(),
  ]);

  const urls: string[] = [
    // Static pages
    ...STATIC_PAGES.map((p) => url(p.loc, now, p.changefreq, p.priority)),

    // Dynamic job listings
    ...jobRows.map((j) => url(publicJobPath(j.id), j.updatedAt?.toISOString(), "daily", "0.8")),

    // Dynamic company pages
    ...companyRows.map((c) => url(publicCompanyPath(c.slug ?? c.id), c.updatedAt?.toISOString(), "weekly", "0.7")),

    // Company reviews pages — only for companies with at least one
    // published review (skips the empty-state page which doesn't deserve
    // an index slot and would dilute crawl budget).
    ...companyRows
      .filter((c: any) => (c.reviewCount ?? 0) > 0)
      .map((c) =>
        url(`${publicCompanyPath(c.slug ?? c.id)}/reviews`, c.updatedAt?.toISOString(), "weekly", "0.8"),
      ),

    // Dynamic public profiles
    ...userRows.map((u) => url(publicProfilePath(u.slug ?? u.id), u.updatedAt?.toISOString(), "weekly", "0.6")),

    // Programmatic SEO: role-level salary pages (canonical popular roles).
    ...popularRoles.map((r) => url(`/salary/${r.slug}`, now, "weekly", "0.8")),

    // Programmatic SEO: city × role salary leaf pages. Bounded by both
    // helpers (40 × 20 = 800 max) so the sitemap stays under the 50k-URL
    // single-file limit even as job inventory grows.
    ...popularRoles.flatMap((r) =>
      popularCities.map((city) =>
        url(`/salary/${r.slug}/${city.slug}`, now, "weekly", "0.7"),
      ),
    ),

    // Programmatic SEO: resume guide pages (legacy slug derivation).
    ...jobSlugs.map((s) => url(`/resume-guide/${s}`, now, "weekly", "0.8")),

    // Static marketplace template pages (resume + studio-builtin) — from the
    // generated manifest, also prerendered with per-template meta + JSON-LD.
    ...staticTemplateSlugs.map((slug) =>
      url(`/marketplace/templates/${slug}`, now, "monthly", "0.7"),
    ),

    // Creator-published marketplace template pages (public, slugged).
    ...creatorTemplateRows
      .filter((tpl) => !!tpl.slug)
      .map((tpl) =>
        url(`/marketplace/templates/${tpl.slug}`, tpl.updatedAt?.toISOString(), "weekly", "0.6"),
      ),

    // Public DB articles — image-bearing rich result + crawlable URL.
    ...articleRows
      .filter((a) => !!a.slug)
      .map((a) =>
        url(publicArticlePath(a.authorSlug ?? a.userId, a.slug), a.updatedAt?.toISOString(), "weekly", "0.6"),
      ),

    // Published courses — Course rich result + crawlable URL.
    ...courseRows
      .filter((co) => !!co.slug)
      .map((co) =>
        url(`/courses/${co.authorSlug ?? co.userId}/${co.slug}`, co.updatedAt?.toISOString(), "weekly", "0.6"),
      ),

    // Public events — Event rich result + crawlable URL.
    ...eventRows.map((e) =>
      url(`/events/${e.slug ?? e.id}`, e.updatedAt?.toISOString(), "weekly", "0.5"),
    ),

    // Public studio projects as video-sitemap entries (thumbnail handed to
    // Google so the video is indexable). Kept last so the <video:*> blocks
    // group together.
    ...projectRows.map((p) => {
      const sb = (p.storyboard ?? null) as { _metaDescription?: string } | null;
      const title = (p.name || p.ownerName || "Video").toString();
      const description = (sb?._metaDescription || `Watch ${title} on hired.video.`).toString();
      return videoUrlEntry({
        id: p.id,
        title,
        description,
        thumbnailLoc: `${reqOrigin}/api/og/v/${p.id}`,
        lastmod: p.updatedAt?.toISOString(),
      });
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls.join("\n")}
</urlset>`;
  return xml;
}
