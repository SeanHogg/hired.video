import { z } from "zod";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { classifyJobSector } from "../../../../shared/sectors.js";
import { normalizeEmploymentType } from "../../../../shared/employment-types.js";
import { normalizeWorkSetting, normalizeHybridDays } from "../../../../shared/work-settings.js";
import { normalizeSeniority } from "../../../../shared/seniority.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { canViewerManageJob } from "../jobs/jobOwnership.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";

import { type ApiDeps, defaultApiDeps } from "../apiDeps.js";

/** Narrow Deps slice. account.ts touches both `users` (via UsersRepository)
 *  and `accountInvitations` (via PlatformRepository) plus assorted
 *  tables without repo surface yet — the raw `db` handle is injected so
 *  all the direct Drizzle calls can still be mocked by tests. */
export interface JobServiceDeps {
  repos: ApiDeps["repos"];
  db: ReturnType<typeof getDb>;
}

const resolveDeps = (deps?: Partial<JobServiceDeps>): JobServiceDeps => {
  const api = defaultApiDeps();
  return {
    repos: deps?.repos ?? api.repos,
    db: deps?.db ?? getDb(),
  };
};
import type {
  ApplyJobDTO,
  CreateJobDTO,
  JobSummaryDTO,
  PaginatedJobsDTO,
} from "../../../../shared/job.js";
import {
  // Pure HTML helpers — single-sourced in shared/scraping so the
  // Chrome extension, frontend, and API all agree on what "stripped
  // HTML" / "markdown" mean.
  stripHtml as stripHtmlShared,
  htmlToMarkdown as htmlToMarkdownShared,
  // JSON-LD JobPosting extraction.
  extractJobPostingsFromHtml,
  // Apply-URL DOM-scan fallback.
  findApplyLinkInHtml as findApplyLinkInHtmlShared,
  // URL canonicalization.
  normalizeJobUrl as normalizeJobUrlShared,
  // LinkedIn-specific docTitle parser: "{Company} hiring {Title} in {Location} | LinkedIn".
  parseLinkedInTitleString,
} from "../../../../shared/scraping/index.js";

// Re-export the shared primitives under their historical names so every
// current caller (tests, other services, route handlers) keeps working.
// Also bind them as locals so in-file call sites further down keep
// compiling without rename churn.
const htmlToMarkdown = htmlToMarkdownShared;
const findApplyLinkInHtml = findApplyLinkInHtmlShared;
const normalizeJobUrl = normalizeJobUrlShared;
export { htmlToMarkdown, findApplyLinkInHtml, normalizeJobUrl };

const { jobItems, savedJobs, jobApplications, jobAlerts } = schema;
// Re-export so the route can use it for inline bookmark inserts during
// the dedup fast-path (where we return the existing row without calling
// createTrackedJob).
export { savedJobs as schema_savedJobs };

// =====================================================================
// Dedup helpers — 3-layer duplicate detection
// =====================================================================

// normalizeJobUrl + TRACKING_PARAMS now live in shared/scraping/urls.ts.
// The re-export at the top of this file keeps the existing call sites
// working without change.

// Local shim for the stripHtml helper so the many call sites below
// that read `stripHtml(...)` don't all need to change.
function stripHtml(text: unknown): string {
  return stripHtmlShared(text);
}

/**
 * Compute a short content fingerprint from title + company. Used to
 * catch the same job appearing at two different URLs (e.g. LinkedIn
 * /jobs/view/123 vs /jobs/collections/easy-apply/?currentJobId=123).
 *
 * Uses the Web Crypto API (available in Cloudflare Workers) to produce
 * a hex SHA-256 of the normalized text.
 */
