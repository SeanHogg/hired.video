/**
 * Discovery job board (#83) + salary SEO pages (#81): AI-ranked active
 * listings, "more like this", and per-role / per-city salary aggregates.
 * Reads go through repositories/jobBoardReadsRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { getCachedSearch } from "../../utils/search-cache.js";
import { toJsonSafe } from "../../utils/json-safe.js";
import { getSubscription } from "../billing/BillingService.js";
import { scoreJobsForRanking } from "../job/ranking.js";
import { getPopularCities, getPopularRoles } from "../job/salary-popularity.js";
import {
  findJobTitleAndCompany,
  listActiveJobsByTitleToken,
  listJobBoardPool,
  listSalaryBoundsForRole,
} from "../../repositories/jobBoardReadsRepository.js";

export interface RankedJobsQuery {
  q: string;
  location: string;
  remote: boolean;
  limit: number;
  viewerId: string | null | undefined;
}

/** Active jobs ranked by relevance to `q` + recency (Pro gets a bigger
 *  pool and priority ranking). */
export async function rankJobBoard(query: RankedJobsQuery) {
  const { q, location, remote, limit, viewerId } = query;
  const isPro = viewerId ? (await getSubscription(viewerId)).isPro : false;

  // The candidate POOL depends only on (remote, location, pool size) —
  // never on the viewer — so it's shared via the versioned search cache
  // (job writes bumpSearchVersion; 120s TTL backstop). Per-viewer ranking
  // (q + isPro) runs in memory below. createdAt arrives as an ISO string
  // on a cache hit; scoreJobsForRanking accepts Date | string.
  const poolSize = isPro ? 200 : 100;
  const poolKey = `discovery-jobs-pool:${JSON.stringify([remote ? 1 : 0, location.toLowerCase(), poolSize])}`;
  const jobs = await getCachedSearch(poolKey, async () =>
    toJsonSafe(await listJobBoardPool(getDb(), { remote, location: location.toLowerCase(), limit: poolSize })),
  ).catch(() => []);

  const ranked = scoreJobsForRanking(jobs, q, isPro);
  return {
    items: ranked.slice(0, limit).map(({ _score: _, sponsored: __, sponsoredRankBoost: ___, ...j }) => j),
    total: ranked.length,
    query: q,
    priorityRanked: isPro,
  };
}

/** Up to 5 newest active jobs sharing the first significant title word. */
export async function findSimilarJobs(jobId: string) {
  const db = getDb();
  const job = await findJobTitleAndCompany(db, jobId);
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found");
  const titleWords = String(job.title ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const similar = await listActiveJobsByTitleToken(db, titleWords[0] ?? null, 6);
  return similar.filter((j) => j.id !== jobId).slice(0, 5);
}

const toSalaryNumber = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Salary aggregate for a role slug, optionally narrowed to a city slug
 * (`san-francisco` → `san francisco`, LIKE-matched against the free-text
 * location). Related cities/roles feed Glassdoor-style internal linking;
 * cities only when not already drilled down to a location.
 */
export async function getSalaryForRole(jobSlugRaw: string, locationSlugRaw: string | null) {
  const jobSlug = jobSlugRaw.replace(/-/g, " ").toLowerCase();
  const locationToken = locationSlugRaw?.replace(/-/g, " ").toLowerCase() ?? null;

  const rows = await listSalaryBoundsForRole(getDb(), { titleToken: jobSlug, locationToken, limit: 200 }).catch(
    () => [] as Array<{ salaryMin: string | null; salaryMax: string | null }>,
  );
  const salaries = rows
    .flatMap((r) => [toSalaryNumber(r.salaryMin), toSalaryNumber(r.salaryMax)])
    .filter((s): s is number => s !== null);

  const avg = salaries.length ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length) : null;
  const min = salaries.length ? Math.min(...salaries) : null;
  const max = salaries.length ? Math.max(...salaries) : null;

  const [relatedCities, relatedRoles] = await Promise.all([
    locationSlugRaw ? Promise.resolve([]) : getPopularCities(12),
    getPopularRoles(50).then((roles) =>
      roles.filter((r) => r.slug !== jobSlugRaw && r.title !== jobSlug).slice(0, 8),
    ),
  ]);

  return {
    jobTitle: jobSlug,
    jobSlug: jobSlugRaw,
    location: locationToken,
    locationSlug: locationSlugRaw,
    currency: "USD",
    averageSalary: avg,
    minSalary: min,
    maxSalary: max,
    sampleSize: rows.length,
    relatedCities,
    relatedRoles,
    lastUpdated: new Date().toISOString(),
  };
}

/** Popular roles + cities seeding the /salary index and city × role grid. */
export async function getSalaryIndex() {
  const roles = await getPopularRoles(50);
  const cities = await getPopularCities(30);
  return { roles, cities };
}
