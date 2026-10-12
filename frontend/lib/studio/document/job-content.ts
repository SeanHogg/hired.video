/**
 * job-content — the bound CONTENT a `document` of `entityKind: "job"` edits on
 * the Studio canvas (#1914). A job is a FLAT record (unlike the resume's
 * JSON-Resume sections), so this is the single mapper between the API's job
 * shape and the canvas content object the field-bound section blocks
 * (`job-field-schema.ts`) read + write.
 *
 * Covers everything the retired JobEditForm AND JobCreatePage wrote (#1915):
 * the canvas fields, plus the inspector-edited attached studio video
 * (`videoProjectId`) and structured geo tags (`locations` → content_locations).
 * Employment type + seniority use the canonical string vocabularies
 * (shared/employment-types, shared/seniority), multi-select like the form —
 * incl. ContractToHire and the exec types as their own values.
 */
import { JobStatus, WorkSetting } from "@/lib/constants/enums";
import { normalizeSeniority, type SeniorityLevel } from "@shared/seniority";
import { normalizeEmploymentType, type EmploymentType } from "@shared/employment-types";
import type { ContentLocationSet } from "@shared/content-locations";

export interface JobDocumentContent {
  title: string;
  description: string;
  /** Hiring company name + free-text location. */
  company?: string;
  location?: string;
  requirements: string[];
  responsibilities: string[];
  atsApplyUrl?: string;
  /** Single annual salary figure — maps to `job_items.salary_min` on save. */
  salary?: number;
  /** Top of the range — `job_items.salary_max`. */
  salaryMax?: number;
  /** ISO currency code for the range ("" = the route default, USD). */
  currency?: string;
  /** Hybrid weekly split (#2069); persisted only for hybrid roles. */
  onsiteDaysPerWeek?: number;
  remoteDaysPerWeek?: number;
  /** AI-resilient sector slug (shared/sectors.ts); "" = not specified. */
  sector?: string;
  /** Canonical kebab employment types, multi-select. */
  employmentType: EmploymentType[];
  workSetting: number;
  /** Canonical seniority levels, multi-select. */
  seniority: SeniorityLevel[];
  expirationDate?: string;
  status?: number;
  heroImageUrl?: string;
  /** #743 — the attached studio video (job inspector picker). "" = none. */
  videoProjectId?: string;
  /** Structured geo tags (LocationPicker in the job inspector), written to
   *  content_locations after the job row saves. Undefined = not loaded /
   *  untouched (never overwrites the stored tags). */
  locations?: ContentLocationSet;
}

function reverseEnum(e: Record<string, number>): Record<number, string> {
  return Object.fromEntries(Object.entries(e).map(([k, v]) => [v, k]));
}
const WORK_SETTING_NAME = reverseEnum(WorkSetting);
const JOB_STATUS_NAME = reverseEnum(JobStatus);
/** Legacy numeric employment values (constants/enums EmploymentType) → names. */
const LEGACY_EMPLOYMENT_NAME = ["FullTime", "PartTime", "Contract", "Internship", "Temporary", "Freelance"];
const WORK_SETTING_BY_NAME: Record<string, number> = {
  onsite: WorkSetting.OnSite,
  remote: WorkSetting.Remote,
  hybrid: WorkSetting.Hybrid,
};

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** Any spelling / legacy number / single-or-array → canonical, deduped. */
export function toEmploymentTypes(v: unknown): EmploymentType[] {
  const out = asList(v)
    .map((x) => (typeof x === "number" ? LEGACY_EMPLOYMENT_NAME[x] : x))
    .map((x) => (typeof x === "string" ? normalizeEmploymentType(x) : null))
    .filter((x): x is EmploymentType => x !== null);
  return [...new Set(out)];
}

/** Any spelling / single-or-array → canonical seniority levels, deduped. */
export function toSeniorities(v: unknown): SeniorityLevel[] {
  const out = asList(v)
    .map((x) => (typeof x === "string" ? normalizeSeniority(x) : null))
    .filter((x): x is SeniorityLevel => x !== null);
  return [...new Set(out)];
}

function toWorkSetting(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return WORK_SETTING_BY_NAME[v.toLowerCase().replace(/[^a-z]/g, "")] ?? WorkSetting.OnSite;
  return WorkSetting.OnSite;
}

