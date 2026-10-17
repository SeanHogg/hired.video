/** JobEntity read model + the single `job_items` row → DTO serializer. */
import { schema } from "../../db/index.js";
import type { JobSummaryDTO } from "../../../../shared/job.js";

const { jobItems } = schema;

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

export function rowToJob(row: typeof jobItems.$inferSelect): JobEntity {
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