export async function computeContentHash(title?: string, company?: string): Promise<string> {
  const input = [title, company]
    .map((s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .join('|');
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Layer 2 — fuzzy candidate query. Returns up to 5 rows from job_items
 * whose title and company are close to the input. Uses ILIKE for broad
 * matching (pg_trgm `similarity()` would be better but requires the
 * extension installed — ILIKE works everywhere).
 */
export async function findFuzzyCandidates(title: string, company?: string, limit = 5,
  deps?: Partial<JobServiceDeps>): Promise<JobEntity[]> {
  const d = resolveDeps(deps); const db = d.db;
  const titleWords = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  if (titleWords.length === 0) return [];

  // Build an OR chain: title ILIKE '%word%' for each significant word,
  // AND company ILIKE '%company%' when present.
  const titleConditions = titleWords.map((w) => ilike(jobItems.title, `%${w}%`));
  const companyClause = company && company.trim().length > 2
    ? ilike(jobItems.company as any, `%${company.trim()}%`)
    : undefined;

  const rows = await db
    .select()
    .from(jobItems)
    .where(
      and(
        eq(jobItems.isActive, true),
        or(...titleConditions),
        companyClause))
    .orderBy(desc(jobItems.createdAt))
    .limit(limit);

  return rows.map(rowToJob);
}

// =====================================================================
// Layer 3 — AI duplicate confirmation
// =====================================================================

const DuplicateCheckSchema = z.object({
  isDuplicate: z.boolean(),
  confidence: z.number().min(0).max(1),
  matchedJobId: z.string().nullable().optional(),
  reason: z.string().optional(),
});

export type DuplicateCheckResult = z.infer<typeof DuplicateCheckSchema>;

/**
 * Ask the LLM to compare a new job against a list of candidates and
 * decide whether any of them is the same posting. Only called when
 * Layer 2 found fuzzy matches but Layer 1 didn't find an exact one.
 *
 * Returns { isDuplicate: true, matchedJobId, confidence } when a match
 * is found, or { isDuplicate: false } otherwise.
 */
export async function aiDuplicateCheck(
  llm: LLMClient,
  newJob: { title: string; company?: string; location?: string; description?: string },
  candidates: JobEntity[],
  featureKey = "job_dedupe_check"): Promise<DuplicateCheckResult> {
  if (candidates.length === 0) return { isDuplicate: false, confidence: 0 };

  const candidateLines = candidates
    .map((c, i) => `[${i}] id="${c.id}" title="${c.title}" company="${c.company ?? ''}" location="${c.location ?? ''}"`)
    .join('\n');

  const systemPrompt = [
    'You compare a NEW job against a list of EXISTING jobs and decide whether any existing job is the same posting.',
    'Two jobs are "the same" if they describe the same role at the same employer, even if the title wording differs slightly (e.g. "Sr. Director" vs "Senior Director", or "AI R&D" vs "AI Research & Development").',
    'They are NOT the same if the employer is different, or if the role is materially different (e.g. "Data Engineer" vs "Data Scientist" at the same company).',
    '',
    'Return ONLY JSON with this shape (no markdown fences):',
    '{ "isDuplicate": boolean, "confidence": 0-1, "matchedJobId": "id of the matching existing job or null", "reason": "one sentence" }',
  ].join('\n');

  const userMessage = [
    'NEW JOB:',
    `  title: ${newJob.title}`,
    `  company: ${newJob.company ?? '(unknown)'}`,
    `  location: ${newJob.location ?? '(unknown)'}`,
    `  description snippet: ${(newJob.description ?? '').slice(0, 500)}`,
    '',
    'EXISTING JOBS:',
    candidateLines,
  ].join('\n');

  const { data } = await llm.callJson(
    featureKey,
    { useCase: 'job_parser', systemPrompt, userMessage, responseFormat: 'json_object' },
    DuplicateCheckSchema);
  return data;
}

// =====================================================================
// Combined dedup pipeline — used by the extract route
// =====================================================================

export interface DedupResult {
  /** 'exact' = Layer 1 hit, 'fuzzy' = Layer 2 hit confirmed by Layer 3, 'new' = no match */
  outcome: 'exact' | 'fuzzy' | 'new';
  existingJob?: JobEntity;
  /** Fuzzy candidates returned to the caller when Layer 2 matches but
   *  Layer 3 is unavailable or below threshold — lets the extension
   *  show a "did you mean?" prompt. */
  candidates?: JobEntity[];
}

export async function deduplicateJob(input: { title: string; company?: string; location?: string; description?: string; sourceUrl?: string },
  llm?: LLMClient | null,
  deps?: Partial<JobServiceDeps>): Promise<DedupResult> {
  const d = resolveDeps(deps); const db = d.db;

  // ---- Layer 1a: normalized URL match ---
  const normalizedUrl = normalizeJobUrl(input.sourceUrl);
  if (normalizedUrl) {
    const [byUrl] = await db
      .select()
      .from(jobItems)
      .where(eq(jobItems.sourceUrl, normalizedUrl))
      .limit(1);
    if (byUrl) return { outcome: 'exact', existingJob: rowToJob(byUrl) };
  }

  // ---- Layer 1b: content hash match ---
  const contentHash = await computeContentHash(input.title, input.company);
  // We'll compare against computed hashes of candidates rather than
  // storing a column for now — the candidate set is small (max 5 rows).

  // ---- Layer 2: fuzzy candidates ---
  const candidates = await findFuzzyCandidates(input.title, input.company);
  if (candidates.length === 0) return { outcome: 'new' };

  // Check content-hash match against candidates (instant, no AI)
  for (const c of candidates) {
    const cHash = await computeContentHash(c.title, c.company);
    if (cHash === contentHash) {
      return { outcome: 'exact', existingJob: c };
    }
  }

  // ---- Layer 3: AI confirmation ---
  if (!llm) {
    // No AI available — return candidates for the extension to show
    return { outcome: 'new', candidates };
  }

  try {
    const result = await aiDuplicateCheck(llm, input, candidates);
    if (result.isDuplicate && result.confidence >= 0.8 && result.matchedJobId) {
      const matched = candidates.find((c) => c.id === result.matchedJobId);
      if (matched) return { outcome: 'fuzzy', existingJob: matched };
    }
    // AI says not a duplicate but candidates exist → return them so
    // extension can still prompt the user.
    if (candidates.length > 0 && result.confidence >= 0.5) {
      return { outcome: 'new', candidates };
    }
  } catch (err) {
    console.warn('[dedup] AI duplicate check failed, falling open:', err);
    // Fall through with candidates so the extension can prompt
    if (candidates.length > 0) return { outcome: 'new', candidates };
  }

  return { outcome: 'new' };
}

/** Stable string used as the "company" for jobs tracked through the
 * extension when we can't extract a real employer from the page.
 * Surfaced as the seed company on the public job board. Also serves as
 * the first-party owner of platform-shipped Studio templates — see
 * getHiredVideoCommunityCompanyId() below. */
export const HIRED_VIDEO_SEED_COMPANY = "hired.video Community";

let _hvCommunityCompanyIdCache: string | null = null;

/** Resolve the Hired.VIDEO Community companyProfiles.id once per process.
 *  Cached because it never changes after the seed runs and lookups happen
 *  on hot paths (every search-marketplace render). Returns null if the
 *  seed hasn't run yet — callers should treat that as "no first-party
 *  templates exist" rather than blocking. */
export async function getHiredVideoCommunityCompanyId(): Promise<string | null> {
  if (_hvCommunityCompanyIdCache) return _hvCommunityCompanyIdCache;
  const { getDb, schema } = await import("../../db/index.js");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  const [row] = await db
    .select({ id: schema.companyProfiles.id })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.name, HIRED_VIDEO_SEED_COMPANY))
    .limit(1);
  _hvCommunityCompanyIdCache = row?.id ?? null;
  return _hvCommunityCompanyIdCache;
}

export interface JobQuery {
  page?: number;
  limit?: number;
  search?: string;
  location?: string;
  // Facet filters (#10)
  employmentType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  isRemote?: boolean;
  /** Work-setting facet (#2069): 'onsite' | 'remote' | 'hybrid'. Maps to
   *  `job_items.work_setting` via the partial index from migration 0216.
   *  Lets candidates filter for hybrid roles, which `isRemote` could not. */
  workSetting?: string;
  /** Sector filter (#1168). Maps to `job_items.sector` via the partial
   *  index from migration 0112. */
  sector?: string;
  /**
   * Pre-resolved geo intersection — list of job ids that matched the
   * structured LocationFilter. Routes call LocationService.applyLocationFilter
   * and pass the result here. `null`/omitted = no geo filter; `[]` = filter
   * applied but matched zero rows (return empty page).
   */
  entityIdAllowlist?: string[] | null;
}

export interface JobEntity extends JobSummaryDTO {
  isActive?: boolean;
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  skills?: string[];
  sourceUrl?: string;
  /** Direct-apply URL — falls back to sourceUrl for rows without a distinct apply link. */
  applyUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  // Structured sections from the `details` jsonb bag — always populated by
  // `rowToJob` (empty arrays when absent). Declared here so consumers don't
  // need an `as any` to read what the serializer guarantees.
  responsibilities?: string[];
  requirements?: string[];
  qualifications?: string[];
  benefits?: string[];
  /** Backwards-compat JSON string of the four structured sections. */
  jobSerialized?: string;
  /** Mirrors `createdBy` so frontend code keyed on `userId`
   *  (`useEntityOwnership`, `JobCard`, etc.) can derive ownership without
   *  every call site having to coalesce `createdBy || userId`. */
  userId?: string;
  /** Backend-authoritative "can the requesting viewer manage this job?"
   *  flag — stamped by `getJobById` when called with viewer context.
   *  Mirrors `requireJobOwner` (owner / super-admin / company team
   *  member) so the frontend can gate Edit / Delete / Candidates +
   *  Reports without re-deriving the rule (and silently drifting from
   *  the backend, which is how non-owners were getting the Edit Job
   *  button + 403s on `/pipeline`). Absent on anonymous reads. */
  viewerCanManage?: boolean;
}

function rowToJob(row: typeof jobItems.$inferSelect): JobEntity {
  // The frontend (JobDetail.tsx) expects responsibilities/requirements/
  // qualifications/benefits to live either at the top level or inside
  // a JSON-serialized `jobSerialized` string. We expose both so a single
  // /api/jobs/:id response works for both rendering paths.
  const details = ((row as any).details as Record<string, unknown> | null) ?? {};
  const responsibilities = Array.isArray(details.responsibilities) ? (details.responsibilities as string[]) : [];
  const requirements = Array.isArray(details.requirements) ? (details.requirements as string[]) : [];
  const qualifications = Array.isArray(details.qualifications) ? (details.qualifications as string[]) : [];
  const benefits = Array.isArray(details.benefits) ? (details.benefits as string[]) : [];

  return {
    id: row.id,
    title: row.title,
    company: row.company ?? undefined,
    location: row.location ?? undefined,
    description: row.description,
    employmentType: row.jobType ?? undefined,
    experienceLevel: row.experienceLevel ?? undefined,
    salaryMin: row.salaryMin ? Number(row.salaryMin) : undefined,
    salaryMax: row.salaryMax ? Number(row.salaryMax) : undefined,
    salaryCurrency: row.salaryCurrency ?? "USD",
    skills: (row.skillsRequired as string[]) ?? [],
    isRemote: row.isRemote,
    // #2069 — first-class work setting + hybrid day-split. Falls back to
    // is_remote for legacy rows the 0216 backfill hasn't reached.
    workSetting: (row as any).workSetting ?? (row.isRemote ? "remote" : "onsite"),
    onsiteDaysPerWeek: (row as any).onsiteDaysPerWeek ?? null,
    remoteDaysPerWeek: (row as any).remoteDaysPerWeek ?? null,
    isActive: row.isActive,
    slug: row.id,
    postedDate: new Date(row.createdAt).toISOString(),
    sourceUrl: row.sourceUrl ?? undefined,
    applyUrl: row.applyUrl ?? row.sourceUrl ?? undefined,
    heroImageUrl: (row as any).heroImageUrl ?? undefined,
    // #743 — Studio video project attached to the job.
    videoProjectId: (row as any).videoProjectId ?? null,
    sentimentScore: (row as any).sentimentScore ?? null,
    sector: (row as any).sector ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    createdBy: (row as any).postedByUserId ?? undefined,
    userId: (row as any).postedByUserId ?? undefined,
    // ---- Extension-extracted structured sections ----
    responsibilities,
    requirements,
    qualifications,
    benefits,
    // Backwards-compat for the frontend's `parsed = JSON.parse(j.jobSerialized)` path
    jobSerialized: JSON.stringify({
      responsibilities,
      requirements,
      qualifications,
      benefits,
    }),
  } as JobEntity;
}

export async function getPublicJobs(filters?: JobQuery,
  deps?: Partial<JobServiceDeps>): Promise<PaginatedJobsDTO> {
  const d = resolveDeps(deps); const db = d.db;
  const page = filters?.page ?? 1;
  const limit = Math.min(filters?.limit ?? 10, 100);
  const offset = (page - 1) * limit;

  // Full-text search: use PostgreSQL tsvector when the query has multiple meaningful words,
  // fall back to ilike for single short tokens (e.g. partial-word autocomplete).
  const buildSearchClause = (search: string) => {
    const trimmed = search.trim();
    if (!trimmed) return undefined;
    // plainto_tsquery handles multi-word queries, stemming, and stop-words.
    // The tsvector is computed on-the-fly; add a GIN index on
    //   to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(company,''))
    // to make this fast at scale.
    return or(
      sql`to_tsvector('english', coalesce(${jobItems.title},'') || ' ' || coalesce(${jobItems.description},'') || ' ' || coalesce(${jobItems.company},'')) @@ plainto_tsquery('english', ${trimmed})`,
      ilike(jobItems.title, `%${trimmed}%`),
      ilike(jobItems.company, `%${trimmed}%`));
  };

  // Short-circuit: a structured geo filter that matched no rows wins
  // over every other clause. Avoids paying for a full table scan only
  // to filter the result down to zero.
  if (filters?.entityIdAllowlist && filters.entityIdAllowlist.length === 0) {
    return {
      items: [],
      total: 0,
      page,
      limit,
      totalPages: 1,
      hasNext: false,
      hasPrev: page > 1,
    };
  }

  const whereClause = and(
    eq(jobItems.isActive, true),
    filters?.search ? buildSearchClause(filters.search) : undefined,
    // The free-text `location` ilike stays as a *fallback* when no
    // structured allowlist is set — preserves search for legacy rows
    // whose location hasn't been geocoded yet (see migration 0109).
    filters?.location && !filters.entityIdAllowlist
      ? ilike(jobItems.location, `%${filters.location}%`)
      : undefined,
    filters?.entityIdAllowlist && filters.entityIdAllowlist.length > 0
      ? inArray(jobItems.id, filters.entityIdAllowlist)
      : undefined,
    filters?.employmentType
      ? eq(jobItems.jobType, normalizeEmploymentType(filters.employmentType) ?? filters.employmentType)
      : undefined,
    filters?.experienceLevel
      ? eq(jobItems.experienceLevel, normalizeSeniority(filters.experienceLevel) ?? filters.experienceLevel)
      : undefined,
    filters?.isRemote !== undefined ? eq(jobItems.isRemote, filters.isRemote) : undefined,
    filters?.workSetting
      ? eq((jobItems as any).workSetting, normalizeWorkSetting(filters.workSetting) ?? filters.workSetting)
      : undefined,
    filters?.salaryMin !== undefined ? gte(jobItems.salaryMin as any, String(filters.salaryMin)) : undefined,
    filters?.salaryMax !== undefined ? lte(jobItems.salaryMax as any, String(filters.salaryMax)) : undefined,
    filters?.sector ? eq((jobItems as any).sector, filters.sector) : undefined);

  const [rows, countResult] = await Promise.all([
    db.select().from(jobItems).where(whereClause).orderBy(desc(jobItems.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(jobItems).where(whereClause),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items: rows.map(rowToJob),
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export async function getUserJobs(userId: string,
  deps?: Partial<JobServiceDeps>): Promise<JobEntity[]> {
  const d = resolveDeps(deps); const db = d.db;
  const rows = await db
    .select()
    .from(jobItems)
    .where(eq((jobItems as any).postedByUserId, userId))
    .orderBy(desc(jobItems.createdAt));
  return rows.map(rowToJob);
}

export async function getJobById(id: string,
  deps?: Partial<JobServiceDeps>,
  viewer?: { userId: string; isSuperAdmin: boolean }): Promise<JobEntity | null> {
  const d = resolveDeps(deps); const db = d.db;
  const [row] = await db.select().from(jobItems).where(eq(jobItems.id, id)).limit(1);
  if (!row) return null;
  const dto = rowToJob(row);
  if (viewer) {
    // Stamp the backend-authoritative manage flag so the frontend can
    // gate Edit / Delete / Candidates + Reports without re-deriving the
    // rule. See `canViewerManageJob` for the canonical rule.
    const result = await canViewerManageJob(viewer.userId, viewer.isSuperAdmin, id);
    dto.viewerCanManage = result?.canManage === true;
  }
  return dto;
}

/** Keys that live inside the `job_items.details` jsonb bag rather than as
 *  their own column. Single-sourced so create + update agree. */
const DETAIL_KEYS = ["responsibilities", "requirements", "qualifications", "benefits"] as const;

/** First non-empty value of a single-or-array wire field (the form ships
 *  employmentType / seniority as arrays; the scraper ships single strings). */
function firstOf(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v.find((x) => typeof x === "string" && x.trim() !== "");
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/** Extract the subset of detail-bag keys present on the DTO. Returns
 *  `undefined` when none are present so callers can skip touching the
 *  `details` column entirely. */
export function extractDetailsPatch(job: Partial<CreateJobDTO>): Record<string, string[]> | undefined {
  let patch: Record<string, string[]> | undefined;
  for (const key of DETAIL_KEYS) {
    const val = (job as Record<string, unknown>)[key];
    if (val !== undefined) {
      (patch ??= {})[key] = Array.isArray(val) ? (val as string[]) : [];
    }
  }
  return patch;
}

/**
 * Single source of truth mapping the wire DTO → `job_items` scalar column
 * patch (#878). Used by BOTH `createJob` and `updateJob` so the editable
 * surface can never drift between the two paths again — the previous
 * hand-rolled per-field SET clauses silently dropped ~15 fields on PUT.
 *
 * Only keys actually present on `job` are emitted, so it doubles as the
 * partial-update patch. The `details` jsonb bag is handled separately
 * (see `extractDetailsPatch`) because create writes a fresh object while
 * update merges into the existing one.
 */
export function buildJobColumnPatch(job: Partial<CreateJobDTO>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (job.title !== undefined) p.title = job.title;
  if (job.description !== undefined) p.description = job.description;
  if (job.company !== undefined) p.company = job.company;
  if (job.location !== undefined) p.location = job.location;
  if (job.heroImageUrl !== undefined) p.heroImageUrl = job.heroImageUrl ?? null;
  if (job.videoProjectId !== undefined) p.videoProjectId = job.videoProjectId ?? null;
  if (job.sector !== undefined) p.sector = job.sector || null;
  if (job.skills !== undefined) p.skillsRequired = job.skills;
  if (job.applyUrl !== undefined) p.applyUrl = job.applyUrl || null;

  // employmentType (single-or-array, any spelling) → canonical kebab job_type.
  if (job.employmentType !== undefined) {
    const first = firstOf(job.employmentType);
    p.jobType = first ? (normalizeEmploymentType(first) ?? first) : null;
  }
  // seniority / experienceLevel (either wire name, any spelling) → canonical
  // lowercase experience_level (#2090). "None"/unmapped normalize to null so a
  // not-specified posting stores NULL rather than an un-filterable raw string.
  if (job.seniority !== undefined || job.experienceLevel !== undefined) {
    const first = firstOf(job.seniority) ?? job.experienceLevel ?? null;
    p.experienceLevel = first ? normalizeSeniority(first) : null;
  }
  if (job.salaryMin !== undefined) p.salaryMin = job.salaryMin == null ? null : String(job.salaryMin);
  if (job.salaryMax !== undefined) p.salaryMax = job.salaryMax == null ? null : String(job.salaryMax);
  if (job.currency !== undefined) p.salaryCurrency = job.currency || "USD";

  // Work setting (#2069): store the canonical 'onsite'|'remote'|'hybrid'
  // value AND keep `is_remote` as a derived convenience. Hybrid carries a
  // weekly day-split; the days are forced null for onsite/remote.
  if (job.workSetting !== undefined) {
    const ws = normalizeWorkSetting(job.workSetting);
    p.workSetting = ws;
    // isRemote derives from the setting unless the caller pinned it explicitly.
    if (job.isRemote === undefined) p.isRemote = ws === "remote";
    const { onsiteDaysPerWeek, remoteDaysPerWeek } = normalizeHybridDays(
      ws,
      job.onsiteDaysPerWeek,
      job.remoteDaysPerWeek,
    );
    p.onsiteDaysPerWeek = onsiteDaysPerWeek;
    p.remoteDaysPerWeek = remoteDaysPerWeek;
  } else if (
    (job.onsiteDaysPerWeek !== undefined || job.remoteDaysPerWeek !== undefined)
  ) {
    // Day-split edited without re-sending workSetting — clamp the raw values;
    // they only render when the stored setting is hybrid.
    if (job.onsiteDaysPerWeek !== undefined) {
      p.onsiteDaysPerWeek = job.onsiteDaysPerWeek == null ? null : Math.max(0, Math.min(7, Math.round(job.onsiteDaysPerWeek)));
    }
    if (job.remoteDaysPerWeek !== undefined) {
      p.remoteDaysPerWeek = job.remoteDaysPerWeek == null ? null : Math.max(0, Math.min(7, Math.round(job.remoteDaysPerWeek)));
    }
  }
  // Explicit isRemote always wins when provided.
  if (job.isRemote !== undefined) p.isRemote = job.isRemote;

  // Publish state: `status` (Open=published) wins; else legacy isPublic.
  if (job.status !== undefined) p.isActive = job.status.toLowerCase() === "open";
  else if (job.isPublic !== undefined) p.isActive = job.isPublic;

  if (job.expirationDate !== undefined) {
    const d = job.expirationDate ? new Date(job.expirationDate) : null;
    p.expiresAt = d && !Number.isNaN(d.getTime()) ? d : null;
  }
  return p;
}

export async function createJob(job: CreateJobDTO, userId: string,
  deps?: Partial<JobServiceDeps>): Promise<JobEntity> {
  const d = resolveDeps(deps); const db = d.db;
  const detailsPatch = extractDetailsPatch(job);
  const [row] = await db
    .insert(jobItems)
    .values({
      postedByUserId: userId,
      ...buildJobColumnPatch(job),
      // Fresh row: write the detail bag directly (no existing object to merge).
      ...(detailsPatch ? { details: detailsPatch } : {}),
    } as any)
    .returning();
  bumpSearchVersion();
  return rowToJob(row!);
}

/**
 * Lightweight HTML → structured-job parser used by `POST /api/jobs/extract`.
 * Tries (in order):
 *   1. JSON-LD `JobPosting` (the gold standard — most ATSes emit this)
 *   2. OpenGraph `og:title` + `<meta name="description">`
 *   3. `<title>` + URL hostname as a last-resort fallback
 *
 * Pure string operations on purpose: we run inside a Cloudflare Worker so
 * there is no real DOM, and pulling in cheerio just for this one route is
 * not worth the bundle hit.
 */
export interface ParsedJob {
  title: string;
  description: string;
  company?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  isRemote?: boolean;
  jobType?: string;          // full_time, part_time, contract, internship, ...
  experienceLevel?: string;  // entry, mid, senior, executive
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  skills?: string[];
  responsibilities?: string[];
  requirements?: string[];
  qualifications?: string[];
  benefits?: string[];
  /** Direct-apply or canonical job URL extracted from JSON-LD or the source page. */
  applyUrl?: string;
  /** "high" when JSON-LD JobPosting was found, "low" otherwise. */
  confidence: "high" | "low";
}

export function parseJobFromPage(input: { url?: string; html?: string }): ParsedJob {
  const html = input.html ?? "";
  const url = input.url ?? "";

  // 1. JSON-LD JobPosting — gold standard, treat as high confidence.
  //    The extraction itself lives in shared/scraping/jsonLd.ts so the
  //    Chrome extension + frontend + API all read the same schema.org
  //    shape. We use the first JobPosting returned (multiple typically
  //    only appear on search-results pages, which are a misuse of this
  //    single-job extractor — upstream callers prefilter).
  const jsonLdJobs = extractJobPostingsFromHtml(html);
  if (jsonLdJobs.length > 0) {
    const posting = jsonLdJobs[0];

    // Apply URL priority — we compose here rather than in shared because
    // only the API has the "fall back to the request URL" convention:
    //   1. JSON-LD directApply (explicit apply link)
    //   2. JSON-LD url (canonical job page — often = the listing page)
    //   3. DOM heuristic: an <a> matching apply-button patterns
    //      (Home Depot's JSON-LD has no directApply; the listing page
    //      links to `myworkdayjobs.com` directly)
    //   4. The inbound request URL itself
    const applyUrl =
      posting.directApplyUrl ||
      posting.canonicalUrl ||
      findApplyLinkInHtmlShared(html, url) ||
      url ||
      undefined;

    return {
      title: posting.title || fallbackTitle(url),
      // shared returns the raw description string; convert to markdown
      // here and fall through to the whole-page markdown when the
      // JobPosting didn't ship a description at all.
      description:
        htmlToMarkdownShared(posting.description ?? "") ||
        htmlToMarkdownShared(html).slice(0, 8000),
      company: posting.company || HIRED_VIDEO_SEED_COMPANY,
      location: posting.location,
      city: posting.city,
      state: posting.state,
      country: posting.country,
      isRemote: posting.isRemote,
      jobType: posting.jobType,
      experienceLevel: undefined, // schema.org has no direct field
      salaryMin: posting.salaryMin,
      salaryMax: posting.salaryMax,
      salaryCurrency: posting.salaryCurrency,
      skills: posting.skills,
      responsibilities: posting.responsibilities,
      requirements: posting.requirements,
      qualifications: posting.qualifications,
      benefits: posting.benefits,
      applyUrl,
      confidence: "high",
    };
  }

  // 2. OpenGraph + meta description fallback — low confidence, AI must verify.
  const ogTitle = matchMeta(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDesc = matchMeta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const metaDesc = matchMeta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const ogSite = matchMeta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  const docTitle = matchMeta(html, /<title[^>]*>([^<]+)<\/title>/i);

  // LinkedIn doesn't emit JSON-LD on /jobs/view/{id}/ but its <title>
  // tag carries everything we need: "{Company} hiring {Title} in {Location} | LinkedIn".
  // Parse it before falling back to og:title/docTitle so we land on the
  // actual job title (and pick up company + location for free) instead of
  // "Job from linkedin.com".
  const liDocParse = parseLinkedInTitleString(docTitle);

  const title = liDocParse?.title || ogTitle || docTitle || fallbackTitle(url);
  const markdown = htmlToMarkdownShared(html);
  const description = markdown || ogDesc || metaDesc || url;

  return {
    title: title.slice(0, 250),
    description: description.slice(0, 8000),
    company: liDocParse?.company || ogSite || undefined,
    location: liDocParse?.location || undefined,
    isRemote: undefined,
    applyUrl: findApplyLinkInHtmlShared(html, url) || url || undefined,
    confidence: "low",
  };
}

// findApplyLinkInHtml now lives in shared/scraping/applyLink.ts, where
// the SCORING version (scoreApplyCandidates) also lives for debugging.
// The re-export at the top of this file keeps every historical caller
// working.

// ---- AI-backed classification ---------------------------------------

const ClassificationSchema = z.object({
  isJobPosting: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  job: z
    .object({
      title: z.string().optional(),
      company: z.string().optional(),
      location: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      description: z.string().optional(),
      isRemote: z.boolean().optional(),
      jobType: z.string().optional(),
      experienceLevel: z.string().optional(),
      salaryMin: z.number().nullable().optional(),
      salaryMax: z.number().nullable().optional(),
      salaryCurrency: z.string().optional(),
      skills: z.array(z.string()).optional(),
      responsibilities: z.array(z.string()).optional(),
      requirements: z.array(z.string()).optional(),
      qualifications: z.array(z.string()).optional(),
      benefits: z.array(z.string()).optional(),
      applyUrl: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export type JobClassification = z.infer<typeof ClassificationSchema>;

/** Threshold below which we reject the page as "not a job". */
const CLASSIFICATION_THRESHOLD = 0.7;

/**
 * Use the LLM to decide whether a page is a job posting and, if so,
 * extract structured fields from it. Used as the second pass in
 * `extractAndClassifyJob` when JSON-LD wasn't available.
 */
async function classifyWithLLM(
  llm: LLMClient,
  input: { url: string; markdown: string; hint: ParsedJob },
  featureKey = "job_classify"): Promise<JobClassification> {
  // The caller has already converted HTML → Markdown so paragraph breaks,
  // bullet lists, and section headers (`**Qualifications**`, `## About`,
  // etc.) are all intact. Slice generously — we want enough room for
  // long descriptions.
  const markdown = input.markdown.slice(0, 16_000);

  const systemPrompt = [
    "You are a strict classifier and structured-extractor for job postings.",
    "Your input is a Markdown document (not HTML) derived from a job page. Paragraph breaks, bullet lists (- item), and bold section headers (**Qualifications**, **Benefits**, etc.) carry meaning — use them.",
    "",
    "STEP 1 — classify: decide whether the input describes a single job posting.",
    "  ACCEPT (isJobPosting=true) when:",
    "    - The text describes one specific role with responsibilities and/or requirements.",
    "    - The role does not need an explicit 'Title:' line — infer the title from phrases like 'We're looking for a Senior Product Manager' or from a bold heading that names the role.",
    "  REJECT (isJobPosting=false) when:",
    "    - There is no single dominant role — the text is a search results list, a company homepage, an article about jobs, a resume, or a profile.",
    "",
    "STEP 2 — if accepted, extract the fields below. Rules:",
    "  - Never invent data. Use null for missing scalars and [] for missing lists.",
    "  - title: infer from role mentions in the body text when no explicit title line exists. Title-case it (e.g. 'Senior Product And AI Leader').",
    "  - company: infer from 'About <Company>' sections, possessive mentions ('<Company>'s goal', 'at <Company>'), or sign-offs. Return the employer name only — not the job board (LinkedIn, Indeed, etc).",
    "  - description: the FULL multi-paragraph role description as Markdown. Preserve paragraph breaks with actual \\n\\n between paragraphs. Keep **bold** on inline section labels. DO NOT duplicate content that belongs in responsibilities/requirements/qualifications/benefits — those should be pulled into their own arrays and removed from the description body. Aim for 2-6 paragraphs that cover the company pitch, the mission of the role, and any context that isn't a bulleted list.",
    "  - responsibilities: every bullet under headings like 'What You'll Do', 'Responsibilities', 'The Role', 'Product Leadership', 'AI Acceleration', etc. Merge sub-sections when they are clearly part of the same 'what you will do' block.",
    "  - requirements: bullets under 'Requirements', 'What We're Looking For', 'Must Have', 'Basic Qualifications'.",
    "  - qualifications: bullets under 'Qualifications', 'Preferred Qualifications', 'Nice To Have', 'Bonus If You Have', 'Education'.",
    "  - benefits: bullets under 'Benefits', 'Perks', 'What We Offer', 'Compensation'. Include salary range lines.",
    "  - skills: concrete technologies, tools, or hard skills mentioned anywhere (e.g. ['TypeScript','AWS','LLM platforms','Product management']).",
    "  - applyUrl: the direct application URL if one is mentioned or linked in the text (e.g. 'Apply at https://workday.com/homedepot/apply/123'). This is often a different domain from where the job is posted (Workday, Greenhouse, Lever, etc.). null if not found.",
    "",
    "Return ONLY a JSON object with this exact shape (no markdown fences, no commentary):",
    "{",
    '  "isJobPosting": boolean,',
    '  "confidence": number between 0 and 1,',
    '  "reason": short string (1 sentence) explaining the decision,',
    '  "job": {',
    '    "title": string,',
    '    "company": string,',
    '    "location": string — human-readable, e.g. "San Francisco, CA" or "Remote",',
    '    "city": string,',
    '    "state": string,',
    '    "country": string,',
    '    "isRemote": boolean,',
    '    "jobType": one of ["full_time","part_time","contract","temporary","internship","volunteer"],',
    '    "experienceLevel": one of ["entry","mid","senior","executive"],',
    '    "salaryMin": annual base salary minimum in dollars (number, no formatting),',
    '    "salaryMax": annual base salary maximum in dollars (number, no formatting),',
    '    "salaryCurrency": ISO 4217 code, default "USD",',
    '    "description": multi-paragraph Markdown string, paragraph breaks with \\n\\n,',
    '    "responsibilities": string[],',
    '    "requirements": string[],',
    '    "qualifications": string[],',
    '    "benefits": string[],',
    '    "skills": string[],',
    '    "applyUrl": string or null — direct application URL if found',
    "  }",
    "}",
    "",
    'When isJobPosting is false, set "job" to null.',
  ].join("\n");

  const userMessage = [
    `URL: ${input.url}`,
    `Hint title: ${input.hint.title || "(none)"}`,
    `Hint company: ${input.hint.company || "(none)"}`,
    "",
    "--- MARKDOWN ---",
    markdown,
    "--- END MARKDOWN ---",
  ].join("\n");

  const { data } = await llm.callJson(
    featureKey,
    {
      useCase: "job_parser",
      systemPrompt,
      userMessage,
      responseFormat: "json_object",
    },
    ClassificationSchema);
  return data;
}

export interface JobExtractionResult {
  ok: boolean;
  /** Reason for rejection — only present when ok=false. */
  reason?: string;
  /** Confidence score (0-1) for telemetry. */
  confidence: number;
  parsed?: ParsedJob;
}

/**
 * Full pipeline used by POST /api/jobs/extract:
 *   1. parseJobFromPage (JSON-LD / OG / heuristics).
 *   2. If JSON-LD found a JobPosting → high confidence, accept.
 *   3. Otherwise call the LLM classifier; reject if !isJobPosting
 *      or if confidence < CLASSIFICATION_THRESHOLD.
 *
 * Falls open (accepts the heuristic parse) when no API key is
 * configured, so dev environments without OpenRouter still work.
 */
/**
 * Run the LLM classifier against `html` and merge its output INTO an
 * already-parsed job — filling fields the first pass left empty.
 *
 * Why this exists: JSON-LD JobPosting is the gold-standard first pass,
 * but many ATSes (notably Home Depot's careers site) emit it with only
 * title / company / location / description — no jobType, salary,
 * experienceLevel, or skills. `extractAndClassifyJob` shortcuts on the
 * JSON-LD hit and skips the LLM, so those fields stay null forever.
 *
 * The /refresh path calls this to take a second pass with the LLM,
 * preserving every field the heuristic already got right and only
 * filling what's missing. Heuristic wins on conflict.
 */
export async function enrichParsedWithLLM(
  parsed: ParsedJob,
  input: { url?: string; html?: string; llm: LLMClient }): Promise<ParsedJob> {
  const markdown = htmlToMarkdown(input.html);
  if (!markdown || markdown.length < 200) return parsed;

  let classification: JobClassification;
  try {
    classification = await classifyWithLLM(input.llm, {
      url: input.url ?? "",
      markdown,
      hint: parsed,
    }, "job_enrich");
  } catch (err) {
    console.warn("[jobs/enrich] LLM enrichment failed, returning original parse:", err);
    return parsed;
  }

  if (!classification.isJobPosting || !classification.job) return parsed;

  const ai = classification.job;
  return {
    ...parsed,
    // Preserve heuristic's high-confidence fields; only fill holes.
    jobType: parsed.jobType || ai.jobType || undefined,
    experienceLevel: parsed.experienceLevel || ai.experienceLevel || undefined,
    salaryMin: parsed.salaryMin ?? ai.salaryMin ?? undefined,
    salaryMax: parsed.salaryMax ?? ai.salaryMax ?? undefined,
    salaryCurrency: parsed.salaryCurrency || ai.salaryCurrency,
    skills: parsed.skills && parsed.skills.length > 0 ? parsed.skills : ai.skills,
    responsibilities:
      parsed.responsibilities && parsed.responsibilities.length > 0
        ? parsed.responsibilities
        : ai.responsibilities,
    requirements:
      parsed.requirements && parsed.requirements.length > 0
        ? parsed.requirements
        : ai.requirements,
    qualifications:
      parsed.qualifications && parsed.qualifications.length > 0
        ? parsed.qualifications
        : ai.qualifications,
    benefits: parsed.benefits && parsed.benefits.length > 0 ? parsed.benefits : ai.benefits,
    applyUrl: parsed.applyUrl || ai.applyUrl,
    isRemote: parsed.isRemote ?? ai.isRemote,
  };
}

export async function extractAndClassifyJob(input: {
  url?: string;
  html?: string;
  llm?: LLMClient | null;
}): Promise<JobExtractionResult> {
  const heuristic = parseJobFromPage({ url: input.url, html: input.html });

  if (heuristic.confidence === "high") {
    return { ok: true, confidence: 1, parsed: splitDescriptionSections(heuristic) };
  }

  // No JSON-LD. Convert HTML → Markdown once; we pass the same MD to
  // the LLM and keep it around as the heuristic description fallback.
  const markdown = htmlToMarkdown(input.html);

  // No AI configured — accept the heuristic parse (with MD description)
  // rather than blocking the user. Dev/self-hosted deployments without
  // an OpenRouter key still get the same UX as before.
  if (!input.llm) {
    return {
      ok: true,
      confidence: 0.5,
      parsed: splitDescriptionSections({
        ...heuristic,
        description: markdown || heuristic.description,
      }),
    };
  }

  if (!markdown || markdown.length < 200) {
    return {
      ok: false,
      confidence: 0,
      reason:
        "We couldn't read enough of this page to tell whether it's a job. Open the actual job posting (not a search result or job board) and try again.",
    };
  }

  let classification: JobClassification;
  try {
    classification = await classifyWithLLM(input.llm, {
      url: input.url ?? "",
      markdown,
      hint: heuristic,
    }, "job_extract");
  } catch (err) {
    console.warn("[jobs/extract] LLM classification failed, falling open:", err);
    // Don't punish the user for an upstream LLM outage — fall through
    // to the heuristic parse (with the structured MD description).
    return {
      ok: true,
      confidence: 0.5,
      parsed: splitDescriptionSections({
        ...heuristic,
        description: markdown || heuristic.description,
      }),
    };
  }

  if (!classification.isJobPosting || classification.confidence < CLASSIFICATION_THRESHOLD) {
    return {
      ok: false,
      confidence: classification.confidence,
      reason:
        classification.reason ||
        "This page doesn't look like a single job posting. Open the specific role you want to track (not a search result, company page, or job board) and try again.",
    };
  }

  // AI says yes — merge AI fields over the heuristic so the best
  // available value wins for each slot.
  const aiJob = classification.job ?? {};
  const aiCity = aiJob.city || undefined;
  const aiState = aiJob.state || undefined;
  const aiCountry = aiJob.country || undefined;
  const composedLocation =
    aiJob.location ||
    [aiCity, aiState, aiCountry].filter(Boolean).join(", ") ||
    heuristic.location;

  return {
    ok: true,
    confidence: classification.confidence,
    parsed: splitDescriptionSections({
      title: (aiJob.title || heuristic.title || "Tracked Job").slice(0, 250),
      description: aiJob.description || heuristic.description,
      company: aiJob.company || heuristic.company || HIRED_VIDEO_SEED_COMPANY,
      location: composedLocation,
      city: aiCity || heuristic.city,
      state: aiState || heuristic.state,
      country: aiCountry || heuristic.country,
      isRemote: aiJob.isRemote ?? heuristic.isRemote,
      jobType: aiJob.jobType || heuristic.jobType,
      experienceLevel: aiJob.experienceLevel || heuristic.experienceLevel,
      salaryMin: aiJob.salaryMin ?? heuristic.salaryMin,
      salaryMax: aiJob.salaryMax ?? heuristic.salaryMax,
      salaryCurrency: aiJob.salaryCurrency || heuristic.salaryCurrency,
      skills: aiJob.skills?.length ? aiJob.skills : heuristic.skills,
      responsibilities: aiJob.responsibilities?.length
        ? aiJob.responsibilities
        : heuristic.responsibilities,
      requirements: aiJob.requirements?.length ? aiJob.requirements : heuristic.requirements,
      qualifications: aiJob.qualifications?.length
        ? aiJob.qualifications
        : heuristic.qualifications,
      benefits: aiJob.benefits?.length ? aiJob.benefits : heuristic.benefits,
      applyUrl: aiJob.applyUrl || heuristic.applyUrl,
      confidence: "high",
    }),
  };
}

function matchMeta(html: string, pattern: RegExp): string | undefined {
  const m = html.match(pattern);
  return m?.[1]?.trim();
}

// stripHtml / decodeHtmlEntities / htmlToMarkdown moved to
// hired.video/shared/scraping/htmlUtils.ts. The re-exports at the top
// of this file preserve the existing public surface.

function fallbackTitle(url: string): string {
  try {
    const u = new URL(url);
    return `Job from ${u.hostname.replace(/^www\./, "")}`;
  } catch {
    return "Tracked Job";
  }
}

/** Parse a schema.org `QuantitativeValue` field into a number. */
function numericFromQuantitativeValue(value: unknown, key: "minValue" | "maxValue" | "value"): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = (value as Record<string, unknown>)[key];
  const n = typeof raw === "string" ? Number(raw) : (raw as number | undefined);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** Coerce a value that might be a comma-separated string OR a string[] into string[]. */
function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => stripHtml(String(v))).filter((s) => s.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n•·]/)
      .map((s) => stripHtml(s))
      .filter((s) => s.length > 0);
  }
  return [];
}

/**
 * Post-parse description section splitter. When the structured arrays
 * (responsibilities, requirements, qualifications, benefits) are empty
 * but the description text contains recognizable headings, extract them.
 *
 * Common patterns (Dice, Greenhouse, many ATSes):
 *   "Key Responsibilities ... Qualifications ... Benefits ..."
 *   "What You'll Do ... What We're Looking For ... What We Offer ..."
 */
export function splitDescriptionSections(parsed: ParsedJob): ParsedJob {
  // Only run when all structured fields are empty.
  const hasStructure =
    (parsed.responsibilities?.length ?? 0) > 0 ||
    (parsed.requirements?.length ?? 0) > 0 ||
    (parsed.qualifications?.length ?? 0) > 0 ||
    (parsed.benefits?.length ?? 0) > 0;
  if (hasStructure) return parsed;

  const text = parsed.description || "";
  if (text.length < 200) return parsed;

  // Section-header patterns — order matters: check more specific first.
  const SECTION_PATTERNS: Array<{
    key: keyof Pick<ParsedJob, "responsibilities" | "requirements" | "qualifications" | "benefits">;
    patterns: RegExp[];
  }> = [
    {
      key: "responsibilities",
      patterns: [
        /(?:key\s+)?responsibilities/i,
        /what\s+you(?:'ll|\s+will)\s+do/i,
        /your\s+role/i,
        /the\s+role/i,
        /job\s+duties/i,
        /essential\s+(?:duties|functions)/i,
      ],
    },
    {
      key: "requirements",
      patterns: [
        /(?:basic\s+|minimum\s+)?requirements/i,
        /what\s+we(?:'re|\s+are)\s+looking\s+for/i,
        /what\s+you(?:'ll|\s+will)\s+(?:need|bring)/i,
        /required\s+skills/i,
        /skills\s+(?:&|and)\s+experience/i,
        /must\s+have/i,
      ],
    },
    {
      key: "qualifications",
      patterns: [
        /qualifications/i,
        /education/i,
        /preferred\s+qualifications/i,
        /nice\s+to\s+have/i,
        /desired\s+skills/i,
      ],
    },
    {
      key: "benefits",
      patterns: [
        // Matches "Benefits", "Benefit", "Benefits & Perks", "Benefits and Perks".
        /benefits?(?:\s*(?:&|and)\s*perks?)?/i,
        /what\s+we\s+offer/i,
        /why\s+(?:join|work)/i,
        /compensation/i,
        /our\s+benefits/i,
        /perks/i,
      ],
    },
  ];

  // Split the text into lines.
  const lines = text.split(/\n|(?<=\.)\s+(?=[A-Z])/);

  // Walk lines and assign each to the most-recently-matched section.
  let currentKey: string | null = null;
  const buckets: Record<string, string[]> = {};
  let cleanDescription: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let matched = false;
    for (const section of SECTION_PATTERNS) {
      if (section.patterns.some((p) => p.test(line) && line.length < 120)) {
        currentKey = section.key;
        if (!buckets[currentKey]) buckets[currentKey] = [];
        matched = true;
        break;
      }
    }

    if (matched) continue;

    if (currentKey && buckets[currentKey]) {
      // Strip leading bullet chars or numbered-list prefixes like "1.", "2)".
      // Do NOT eat bare leading digits — "5+ years" must stay intact.
      const clean = line
        .replace(/^(?:[\s•\-–—*·▪►●○◦→⮞]+|\d+[.)\]])\s*/, "")
        .trim();
      if (clean.length > 10) buckets[currentKey].push(clean);
    } else {
      cleanDescription.push(line);
    }
  }

  return {
    ...parsed,
    // Replace the giant-blob description with the pre-section portion.
    description: cleanDescription.length > 0 ? cleanDescription.join("\n") : parsed.description,
    responsibilities: buckets.responsibilities?.length ? buckets.responsibilities : parsed.responsibilities,
    requirements: buckets.requirements?.length ? buckets.requirements : parsed.requirements,
    qualifications: buckets.qualifications?.length ? buckets.qualifications : parsed.qualifications,
    benefits: buckets.benefits?.length ? buckets.benefits : parsed.benefits,
  };
}

// normalizeJsonLdEmploymentType now lives in shared/scraping/jsonLd.ts
// and runs inside extractJobPostingsFromHtml. No in-file caller remains.

/**
 * Insert a job posting created via the extension and immediately
 * bookmark it so the calling user can see it in their `/saved` count.
 *
 * Public-by-default: `isActive` defaults to true on the column, which is
 * the only filter `getPublicJobs` applies — so the job lands on the
 * public board the moment it's inserted.
 */
export async function createTrackedJob(input: {
    title: string;
    description: string;
    company?: string;
    location?: string;
    sourceUrl?: string;
    applyUrl?: string;
    isRemote?: boolean;
    jobType?: string;
    experienceLevel?: string;
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    skills?: string[];
    responsibilities?: string[];
    requirements?: string[];
    qualifications?: string[];
    benefits?: string[];
  },
  userId: string,
  options: { track?: boolean } = {},
  deps?: Partial<JobServiceDeps>): Promise<JobEntity> {
  const d = resolveDeps(deps); const db = d.db;
  const track = options.track ?? true;
  const company = input.company?.trim() || HIRED_VIDEO_SEED_COMPANY;
  const normalizedUrl = normalizeJobUrl(input.sourceUrl);

  const details = {
    responsibilities: input.responsibilities ?? [],
    requirements: input.requirements ?? [],
    qualifications: input.qualifications ?? [],
    benefits: input.benefits ?? [],
  };

  // NOTE: the extract route now runs deduplicateJob() BEFORE calling
  // createTrackedJob, so by the time we get here the dedup pipeline
  // has already either returned an existing row or decided this is
  // genuinely new. This inner sourceUrl check is a safety net.
  if (normalizedUrl) {
    const [existing] = await db
      .select()
      .from(jobItems)
      .where(eq(jobItems.sourceUrl, normalizedUrl))
      .limit(1);
    if (existing) {
      if (track) {
        await db.insert(savedJobs).values({ userId, jobId: existing.id }).onConflictDoNothing();
      }
      return rowToJob(existing);
    }
  }

  // Heuristic sector tag. Pure shared classifier — see #1172. Null when
  // no keyword hits with enough confidence; tracked + extracted jobs
  // then surface in sector search only after a human edits them via
  // JobCreatePage's <SectorPicker>.
  const sector = classifyJobSector(input.title, input.description);

  const [row] = await db
    .insert(jobItems)
    .values({
      postedByUserId: track ? userId : null,
      title: input.title.slice(0, 250) || "Tracked Job",
      description: input.description ?? "",
      company,
      location: input.location,
      // Canonicalize on write (#1673) so the exact-eq search filter matches.
      jobType: normalizeEmploymentType(input.jobType) ?? input.jobType,
      experienceLevel: input.experienceLevel,
      salaryMin: input.salaryMin !== undefined ? String(input.salaryMin) : undefined,
      salaryMax: input.salaryMax !== undefined ? String(input.salaryMax) : undefined,
      salaryCurrency: input.salaryCurrency || "USD",
      skillsRequired: input.skills ?? [],
      sector,
      details,
      isRemote: input.isRemote ?? false,
      isActive: true,
      sourceUrl: normalizedUrl || input.sourceUrl,
      // Only persist applyUrl when it's distinct from sourceUrl — a null
      // column is the signal for "still needs a real apply link" that
      // /refresh uses to know the stored value is just the sourceUrl
      // fallback and should be replaced when a better candidate appears.
      applyUrl:
        input.applyUrl && input.applyUrl !== (normalizedUrl || input.sourceUrl)
          ? input.applyUrl
          : null,
    } as any)
    .returning();

  if (row && track) {
    await db.insert(savedJobs).values({ userId, jobId: row.id }).onConflictDoNothing();
  }

  return rowToJob(row!);
}

export async function updateJob(id: string,
  jobData: Partial<CreateJobDTO>,
  userId: string,
  deps?: Partial<JobServiceDeps>): Promise<JobEntity | null> {
  const d = resolveDeps(deps); const db = d.db;
  // Single source of truth for the scalar column mapping — shared with
  // createJob so the editable surface can't drift (#878). Previously this
  // hand-rolled a 5-field SET clause and silently dropped requirements,
  // responsibilities, employmentType, salary, status, expiry, etc.: the
  // save returned 200 but persisted nothing.
  const updates: Record<string, unknown> = { ...buildJobColumnPatch(jobData), updatedAt: new Date() };

  // Detail-bag keys live in the `details` jsonb column. Merge (not
  // replace) so editing only "requirements" doesn't wipe a previously
  // saved "benefits" list. `|| '{}'` guards legacy null rows.
  const detailsPatch = extractDetailsPatch(jobData);
  if (detailsPatch) {
    updates.details = sql`coalesce(${jobItems.details}, '{}'::jsonb) || ${JSON.stringify(detailsPatch)}::jsonb`;
  }

  const [row] = await db
    .update(jobItems)
    .set(updates)
    .where(and(eq(jobItems.id, id), eq((jobItems as any).postedByUserId, userId)))
    .returning();
  if (row) bumpSearchVersion();
  return row ? rowToJob(row) : null;
}

/**
 * Single source of truth for deriving the public "apply URL" that
 * job-response payloads expose to the extension.
 *
 * Priority order:
 *
 *   1. `job.applyUrl` — persisted direct-apply link on the job_items
 *      row. Populated at track time (or refresh time) when a distinct
 *      apply URL was detected. Only non-null when it's actually
 *      different from the sourceUrl — the column stores null for the
 *      "we don't have a real apply link yet" case.
 *   2. `parsed.applyUrl` — direct-apply link the extractor just pulled
 *      from the current page (JSON-LD `directApply` / `url` or DOM
 *      apply-button heuristics). Used on /extract and /refresh calls
 *      where we have fresh HTML.
 *   3. `job.sourceUrl` — the URL the job was tracked from. When no
 *      direct-apply link exists, the listing page itself is the
 *      next-best destination.
 *   4. `fallbackUrl` — the URL the client is currently on. Last resort.
 */
export function deriveApplyUrl(args: {
  parsed?: { applyUrl?: string | null };
  job?: { applyUrl?: string | null; sourceUrl?: string | null };
  fallbackUrl?: string | null;
}): string | undefined {
  return (
    args.job?.applyUrl ||
    args.parsed?.applyUrl ||
    args.job?.sourceUrl ||
    args.fallbackUrl ||
    undefined
  );
}

/**
 * True when a job's stored applyUrl is effectively "missing" — either
 * null/empty or identical to its sourceUrl (meaning the persisted
 * value is just the sourceUrl fallback, not a real direct-apply link).
 * Used by computeRefreshBackfill to decide whether a rescan should
 * attempt to replace the stored applyUrl with a fresh candidate.
 */
export function isApplyUrlFallback(row: { applyUrl?: string | null; sourceUrl?: string | null }): boolean {
  const apply = row.applyUrl;
  const source = row.sourceUrl;
  if (apply == null || apply === "") return true;
  if (source && apply === source) return true;
  return false;
}

/**
 * Compute the backfill diff for `POST /api/jobs/:id/refresh`. Extracted
 * from the route so the merge policy is directly unit-testable.
 *
 * Contract:
 *  - Never overwrites a non-null/non-empty stored value — this is a
 *    backfill, not a re-extract.
 *  - Honors the caller-supplied `missingFields` allow-list strictly.
 *    Passing `null` falls back to "fill anything empty" (used when the
 *    caller trusts the server to decide).
 *  - `details.*` subfields are merged key-by-key; the returned
 *    `updates.details` is the full merged bag (so the route can write
 *    it back as a single jsonb column).
 *
 * Returns `{ updates, updatedFields }` where `updatedFields` lists the
 * column/dotted-path names that actually changed, so the client UI can
 * show "Updated 3 fields".
 */
export function computeRefreshBackfill(args: {
  row: typeof jobItems.$inferSelect;
  parsed: ParsedJob;
  url?: string;
  missingFields: string[] | null;
}): { updates: Record<string, unknown>; updatedFields: string[] } {
  const { row, parsed, url, missingFields } = args;
  const allowField = (col: string) => missingFields === null || missingFields.includes(col);

  const updates: Record<string, unknown> = {};
  const updatedFields: string[] = [];

  const fillIfEmpty = (col: string, storedVal: unknown, parsedVal: unknown) => {
    if (!allowField(col)) return;
    const stored = storedVal as string | number | null | undefined;
    const fresh = parsedVal as string | number | null | undefined;
    if (stored != null && stored !== "") return;
    if (fresh == null || fresh === "") return;
    updates[col] = fresh;
    updatedFields.push(col);
  };

  fillIfEmpty("description", row.description, parsed.description);
  fillIfEmpty("location", row.location, parsed.location);
  fillIfEmpty("jobType", row.jobType, parsed.jobType);
  fillIfEmpty("experienceLevel", row.experienceLevel, parsed.experienceLevel);
  fillIfEmpty("salaryMin", row.salaryMin, parsed.salaryMin);
  fillIfEmpty("salaryMax", row.salaryMax, parsed.salaryMax);
  fillIfEmpty("salaryCurrency", row.salaryCurrency, parsed.salaryCurrency);
  fillIfEmpty("sourceUrl", row.sourceUrl, url || "");

  // applyUrl update policy: always overwrite with a fresh distinct
  // candidate. Unlike other fields (backfill-only), apply links drift
  // — a posting may first land with just sourceUrl, later expose a
  // Workday/Greenhouse form, and eventually change to a different ATS.
  // Each rescan is the user's signal that the stored value is stale, so
  // we replace it whenever we find something better.
  //
  // A "fresh candidate" is parsed.applyUrl or the current request URL,
  // filtered to exclude anything that equals sourceUrl (that's the same
  // no-apply-link fallback the extension already shows).
  if (allowField("applyUrl")) {
    const sourceNorm = (row.sourceUrl || "").toString();
    const parsedCandidate =
      parsed.applyUrl && parsed.applyUrl !== sourceNorm ? parsed.applyUrl : undefined;
    const urlCandidate = url && url !== sourceNorm ? url : undefined;
    const candidate = parsedCandidate || urlCandidate;
    if (candidate && candidate !== row.applyUrl) {
      updates.applyUrl = candidate;
      updatedFields.push("applyUrl");
    }
  }

  if (allowField("skillsRequired")) {
    const storedSkills = (row.skillsRequired ?? []) as string[];
    if (
      (!storedSkills || storedSkills.length === 0) &&
      Array.isArray(parsed.skills) && parsed.skills.length > 0
    ) {
      updates.skillsRequired = parsed.skills;
      updatedFields.push("skillsRequired");
    }
  }

  // details jsonb — merge per-key. Each subfield can be requested via
  // "details.responsibilities" etc., or the whole bag via "details".
  const storedDetails = ((row as Record<string, unknown>).details ?? {}) as Record<string, unknown>;
  const mergedDetails: Record<string, unknown> = { ...storedDetails };
  let detailsChanged = false;
  const fillDetailIfEmpty = (key: string, val: unknown) => {
    if (!allowField(`details.${key}`) && !allowField("details")) return;
    const current = storedDetails[key];
    const isEmpty = current == null || (Array.isArray(current) && current.length === 0);
    if (!isEmpty) return;
    if (!Array.isArray(val) || val.length === 0) return;
    mergedDetails[key] = val;
    detailsChanged = true;
    updatedFields.push(`details.${key}`);
  };
  fillDetailIfEmpty("responsibilities", parsed.responsibilities);
  fillDetailIfEmpty("requirements", parsed.requirements);
  fillDetailIfEmpty("qualifications", parsed.qualifications);
  fillDetailIfEmpty("benefits", parsed.benefits);
  if (detailsChanged) updates.details = mergedDetails;

  return { updates, updatedFields };
}

export async function deleteJob(id: string, userId: string, isAdmin = false,
  deps?: Partial<JobServiceDeps>): Promise<boolean> {
  const d = resolveDeps(deps); const db = d.db;
  const condition = isAdmin
    ? eq(jobItems.id, id)
    : and(eq(jobItems.id, id), eq((jobItems as any).postedByUserId, userId));
  const deleted = await db.delete(jobItems).where(condition).returning({ id: jobItems.id });
  if (deleted.length > 0) bumpSearchVersion();
  return deleted.length > 0;
}

export async function saveJob(jobId: string, userId: string,
  deps?: Partial<JobServiceDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  await db.insert(savedJobs).values({ userId, jobId }).onConflictDoNothing();
}

export async function unsaveJob(jobId: string, userId: string,
  deps?: Partial<JobServiceDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  await db.delete(savedJobs).where(and(eq(savedJobs.jobId, jobId), eq(savedJobs.userId, userId)));
}

export async function getSavedJobs(userId: string): Promise<(JobEntity & { pipelineStatus?: string; appliedAt?: string; statusChangedAt?: string })[]> {
  const db = getDb();
  const rows = await db
    .select({ job: jobItems, saved: savedJobs })
    .from(savedJobs)
    .innerJoin(jobItems, eq(savedJobs.jobId, jobItems.id))
    .where(eq(savedJobs.userId, userId))
    .orderBy(desc(savedJobs.createdAt));
  return rows.map((r) => ({
    ...rowToJob(r.job),
    pipelineStatus: (r.saved as any).status ?? 'tracked',
    appliedAt: (r.saved as any).appliedAt?.toISOString?.() ?? undefined,
    statusChangedAt: (r.saved as any).statusChangedAt?.toISOString?.() ?? undefined,
  }));
}

/** Valid job seeker pipeline statuses */
export const JOB_PIPELINE_STATUSES = [
  'tracked', 'applied', 'interviewing', 'offered',
  'accepted', 'rejected', 'cancelled', 'withdrawn', 'declined',
] as const;

export async function updateSavedJobStatus(jobId: string, userId: string, status: string, notes?: string,
  deps?: Partial<JobServiceDeps>): Promise<boolean> {
  const d = resolveDeps(deps); const db = d.db;
  const now = new Date();
  const [updated] = await db
    .update(savedJobs)
    .set({
      status,
      statusChangedAt: now,
      updatedAt: now,
      ...(status === 'applied' ? { appliedAt: now } : {}),
      ...(notes !== undefined ? { notes } : {}),
    } as any)
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
    .returning();
  return !!updated;
}

export async function applyToJob(jobId: string, userId: string, application: ApplyJobDTO,
  deps?: Partial<JobServiceDeps>): Promise<{ applicationId: string }> {
  const d = resolveDeps(deps); const db = d.db;
  const [created] = await db.insert(jobApplications).values({
    userId,
    jobId,
    resumeId: application.resumeId as any,
    coverLetter: application.coverLetter,
    status: "applied",
  } as any).returning({ id: jobApplications.id });
  return { applicationId: created!.id };
}

export async function getApplications(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ app: jobApplications, job: jobItems })
    .from(jobApplications)
    .leftJoin(jobItems, eq(jobApplications.jobId, jobItems.id))
    .where(eq(jobApplications.userId, userId))
    .orderBy(desc(jobApplications.appliedAt));
  return rows.map((r) => ({
    id: r.app.id,
    jobId: r.app.jobId,
    status: r.app.status,
    appliedAt: new Date(r.app.appliedAt).toISOString(),
    job: r.job ? rowToJob(r.job) : null,
  }));
}

export async function getJobBySlug(
  slug: string,
  viewer?: { userId: string; isSuperAdmin: boolean },
): Promise<JobEntity | null> {
  return getJobById(slug, undefined, viewer);
}

export async function getJobAlerts(userId: string) {
  const db = getDb();
  return db.select().from(jobAlerts).where(eq(jobAlerts.userId, userId)).orderBy(desc(jobAlerts.createdAt));
}

export async function createJobAlert(
  userId: string,
  data: { name: string; keywords?: string; location?: string; jobType?: string; frequency?: string }) {
  const db = getDb();
  const [row] = await db
    .insert(jobAlerts)
    .values({
      userId,
      name: data.name,
      keywords: data.keywords,
      location: data.location,
      jobType: data.jobType,
      frequency: data.frequency ?? "weekly",
    } as any)
    .returning();
  return row!;
}

export async function updateJobAlert(
  id: string,
  userId: string,
  data: Partial<{ name: string; keywords: string; location: string; frequency: string; isActive: boolean }>) {
  const db = getDb();
  const [row] = await db
    .update(jobAlerts)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(and(eq(jobAlerts.id, id), eq(jobAlerts.userId, userId)))
    .returning();
  return row ?? null;
}

export async function toggleJobAlert(id: string, userId: string) {
  const db = getDb();
  const [current] = await db
    .select({ isActive: jobAlerts.isActive })
    .from(jobAlerts)
    .where(and(eq(jobAlerts.id, id), eq(jobAlerts.userId, userId)))
    .limit(1);
  if (!current) return null;
  const [row] = await db
    .update(jobAlerts)
    .set({ isActive: !current.isActive, updatedAt: new Date() } as any)
    .where(and(eq(jobAlerts.id, id), eq(jobAlerts.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteJobAlert(id: string, userId: string,
  deps?: Partial<JobServiceDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  await db.delete(jobAlerts).where(and(eq(jobAlerts.id, id), eq(jobAlerts.userId, userId)));
}
