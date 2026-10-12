/**
 * PublicSearchService — the anonymous unified search behind
 * `GET /api/search/public`.
 *
 * Fans out one query per included kind (jobs via JobService, résumés via
 * ResumeRepository, everything else via PublicSearchRepository), each
 * intersected with its geo / audience allowlist, then merges the mapped
 * items newest-first. The full merged list is read-through cached under the
 * version-stamped key from utils/search-cache.ts; pagination happens AFTER
 * the cache (see `paginatePublicSearch`) so one entry serves every page.
 */

import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { PublicSearchRepository, type EntityAllowlist } from "../../repositories/publicSearchRepository.js";
import type { ResumeRow } from "../../repositories/resumeRepository.js";
import { getPublicJobs, getHiredVideoCommunityCompanyId } from "../job/JobService.js";
import { buildApiDeps } from "../apiDeps.js";
import { LocationService } from "../location/LocationService.js";
import { AudienceService } from "../audience/AudienceService.js";
import { getCachedSearch } from "../../utils/search-cache.js";
import { allowEmpty, resolveAllowlist, type AllowlistSources } from "./searchAllowlists.js";
import {
  INCLUSION_LOCATION_KIND,
  type PublicSearchInclusion,
  type PublicSearchParams,
} from "./publicSearchParams.js";
import {
  toArticleItem,
  toCompanyItem,
  toEventItem,
  toLearningPathItem,
  toMediaItem,
  toPeopleItem,
  toResumeItem,
  toSearchItem,
  toTemplateItem,
  toVoiceItem,
  type PublicSearchItem,
} from "./searchItemMappers.js";

type Env = Record<string, string | undefined>;
type Allowlists = Record<keyof PublicSearchInclusion, EntityAllowlist>;

const INCLUSION_KEYS = Object.keys(INCLUSION_LOCATION_KIND) as Array<keyof PublicSearchInclusion>;

const EMPTY_JOBS_PAGE = { items: [], total: 0, page: 1, limit: 0, totalPages: 0, hasNext: false, hasPrev: false };

/** Resolve every kind's allowlist in parallel (null for excluded kinds). */
async function resolveAllowlists(sources: AllowlistSources, params: PublicSearchParams): Promise<Allowlists> {
  const lists = await Promise.all(
    INCLUSION_KEYS.map((key) =>
      resolveAllowlist(sources, params, INCLUSION_LOCATION_KIND[key], params.include[key]),
    ),
  );
  return Object.fromEntries(INCLUSION_KEYS.map((key, i) => [key, lists[i]])) as Allowlists;
}

/** Run a kind's query only when the category includes it and its allowlist
 *  isn't an applied-but-empty filter. */
function runIf<T>(enabled: boolean, allow: EntityAllowlist, query: () => Promise<T[]>): Promise<T[]> {
  return enabled && !allowEmpty(allow) ? query() : Promise.resolve([]);
}

/** Uncached loader: the full merged + newest-first list for one query. */
async function loadPublicSearch(params: PublicSearchParams, env: Env): Promise<PublicSearchItem[]> {
  const locationService = new LocationService(buildApiDeps(env));
  const audienceService = new AudienceService({ db: getDb() });
  const sources: AllowlistSources = {
    applyLocationFilter: (kind, filter) => locationService.applyLocationFilter(kind, filter),
    applyAudienceFilter: (kind, key) => audienceService.applyAudienceFilter(kind, key),
  };
  const { search, location, include } = params;

  // `firstParty` also needs the community company id on EVERY template item
  // (the platform-shipped badge), so it resolves alongside the allowlists.
  const [allow, hvCommunityCompanyId] = await Promise.all([
    resolveAllowlists(sources, params),
    getHiredVideoCommunityCompanyId(),
  ]);

  const db = getDb();
  const repo = new PublicSearchRepository(db);

  const jobsPromise = include.jobs
    ? getPublicJobs({
        page: 1,
        limit: 100,
        search: search || undefined,
        location: location || undefined,
        employmentType: params.employmentType,
        experienceLevel: params.experienceLevel,
        isRemote: params.isRemote,
        salaryMin: params.salaryMin,
        salaryMax: params.salaryMax,
        entityIdAllowlist: allow.jobs,
      })
    : Promise.resolve(EMPTY_JOBS_PAGE);

  // Résumés: ONLY privacyLevel=0 (public) — enforced inside the repo.
  const resumesPromise = runIf<ResumeRow>(include.resumes, allow.resumes, () =>
    buildRepos(db)
      .resumes.searchPublicByTitle(search ?? "", 100)
      .then((rows) => {
        if (!allow.resumes || allow.resumes.length === 0) return rows;
        const allowed = new Set(allow.resumes);
        return rows.filter((r) => allowed.has(r.id));
      }),
  );

  // `?firstParty=true` narrows to Hired.VIDEO Community templates.
  const templateCompanyId = params.firstPartyOnly && hvCommunityCompanyId ? hvCommunityCompanyId : null;

  const [jobs, companies, people, resumes, voices, templates, media, articles, events, learningPaths] = await Promise.all([
    jobsPromise,
    runIf(include.companies, allow.companies, () => repo.searchCompanies(search, allow.companies)),
    runIf(include.people, allow.people, () => repo.searchPeople(search, allow.people)),
    resumesPromise,
    runIf(include.voices, allow.voices, () => repo.searchVoices(search, allow.voices)),
    runIf(include.templates, allow.templates, () =>
      repo.searchTemplates(search, allow.templates, { companyId: templateCompanyId }),
    ),
    runIf(include.media, allow.media, () => repo.searchMedia(search, allow.media)),
    runIf(include.articles, allow.articles, () => repo.searchArticles(search, allow.articles)),
    runIf(include.events, allow.events, () => repo.searchEvents(search, allow.events)),
    runIf(include.learningPaths, allow.learningPaths, () => repo.searchLearningPaths(search, allow.learningPaths)),
  ]);

  // Merge every kind and order newest-first by createdAt.
  const merged: PublicSearchItem[] = [
    ...jobs.items.map(toSearchItem),
    ...companies.map(toCompanyItem),
    ...people.map(({ user, profile }) => toPeopleItem(user, profile ?? null)),
    ...resumes.map(toResumeItem),
    ...voices.map(toVoiceItem),
    ...templates.map((t) => toTemplateItem(t, hvCommunityCompanyId)),
    ...media.map(({ video, ownerName }) => toMediaItem(video, ownerName)),
    ...articles.map(toArticleItem),
    ...events.map(toEventItem),
    ...learningPaths.map(toLearningPathItem),
  ];
  return merged.sort(compareNewestFirst);
}

/** The merge order: createdAt descending. */
export function compareNewestFirst(a: { createdAt?: string }, b: { createdAt?: string }): number {
  return (new Date(b.createdAt ?? "").getTime() ?? 0) - (new Date(a.createdAt ?? "").getTime() ?? 0);
}

/** Cached full result list for one query (every page shares the entry). */
export function runPublicSearch(params: PublicSearchParams, env: Env): Promise<PublicSearchItem[]> {
  return getCachedSearch(params.paramKey, () => loadPublicSearch(params, env));
}

/** Slice one page out of the cached list — the response envelope. */
export function paginatePublicSearch<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
