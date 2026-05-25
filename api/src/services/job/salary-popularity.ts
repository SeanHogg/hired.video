/**
 * Popular-roles / popular-cities derivation for the salary SEO surface.
 *
 * Single source of truth used by:
 *   - GET /api/discovery/seo/salary-index            → /salary index page
 *   - GET /api/discovery/seo/salary/:jobSlug         → "related cities" section
 *   - GET /sitemap.xml                                → city × role URL grid
 *
 * Free-text location parsing is intentionally lenient: hired.video aggregates
 * job listings from many sources, so `location` is rarely normalised. We split
 * on common separators, drop noise tokens ("Remote", "Hybrid", postal codes),
 * and count the most frequent first-segment city tokens. Frequency is the
 * popularity signal — the most-listed-against role/city wins.
 *
 * Both lists are kept short by design (top N). They feed sitemap/index/
 * related-links surfaces where a long tail would burn crawl budget on
 * empty intersections.
 */

import { sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const NOISE_TOKENS = new Set([
  "remote",
  "hybrid",
  "on-site",
  "onsite",
  "anywhere",
  "any",
  "n/a",
  "various",
  "multiple-locations",
]);

const STOPWORDS = new Set([
  "a", "an", "the", "for", "of", "and", "or",
  "i", "ii", "iii", "iv", "v",
]);

export interface PopularRole {
  slug: string;
  title: string;
  jobCount: number;
}

export interface PopularCity {
  slug: string;
  label: string;
  jobCount: number;
}

export function slugifyForSalary(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip seniority / level qualifiers so "Senior Software Engineer" and
 *  "Software Engineer II" collapse to the same indexable slug. The salary
 *  SEO surface targets *role* intent, not level intent. */
export function normaliseTitle(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[\(\)\[\]\{\}]/g, " ")
    .replace(/[^a-z0-9\s\-/]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
  return cleaned;
}

/** Pull the city portion out of a free-text location string. We accept the
 *  first comma-separated segment; if it's noise, the whole string is
 *  rejected. Returns `null` when nothing usable surfaces. */
export function extractCity(location: string): string | null {
  const head = location.split(",")[0]?.trim();
  if (!head) return null;
  const slug = slugifyForSalary(head);
  if (!slug || NOISE_TOKENS.has(slug)) return null;
  if (/^\d+$/.test(slug)) return null; // postal codes
  if (slug.length < 3) return null;
  return head;
}

interface PopularityCacheEntry<T> {
  expiresAt: number;
  value: T;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — sitemap regeneration cadence.
let rolesCache: PopularityCacheEntry<PopularRole[]> | null = null;
let citiesCache: PopularityCacheEntry<PopularCity[]> | null = null;

/** Top N role slugs by active job count. Cached for an hour. */
export async function getPopularRoles(limit = 50): Promise<PopularRole[]> {
  if (rolesCache && rolesCache.expiresAt > Date.now()) {
    return rolesCache.value.slice(0, limit);
  }
  const db = getDb();
  const rows = await db
    .select({ title: schema.jobItems.title })
    .from(schema.jobItems)
    .where(sql`${schema.jobItems.isActive} = true AND ${schema.jobItems.title} IS NOT NULL`)
    .limit(5000)
    .catch(() => [] as { title: string | null }[]);

  const counts = new Map<string, { slug: string; title: string; count: number }>();
  for (const row of rows) {
    if (!row.title) continue;
    const normalised = normaliseTitle(row.title);
    if (!normalised || normalised.length < 3) continue;
    const slug = slugifyForSalary(normalised);
    if (!slug) continue;
    const existing = counts.get(slug);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(slug, { slug, title: normalised, count: 1 });
    }
  }

  const sorted = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .map<PopularRole>((r) => ({ slug: r.slug, title: r.title, jobCount: r.count }));

  rolesCache = { value: sorted, expiresAt: Date.now() + CACHE_TTL_MS };
  return sorted.slice(0, limit);
}

/** Top N city slugs by active job count. Cached for an hour. */
export async function getPopularCities(limit = 30): Promise<PopularCity[]> {
  if (citiesCache && citiesCache.expiresAt > Date.now()) {
    return citiesCache.value.slice(0, limit);
  }
  const db = getDb();
  const rows = await db
    .select({ location: schema.jobItems.location })
    .from(schema.jobItems)
    .where(sql`${schema.jobItems.isActive} = true AND ${schema.jobItems.location} IS NOT NULL`)
    .limit(5000)
    .catch(() => [] as { location: string | null }[]);

  const counts = new Map<string, { slug: string; label: string; count: number }>();
  for (const row of rows) {
    if (!row.location) continue;
    const city = extractCity(row.location);
    if (!city) continue;
    const slug = slugifyForSalary(city);
    if (!slug) continue;
    const existing = counts.get(slug);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(slug, { slug, label: city, count: 1 });
    }
  }

  const sorted = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .map<PopularCity>((c) => ({ slug: c.slug, label: c.label, jobCount: c.count }));

  citiesCache = { value: sorted, expiresAt: Date.now() + CACHE_TTL_MS };
  return sorted.slice(0, limit);
}

/** Test/dev helper to drop the in-process cache between requests. */
export function clearSalaryPopularityCache() {
  rolesCache = null;
  citiesCache = null;
}