/** Map the API job (JobItemEntity shape from `getJobById`) into the canvas
 *  content object. */
export function jobItemToContent(job: Record<string, unknown>): JobDocumentContent {
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  const dateStr = (v: unknown): string =>
    typeof v === "string" && v ? new Date(v).toISOString().split("T")[0] : "";
  const types = toEmploymentTypes(job.employmentType);
  return {
    title: (job.title as string) || "",
    description: (job.description as string) || "",
    company: (job.company as string) || "",
    location: (job.location as string) || "",
    requirements: (job.requirements as string[]) || [],
    responsibilities: (job.responsibilities as string[]) || [],
    atsApplyUrl: (job.atsApplyUrl as string) || (job.applyUrl as string) || "",
    salary: num(job.salary) ?? num(job.salaryMin),
    salaryMax: num(job.salaryMax),
    currency: (job.salaryCurrency as string) || (job.currency as string) || "",
    onsiteDaysPerWeek: num(job.onsiteDaysPerWeek),
    remoteDaysPerWeek: num(job.remoteDaysPerWeek),
    sector: (job.sector as string) || "",
    employmentType: types.length > 0 ? types : ["full-time"],
    workSetting: toWorkSetting(job.workSetting),
    seniority: toSeniorities(job.experienceLevel ?? job.seniority),
    expirationDate: dateStr(job.expirationDate),
    // The read DTO (rowToJob) carries `isActive`, not a status: an active
    // posting reads as Open so a canvas save never silently unpublishes it.
    status: num(job.status) ?? (job.isActive === true ? JobStatus.Open : JobStatus.Draft),
    heroImageUrl: (job.heroImageUrl as string) ?? "",
    videoProjectId: (job.videoProjectId as string) || "",
  };
}

/** The job write payload (`CreateJobSchema` / `UpdateJobSchema` in
 *  api/src/routes/jobs.ts): canvas names mapped to the route's
 *  (`atsApplyUrl` → `applyUrl`, `salary` → `salaryMin`), numeric work setting /
 *  status as the names the route normalizes. Geo tags are not part of the job
 *  row — `persistDocumentEntity` writes them to content_locations. */
export function contentToUpdateJob(content: JobDocumentContent): Record<string, unknown> {
  const hybrid = content.workSetting === WorkSetting.Hybrid;
  return {
    title: content.title,
    description: content.description,
    company: content.company || undefined,
    location: content.location || undefined,
    requirements: content.requirements,
    responsibilities: content.responsibilities,
    employmentType: content.employmentType,
    workSetting: WORK_SETTING_NAME[content.workSetting],
    status: JOB_STATUS_NAME[content.status ?? JobStatus.Draft],
    seniority: content.seniority.length > 0 ? content.seniority : undefined,
    salaryMin: content.salary,
    salaryMax: content.salaryMax,
    currency: content.currency || undefined,
    // The route forces the split null for non-hybrid roles; send it only
    // when it applies so the payload stays honest (#2069).
    onsiteDaysPerWeek: hybrid ? content.onsiteDaysPerWeek : undefined,
    remoteDaysPerWeek: hybrid ? content.remoteDaysPerWeek : undefined,
    sector: content.sector || undefined,
    applyUrl: content.atsApplyUrl || undefined,
    expirationDate: content.expirationDate || undefined,
    heroImageUrl: content.heroImageUrl || undefined,
    // "" clears the attachment; undefined (never loaded) leaves it alone.
    videoProjectId: content.videoProjectId === undefined ? undefined : content.videoProjectId || null,
  };
}

/** A blank job content for a brand-new job_doc draft. */
export function emptyJobContent(): JobDocumentContent {
  return jobItemToContent({});
}

/** A job write payload: what `POST /api/jobs` needs (title + description)
 *  plus every other field the route accepts. */
export type JobWritePayload = { title: string; description: string } & Record<string, unknown>;

/** Create payload for the first save of a fresh job_doc draft — the same
 *  field set as an update (so a posting created on the canvas carries every
 *  field from its first save, as the retired JobCreatePage did), including its
 *  Draft status so it isn't published before the owner sets it Open. */
export function contentToCreateJob(content: JobDocumentContent): JobWritePayload {
  return { ...contentToUpdateJob(content), title: content.title, description: content.description };
}
