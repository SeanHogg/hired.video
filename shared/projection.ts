/**
 * Shared field-projection helper (gap #1370).
 *
 * Every list endpoint (jobs, resumes, users, companies, articles, …) used
 * to return full rows even when the calling UI only needed `{id, title,
 * slug, avatarUrl, ...}`. The Worker → client payload was 5–10× larger
 * than necessary and parse cost on the browser scaled accordingly.
 *
 * This module is the single seam every list endpoint runs its result
 * through. The contract is intentionally string-based + allow-list-driven
 * so the API surface is self-documenting AND can't leak arbitrary fields
 * (an unknown key in `?fields=` is rejected at parse time, not silently
 * ignored).
 *
 * Usage:
 *   const fields = parseFields(c.req.query("fields"), JOB_LIST_FIELDS);
 *   const projected = projectRows(jobs, fields);
 *
 * Convention: `parseFields` returns `null` when the caller didn't specify
 * a projection (full row); endpoints pass that through to the renderer
 * unchanged so the legacy default behaviour is preserved.
 */

export type FieldAllowList = readonly string[];

/** Parse the `?fields=a,b,c` query param, validate against the allow-list,
 *  and return a normalised array. Returns null when no projection was
 *  requested — callers should treat that as "return the full row". */
export function parseFields(
  raw: string | undefined | null,
  allow: FieldAllowList,
): readonly string[] | null {
  if (!raw) return null;
  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (requested.length === 0) return null;
  const allowSet = new Set(allow);
  const accepted = requested.filter((f) => allowSet.has(f));
  // Always include `id` if any projection is requested — list consumers
  // (React keys, click-through routing) universally need it. Saves every
  // caller from remembering to add it.
  if (!accepted.includes("id") && allowSet.has("id")) accepted.unshift("id");
  return accepted.length > 0 ? accepted : null;
}

/** Trim each row to only the fields the caller requested. When `fields`
 *  is null the rows are returned unchanged. Pure function — does not
 *  mutate inputs. */
export function projectRows<T extends Record<string, unknown>>(
  rows: readonly T[],
  fields: readonly string[] | null,
): Array<Partial<T>> | readonly T[] {
  if (!fields) return rows;
  return rows.map((row) => {
    const out: Partial<T> = {};
    for (const f of fields) {
      if (f in row) (out as Record<string, unknown>)[f] = row[f];
    }
    return out;
  });
}

// ── Per-domain allow-lists ──────────────────────────────────────────────
// These are intentionally explicit (not `Object.keys(schema.x)`) so adding
// a sensitive column to the DB doesn't auto-expose it on the public list
// endpoint. To expose a new field, append it here AFTER reviewing whether
// list consumers actually need it. Detail endpoints keep returning the
// full row.

export const JOB_LIST_FIELDS = [
  "id",
  "title",
  "slug",
  "companyName",
  "companyId",
  "location",
  "employmentType",
  "experienceLevel",
  "isRemote",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "sector",
  "postedAt",
  "createdAt",
  "applicationCount",
  "viewCount",
] as const;

export const USER_LIST_FIELDS = [
  "id",
  "name",
  "firstName",
  "lastName",
  "slug",
  "avatarUrl",
  "headline",
  "role",
  "city",
  "country",
] as const;

export const COMPANY_LIST_FIELDS = [
  "id",
  "name",
  "slug",
  "logoUrl",
  "industry",
  "size",
  "headquarters",
  "websiteUrl",
  "openJobsCount",
] as const;

export const RESUME_LIST_FIELDS = [
  "id",
  "title",
  "slug",
  "privacy",
  "isMaster",
  "isActive",
  "createdAt",
  "updatedAt",
  "sentimentScore",
  "viewCount",
] as const;

export const ARTICLE_LIST_FIELDS = [
  "id",
  "title",
  "slug",
  "summary",
  "coverImageUrl",
  "authorId",
  "authorName",
  "authorAvatarUrl",
  "publishedAt",
  "readingMinutes",
  "viewCount",
  "tags",
  "category",
] as const;

export const FEED_POST_LIST_FIELDS = [
  "id",
  "authorId",
  "authorName",
  "authorAvatarUrl",
  "kind",
  "title",
  "preview",
  "mediaUrl",
  "thumbnailUrl",
  "createdAt",
  "likeCount",
  "commentCount",
  "isLikedByMe",
  "tags",
] as const;

export const TALENT_POOL_LIST_FIELDS = [
  "id",
  "candidateUserId",
  "candidateName",
  "candidateAvatarUrl",
  "candidateHeadline",
  "stage",
  "score",
  "tags",
  "addedAt",
  "lastInteractionAt",
] as const;

// Map of every domain → its allow-list, indexed by short key. Lets a
// caller-side helper avoid hand-importing the right constant; pass
// `kind: "jobs" | "users" | …` and parse against the matching set.
// Single source of truth so the frontend `useListQuery` hook (gap #1444)
// stays in sync with the backend without an extra hard-coded copy.
export const LIST_FIELDS_BY_KIND = {
  jobs: JOB_LIST_FIELDS,
  users: USER_LIST_FIELDS,
  companies: COMPANY_LIST_FIELDS,
  resumes: RESUME_LIST_FIELDS,
  articles: ARTICLE_LIST_FIELDS,
  feedPosts: FEED_POST_LIST_FIELDS,
  talentPool: TALENT_POOL_LIST_FIELDS,
} as const;

export type ListFieldsKind = keyof typeof LIST_FIELDS_BY_KIND;
