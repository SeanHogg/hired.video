/**
 * Company directory use cases (read side of /api/companies): public listing,
 * trending, followed, by-owner, slug lookup, jobs, stats and the full detail
 * profile (which also records the view). Throw DomainError on failure; the
 * route maps it onto the `error()` envelope.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { getCachedSearch } from "../../utils/search-cache.js";
import { toJsonSafe } from "../../utils/json-safe.js";
import { buildApiDeps } from "../apiDeps.js";
import { LocationService } from "../location/LocationService.js";
import { recordArtifactView } from "../analytics/artifactView.js";
import { findCompanyByIdOrSlug } from "./companyOwnership.js";
import { handleListLocations, handleListTeamMembers, type CompanyDeps } from "./handlers.js";
import { rowToCompanyMeta, rowToCompanyProfile } from "./companyDto.js";
import type { LocationFilter } from "../../../../shared/content-locations.js";
import {
  countCompanyEngagement,
  countCompanyViews,
  findCompanyBySlug,
  listActiveCompanyJobs,
  listCompaniesByOwner,
  listCompaniesFollowedBy,
  listPublicCompanies,
  listTrendingCompanies,
  type CompanyProfileRow,
} from "../../repositories/companyDirectoryRepository.js";

type Env = Record<string, string | undefined>;

/** Deps for the company use cases in services/company/handlers.ts. */
export function companyDeps(): CompanyDeps {
  return { db: getDb(), now: () => new Date() };
}

/** Resolve `:id` (uuid or slug) to the company row, or null. */
export function findCompany(idOrSlug: string): Promise<CompanyProfileRow | null> {
  return findCompanyByIdOrSlug(getDb(), idOrSlug);
}

/** Resolve `:id` (uuid or slug) or throw 404 "Company not found". */
export async function requireCompany(idOrSlug: string): Promise<CompanyProfileRow> {
  const company = await findCompany(idOrSlug);
  if (!company) throw new DomainError(404, "NOT_FOUND", "Company not found");
  return company;
}

// ── Public listing ──────────────────────────────────────────────────────────

export interface PublicCompanyListParams {
  page: number;
  limit: number;
  search?: string;
  geo: LocationFilter;
}

/** Anonymous + shared → versioned search cache (company writes call
 *  bumpSearchVersion). Pagination is applied in SQL so page/limit are part of
 *  the key. Payload is JSON-safe (toJsonSafe). */
export async function listPublicCompanyMetas(
  params: PublicCompanyListParams,
  env: Env,
): Promise<{ metas: unknown; total: number }> {
  const { page, limit, search, geo } = params;
  const paramKey = `companies-public:${JSON.stringify([
    page, limit, search ?? "", geo.countryId ?? "", geo.stateId ?? "", geo.cityId ?? "",
    geo.remote ? "1" : "", geo.text ?? "",
  ])}`;
  return getCachedSearch(paramKey, async () => {
    // Structured geo filter (#1178): resolve the filter to an allowlist of
    // company ids via content_locations. `null` = no geo filter; `[]` =
    // filter set but nothing matched (→ empty page).
    const hasGeo =
      geo.countryId != null || !!geo.stateId || !!geo.cityId || geo.remote || !!geo.text;
    let geoAllow: string[] | null = null;
    if (hasGeo) {
      const svc = new LocationService(buildApiDeps(env));
      geoAllow = await svc.applyLocationFilter("company", geo);
    }
    const { rows, total } = await listPublicCompanies({
      search,
      geoAllow,
      limit,
      offset: (page - 1) * limit,
    });
    return { metas: toJsonSafe(rows.map(rowToCompanyMeta)), total };
  });
}

// ── Lists ───────────────────────────────────────────────────────────────────

export async function listTrendingCompanyMetas() {
  const rows = await listTrendingCompanies(10);
  return rows.map((r) => ({ ...rowToCompanyMeta(r.company), followerCount: r.followerCount }));
}

export async function listFollowedCompanyMetas(userId: string) {
  return (await listCompaniesFollowedBy(userId)).map(rowToCompanyMeta);
}

export async function listOwnedCompanyMetas(ownerId: string) {
  return (await listCompaniesByOwner(ownerId)).map(rowToCompanyMeta);
}

export async function getCompanyMetaBySlug(slug: string) {
  const row = await findCompanyBySlug(slug);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Company not found");
  return rowToCompanyMeta(row);
}

// ── Jobs + stats ────────────────────────────────────────────────────────────

const COMPANY_JOBS_LIMIT = 100;

/** Newest COMPANY_JOBS_LIMIT active jobs, behind the versioned search cache
 *  (job and company writes both call bumpSearchVersion). */
export async function listCompanyJobs(idOrSlug: string): Promise<unknown> {
  const rows = await getCachedSearch(`company-jobs:${idOrSlug}`, async () => {
    const company = await findCompany(idOrSlug);
    if (!company) return null;
    return toJsonSafe(await listActiveCompanyJobs(company.id, COMPANY_JOBS_LIMIT));
  });
  if (!rows) throw new DomainError(404, "NOT_FOUND", "Company not found");
  return rows;
}

export async function getCompanyStats(idOrSlug: string) {
  const company = await requireCompany(idOrSlug);
  const counts = await countCompanyEngagement(company.id);
  return {
    jobsCount: counts.jobCount,
    followersCount: counts.followerCount,
    activeJobsCount: counts.activeJobCount,
  };
}

// ── Detail ──────────────────────────────────────────────────────────────────

export interface CompanyViewer {
  userId: string | null;
  ipHash: string | null;
  ipCountry: string | null;
  referrer: string | null;
  userAgent: string | null;
}

/** Full CompanyProfile DTO. Records the view first (no-op for the owner) so
 *  the fresh count is reflected — ONE artifact_views row (kind 'company')
 *  backs both `viewCount` and the creator-stats rollup (#1019, W3-A 0580). */
export async function getCompanyDetail(idOrSlug: string, viewer: CompanyViewer) {
  const row = await requireCompany(idOrSlug);
  const id = row.id;

  await recordArtifactView({
    artifactKind: "company",
    artifactId: id,
    ownerUserId: row.ownerId,
    viewerId: viewer.userId,
    ipHash: viewer.ipHash,
    ipCountry: viewer.ipCountry,
    referrer: viewer.referrer,
    userAgent: viewer.userAgent,
    engagementUnit: "%",
  });

  const deps = companyDeps();
  const [counts, viewCount, locations, teamMembers] = await Promise.all([
    countCompanyEngagement(id),
    countCompanyViews(id),
    handleListLocations(deps, id),
    handleListTeamMembers(deps, id),
  ]);

  return rowToCompanyProfile(row, { ...counts, viewCount, locations, teamMembers }, viewer.userId);
}
