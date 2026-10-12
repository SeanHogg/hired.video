/**
 * Recruiter Boolean candidate search (`POST /api/search/recruiter`) and the
 * request schemas for saved searches (`/api/search/saved`).
 *
 * Boolean string examples:
 *   "React AND TypeScript"
 *   "Python OR Django NOT intern"
 *   "(product manager OR PM) AND SaaS"
 */

import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { getDb } from "../../db/index.js";
import {
  RecruiterSearchRepository,
  type CandidateRow,
  type SavedSearchRow,
} from "../../repositories/recruiterSearchRepository.js";
import { buildApiDeps } from "../apiDeps.js";
import { LocationService } from "../location/LocationService.js";

/** Convert a human-written Boolean string into a PostgreSQL tsquery expression. */
export function booleanToTsquery(input: string): string {
  // Normalise whitespace
  let q = input.trim();
  if (!q) return "";

  // Quoted phrases → phrase tokens for pg to_tsquery
  q = q.replace(/"([^"]+)"/g, (_m, phrase: string) => phrase.trim().split(/\s+/).join(" <-> "));

  // Boolean operators
  q = q
    .replace(/\bAND\b/g, " & ")
    .replace(/\bOR\b/g, " | ")
    .replace(/\bNOT\b/g, " !")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Wrap bare words with wildcards (prefix matching)
  q = q.replace(/\b([a-zA-Z0-9_]+)\b(?!\s*[:|&!])/g, "$1:*");

  return q;
}

export const RecruiterSearchSchema = z.object({
  query: z.string().max(500).default(""),
  skills: z.array(z.string()).default([]),
  location: z.string().max(200).optional(),
  // Structured geo filter — viewer-side. Same shape as LocationFilter in
  // shared/content-locations.ts but spelled inline for the request body.
  countryId: z.number().int().positive().optional(),
  stateId: UuidLikeSchema.optional(),
  cityId: UuidLikeSchema.optional(),
  radiusKm: z.number().int().positive().max(20000).optional(),
  experienceLevel: z.enum(["entry", "mid", "senior", "lead", "executive"]).optional(),
  role: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});
export type RecruiterSearchInput = z.infer<typeof RecruiterSearchSchema>;

export const SavedSearchSchema = z.object({
  name: z.string().min(1).max(100),
  query: z.string().max(500),
  filters: z.record(z.string(), z.any()).default({}),
  searchType: z.enum(["recruiter", "jobs", "people", "companies"]).default("recruiter"),
});
export type SavedSearchInput = z.infer<typeof SavedSearchSchema>;

export interface RecruiterSearchResult {
  candidates: CandidateRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
}

type Env = Record<string, string | undefined>;

export async function runRecruiterSearch(
  input: RecruiterSearchInput,
  viewerUserId: string | undefined,
  env: Env,
): Promise<RecruiterSearchResult> {
  const { query, skills, location, countryId, stateId, cityId, radiusKm, page, limit } = input;
  const offset = (page - 1) * limit;
  const repo = new RecruiterSearchRepository(getDb());

  // Structured geo filter — resolved once via LocationService against
  // user_profile content_locations rows (back-populated by migration 0109
  // from user_profiles.location). When no structured filter is set we
  // still honor the free-text `location` fallback.
  const hasGeo = countryId != null || stateId != null || cityId != null;
  let allowUserIds: string[] | null = null;
  if (hasGeo) {
    const svc = new LocationService(buildApiDeps(env));
    const allow = await svc.applyLocationFilter("user_profile", { countryId, stateId, cityId, radiusKm });
    if (allow !== null) {
      if (allow.length === 0) {
        return { candidates: [], total: 0, page, limit, totalPages: 1, hasNextPage: false };
      }
      allowUserIds = allow;
    }
  }

  const tsQuery = query.trim() ? booleanToTsquery(query) : "";

  // Confidential employer blocklist (#1679) — resolved from the viewer's
  // profile.current_company.
  const viewerCompany = viewerUserId ? await repo.findViewerCompany(viewerUserId) : "";

  const { total, rows } = await repo.searchCandidates({
    allowUserIds,
    tsQuery: tsQuery || null,
    skills,
    // Legacy free-text fallback — only when no structured geo was set, so
    // a viewer who picks a city doesn't also get noise from a stale string.
    locationText: location && !hasGeo ? location : null,
    viewerCompany: viewerCompany || null,
    limit,
    offset,
  });

  return {
    candidates: rows,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: offset + limit < total,
  };
}

// ─── Saved searches ───────────────────────────────────────────────────────────

function savedSearchRepo(): RecruiterSearchRepository {
  return new RecruiterSearchRepository(getDb());
}

export function listSavedSearches(userId: string): Promise<SavedSearchRow[]> {
  return savedSearchRepo().listSavedSearches(userId);
}

export function createSavedSearch(userId: string, input: SavedSearchInput): Promise<SavedSearchRow | undefined> {
  return savedSearchRepo().insertSavedSearch({ userId, ...input });
}

export function deleteSavedSearch(id: string, userId: string): Promise<void> {
  return savedSearchRepo().deleteSavedSearch(id, userId);
}
