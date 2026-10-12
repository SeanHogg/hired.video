/**
 * Query-string parsing for `GET /api/search/public`.
 *
 * Pure: takes a `query(name)` reader (Hono's `c.req.query`) and returns the
 * typed params the PublicSearchService consumes, plus the stable cache key
 * over every parameter that affects the DATASET. The key format is load-
 * bearing — it is embedded in the version-stamped KV key
 * (`search:v<version>:<paramKey>`, utils/search-cache.ts), so changing the
 * order or spelling of any segment orphans every warm cache entry.
 */

import type { ContentLocationKind, LocationFilter } from "../../../../shared/content-locations.js";
import { AudienceKeySchema, type AudienceKey } from "../../../../shared/audiences.js";

export type QueryReader = (name: string) => string | undefined;

/** Which result kinds a `category` value includes. */
export interface PublicSearchInclusion {
  jobs: boolean;
  companies: boolean;
  people: boolean;
  resumes: boolean;
  voices: boolean;
  media: boolean;
  templates: boolean;
  articles: boolean;
  events: boolean;
  learningPaths: boolean;
}

export interface PublicSearchParams {
  search: string;
  category: string;
  page: number;
  limit: number;
  location: string;
  employmentType: string | undefined;
  experienceLevel: string | undefined;
  isRemote: boolean | undefined;
  salaryMin: number | undefined;
  salaryMax: number | undefined;
  /** `?firstParty=true` — only Hired.VIDEO Community templates. */
  firstPartyOnly: boolean;
  audienceKey: AudienceKey | null;
  geoFilter: LocationFilter;
  hasStructuredGeo: boolean;
  include: PublicSearchInclusion;
  /** Cache key over every dataset-affecting param (pagination excluded). */
  paramKey: string;
}

/** Category → included kinds. `templates` is a UNION view across
 *  template-shaped surfaces — public resumes AND studio templates (#1613). */
export function categoryInclusion(category: string): PublicSearchInclusion {
  const all = category === "all";
  return {
    jobs: all || category === "jobs",
    companies: all || category === "companies",
    people: all || category === "people",
    resumes: all || category === "resumes" || category === "templates",
    voices: all || category === "voices",
    media: all || category === "media",
    templates: all || category === "templates",
    articles: all || category === "articles",
    events: all || category === "events",
    learningPaths: all || category === "learning_paths",
  };
}

/** ContentLocationKind each inclusion flag resolves its allowlist against. */
export const INCLUSION_LOCATION_KIND: Record<keyof PublicSearchInclusion, ContentLocationKind> = {
  jobs: "job",
  people: "user_profile",
  resumes: "resume",
  voices: "voice",
  templates: "template",
  media: "video",
  articles: "article",
  companies: "company",
  events: "event",
  learningPaths: "learning_path",
};

export function parsePublicSearchParams(query: QueryReader): PublicSearchParams {
  const search = String(query("search") ?? "").trim();
  const category = String(query("category") ?? "all").toLowerCase();
  const page = Math.max(1, Number(query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query("limit") ?? 20)));
  const location = String(query("location") ?? "").trim();
  const employmentType = query("employmentType") || undefined;
  const experienceLevel = query("experienceLevel") || undefined;
  const isRemoteParam = query("isRemote");
  const isRemote = isRemoteParam === "true" ? true : isRemoteParam === "false" ? false : undefined;
  const salaryMin = query("salaryMin") ? Number(query("salaryMin")) : undefined;
  const salaryMax = query("salaryMax") ? Number(query("salaryMax")) : undefined;

  // Stable cache key over every parameter that affects the *dataset*.
  // Pagination (page/limit) is deliberately excluded: the loader caches
  // the full merged+sorted list, and the route slices per request — so one
  // cache entry serves every page of the same query. Keep this in sync
  // with every param read below.
  const paramKey = [
    `q=${search.toLowerCase()}`,
    `cat=${category}`,
    `loc=${location.toLowerCase()}`,
    `emp=${employmentType ?? ""}`,
    `exp=${experienceLevel ?? ""}`,
    `rem=${isRemote ?? ""}`,
    `smin=${salaryMin ?? ""}`,
    `smax=${salaryMax ?? ""}`,
    `aud=${query("audience") ?? ""}`,
    `co=${query("countryId") ?? ""}`,
    `st=${query("stateId") ?? ""}`,
    `ci=${query("cityId") ?? ""}`,
    `lat=${query("lat") ?? ""}`,
    `lng=${query("lng") ?? ""}`,
    `rad=${query("radiusKm") ?? ""}`,
    `fp=${query("firstParty") ?? ""}`,
  ].join("|");

  // Audience filter — orthogonal to geo (#1616 / Resource Maps).
  const audienceParam = query("audience");
  const audienceParsed = audienceParam ? AudienceKeySchema.safeParse(audienceParam) : null;
  const audienceKey: AudienceKey | null = audienceParsed?.success ? audienceParsed.data : null;

  // Structured geo filter; free-text `location` stays as a fallback for
  // callers that haven't migrated their UI to the picker.
  const geoFilter: LocationFilter = {
    countryId: query("countryId") ? Number(query("countryId")) : undefined,
    stateId: query("stateId") || undefined,
    cityId: query("cityId") || undefined,
    latitude: query("lat") ? Number(query("lat")) : undefined,
    longitude: query("lng") ? Number(query("lng")) : undefined,
    radiusKm: query("radiusKm") ? Number(query("radiusKm")) : undefined,
    remote: isRemote,
    text: location || undefined,
  };
  const hasStructuredGeo =
    geoFilter.countryId != null ||
    geoFilter.stateId != null ||
    geoFilter.cityId != null ||
    (geoFilter.latitude != null && geoFilter.longitude != null);

  return {
    search,
    category,
    page,
    limit,
    location,
    employmentType,
    experienceLevel,
    isRemote,
    salaryMin,
    salaryMax,
    firstPartyOnly: query("firstParty") === "true",
    audienceKey,
    geoFilter,
    hasStructuredGeo,
    include: categoryInclusion(category),
    paramKey,
  };
}
