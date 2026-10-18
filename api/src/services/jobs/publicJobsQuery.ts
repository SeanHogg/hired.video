/**
 * Public job listing use case — shared by `GET /api/jobs` and
 * `GET /api/jobs/public` (routes/jobs/listing.ts).
 *
 * Single seam that parses the search query string AND resolves the
 * structured LocationFilter into a job-id allowlist. Takes primitives
 * (query + env) instead of the Hono Context so it stays decoupled from
 * per-route Bindings typing.
 */
import { getPublicJobs } from "../job/job-queries.js";
import { buildApiDeps } from "../apiDeps.js";
import { LocationService } from "../location/LocationService.js";
import { parsePagination } from "../../utils/pagination.js";
import { getCachedSearch } from "../../utils/search-cache.js";

export type PublicJobsPage = Awaited<ReturnType<typeof getPublicJobs>>;

export async function publicJobsFromQuery(
  query: Record<string, string | undefined>,
  env: Record<string, string | undefined>,
): Promise<PublicJobsPage> {
  // Anonymous + shared result → versioned search cache. Pagination is
  // applied in SQL, so page/limit ARE part of the key. Every job write
  // calls bumpSearchVersion(), which orphans these entries. Items are
  // JSON-safe (rowToJob emits ISO date strings).
  const paramKey = `jobs-public:${JSON.stringify([
    query.page ?? "", query.limit ?? "", query.search ?? "", query.location ?? "",
    query.employmentType ?? "", query.experienceLevel ?? "", query.isRemote ?? "",
    query.salaryMin ?? "", query.salaryMax ?? "", query.workSetting ?? "", query.sector ?? "",
    query.countryId ?? "", query.stateId ?? "", query.cityId ?? "", query.radiusKm ?? "",
  ])}`;
  return getCachedSearch(paramKey, () => loadPublicJobsFromQuery(query, env));
}

async function loadPublicJobsFromQuery(
  query: Record<string, string | undefined>,
  env: Record<string, string | undefined>,
): Promise<PublicJobsPage> {
  const hasGeo = Boolean(query.countryId || query.stateId || query.cityId);
  let allow: string[] | null = null;
  if (hasGeo) {
    const deps = buildApiDeps(env);
    const svc = new LocationService(deps);
    allow = await svc.applyLocationFilter("job", {
      countryId: query.countryId ? Number(query.countryId) : undefined,
      stateId: query.stateId || undefined,
      cityId: query.cityId || undefined,
      radiusKm: query.radiusKm ? Number(query.radiusKm) : undefined,
      remote:
        query.isRemote === "true" ? true : query.isRemote === "false" ? false : undefined,
    });
  }
  const { page, limit } = parsePagination(
    { req: { query: (key: string) => query[key] } },
    { defaultLimit: 10, maxLimit: 100 },
  );
  return getPublicJobs({
    page,
    limit,
    search: query.search,
    location: query.location,
    employmentType: query.employmentType,
    experienceLevel: query.experienceLevel,
    isRemote:
      query.isRemote === "true" ? true : query.isRemote === "false" ? false : undefined,
    salaryMin: query.salaryMin ? Number(query.salaryMin) : undefined,
    salaryMax: query.salaryMax ? Number(query.salaryMax) : undefined,
    // #2069 — candidate-facing work-setting facet (onsite/remote/hybrid).
    workSetting: query.workSetting || undefined,
    sector: query.sector || undefined,
    entityIdAllowlist: allow,
  });
}
