/** Job posting writes: create (form + tracked/extension), update, delete,
 *  plus the single DTO → column patch mapping they share. */
import { and, eq, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { classifyJobSector } from "../../../../shared/sectors.js";
import { normalizeEmploymentType } from "../../../../shared/employment-types.js";
import { normalizeWorkSetting, normalizeHybridDays } from "../../../../shared/work-settings.js";
import { normalizeSeniority } from "../../../../shared/seniority.js";
import type { CreateJobDTO } from "../../../../shared/job.js";
import { normalizeJobUrl } from "../../../../shared/scraping/index.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { type JobServiceDeps, resolveDeps } from "./job-service-deps.js";
import { type JobEntity, rowToJob } from "./job-entity.js";
import { HIRED_VIDEO_SEED_COMPANY } from "./job-seed-company.js";

const { jobItems, savedJobs } = schema;

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
