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

/** Subset a Drizzle `select({...})` shape object so the DB only reads + ships
 *  the requested columns (gap #1445). When `fields` is null returns the full
 *  shape unchanged so legacy callers keep working. Note: callers must use
 *  `as any` at the type boundary because the row shape is dynamic — that's
 *  the cost of payload-aware querying. Use ONLY on routes that select
 *  straight from a single table (joined / DTO-assembled routes need the
 *  full column set to compose downstream fields). */
export function pickSelectShape<T extends Record<string, unknown>>(
  full: T,
  fields: readonly string[] | null,
): Partial<T> | T {
  if (!fields) return full;
  const out: Partial<T> = {};
  for (const f of fields) {
    if (f in full) (out as Record<string, unknown>)[f] = full[f];
  }
  // Always include `id` so React keys + click-through routing work even
  // when the caller forgot to ask for it.
  if (!("id" in out) && "id" in full) {
    (out as Record<string, unknown>).id = full.id;
  }
  return out;
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

// NOTE: these are keys of the `toPublicCard` DTO (the post-join shape every
// public articles list endpoint ships), NOT raw `articles` columns. The
// projector matches top-level keys, so `author` is the nested
// {id,name,avatarUrl,slug} object and `readMinutes` is camelCase. Naming these
// after DB columns (authorName / readingMinutes) silently drops them at
// projection time and crashes consumers that read `article.author.slug`.
export const ARTICLE_LIST_FIELDS = [
  "id",
  "type",
  "kind",
  "title",
  "slug",
  "summary",
  "coverImageUrl",
  "category",
  "tags",
  "sector",
  "audience",
  "author",
  "readMinutes",
  "viewCount",
  "publishedAt",
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

export const NOTIFICATION_LIST_FIELDS = [
  "id",
  "type",
  "title",
  "message",
  "isRead",
  "createdAt",
  "data",
] as const;

// Internal lookup table used by `serializeListFields` to validate a kind
// against the matching allow-list. Not exported — callers should use
// `serializeListFields(kind, fields)` or the per-domain `*_LIST_FIELDS`
// constant directly.
const LIST_FIELDS_BY_KIND = {
  jobs: JOB_LIST_FIELDS,
  users: USER_LIST_FIELDS,
  companies: COMPANY_LIST_FIELDS,
  resumes: RESUME_LIST_FIELDS,
  articles: ARTICLE_LIST_FIELDS,
  feedPosts: FEED_POST_LIST_FIELDS,
  talentPool: TALENT_POOL_LIST_FIELDS,
  notifications: NOTIFICATION_LIST_FIELDS,
} as const;

type ListFieldsKind = keyof typeof LIST_FIELDS_BY_KIND;

/** Per-domain "card view" subset — what a typical grid/card consumer
 *  actually renders. Single source of truth for the frontend list
 *  services (gap #1444) so each service doesn't hand-roll its own field
 *  array. Unknown keys are filtered out by `serializeListFields` against
 *  the LIST_FIELDS_BY_KIND allow-list, so editing this is safe — the
 *  worst case is dropping a field from the wire payload. */
export const CARD_FIELDS_BY_KIND: Record<ListFieldsKind, readonly string[]> = {
  jobs: ["id", "title", "slug", "companyName", "location", "isRemote", "employmentType", "salaryMin", "salaryMax", "postedAt"],
  users: ["id", "name", "slug", "avatarUrl", "headline", "role"],
  companies: ["id", "name", "slug", "logoUrl", "industry", "openJobsCount"],
  resumes: ["id", "title", "slug", "privacy", "isMaster", "viewCount", "updatedAt"],
  articles: ["id", "kind", "title", "slug", "summary", "coverImageUrl", "category", "tags", "sector", "audience", "author", "readMinutes", "viewCount", "publishedAt"],
  feedPosts: ["id", "authorName", "authorAvatarUrl", "kind", "title", "preview", "thumbnailUrl", "createdAt", "likeCount", "commentCount", "isLikedByMe"],
  talentPool: ["id", "candidateName", "candidateAvatarUrl", "candidateHeadline", "stage", "tags", "addedAt"],
  notifications: ["id", "type", "title", "message", "isRead", "createdAt"],
} as const;

/** Validate + comma-join a fields array for use as a `?fields=` query
 *  parameter. Drops any field that isn't in the allow-list for `kind`
 *  (silent — server-side allow-list is the security boundary; this
 *  client-side check is just for hygiene + bundle-size of unused keys).
 *  Returns null when no usable field survives. */
export function serializeListFields(
  kind: ListFieldsKind,
  fields: readonly string[] | undefined | null,
): string | null {
  if (!fields || fields.length === 0) return null;
  const allow = new Set<string>(LIST_FIELDS_BY_KIND[kind]);
  const kept = fields.filter((f) => allow.has(f));
  return kept.length > 0 ? kept.join(",") : null;
}
