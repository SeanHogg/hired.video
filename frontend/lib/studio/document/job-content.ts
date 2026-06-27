/**
 * job-content — the bound CONTENT a `document` of `entityKind: "job"` edits on
 * the Studio canvas (#1914). A job is a FLAT record (unlike the resume's
 * JSON-Resume sections), so this is the single mapper between the API's job
 * shape and the canvas content object the field-bound section blocks
 * (`document-field-schema.ts` job schemas) read + write.
 *
 * Mirrors the field set the legacy `JobEditForm` mapped + submitted, so the
 * Studio editor is a drop-in replacement with no field regression: the editable
 * fields surface on the canvas; the rest (employmentType / seniority / industry
 * / dates / privacy) ride along untouched so a save never drops them.
 */
import {
  DisplayPrivacy,
  EmploymentType,
  JobStatus,
  WorkSetting,
} from "@/lib/constants/enums";
import { normalizeSeniority, type SeniorityLevel } from "@shared/seniority";

export interface JobDocumentContent {
  title: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  atsApplyUrl?: string;
  salary?: number;
  bonus?: number;
  equity?: number;
  // Passthrough publishing config — not surfaced on the canvas yet, preserved
  // verbatim so a save never wipes them (see gap register for the field-widget
  // follow-up).
  employmentType: number[];
  workSetting: number;
  /** Canonical lowercase seniority (`shared/seniority.ts` SSoT, #2090/#2218) —
   *  a STRING, not a numeric taxonomy. "" = not specified. The read DTO emits
   *  `experienceLevel` and the write schema accepts any spelling, so this rides
   *  through as the canonical value at both ends. */
  seniority?: SeniorityLevel | "";
  hiringTarget?: number;
  goLiveDate?: string;
  expirationDate?: string;
  status?: number;
  privacy_ShowJob: number;
  heroImageUrl?: string;
}

/** number → enum-key name reverse maps. The canvas stores enum FIELDS as the
 *  numeric `constants/enums.ts` value (the field schema is `numeric`), but the
 *  job UPDATE route (`shared/employment-types` / `work-settings` / status)
 *  expects a STRING it then normalizes — so the converter below emits the key
 *  name (e.g. 0 → "FullTime"), which every backend normalizer accepts. */
function reverseEnum(e: Record<string, number>): Record<number, string> {
  return Object.fromEntries(Object.entries(e).map(([k, v]) => [v, k]));
}
const EMPLOYMENT_TYPE_NAME = reverseEnum(EmploymentType);
const WORK_SETTING_NAME = reverseEnum(WorkSetting);
const JOB_STATUS_NAME = reverseEnum(JobStatus);

/** Map the API job (JobItemEntity shape from `getJobById`) into the canvas
 *  content object. Mirrors `JobEditForm`'s initialise-from-job mapping. */
export function jobItemToContent(job: Record<string, unknown>): JobDocumentContent {
  const num = (v: unknown): number | undefined =>
    typeof v === "number" ? v : undefined;
  const dateStr = (v: unknown): string =>
    typeof v === "string" && v ? new Date(v).toISOString().split("T")[0] : "";
  return {
    title: (job.title as string) || "",
    description: (job.description as string) || "",
    requirements: (job.requirements as string[]) || [],
    responsibilities: (job.responsibilities as string[]) || [],
    atsApplyUrl: (job.atsApplyUrl as string) || (job.applyUrl as string) || "",
    salary: num(job.salary) ?? num(job.salaryMin),
    bonus: num(job.bonus),
    equity: num(job.equity),
    employmentType: (job.employmentType as number[]) || [EmploymentType.FullTime],
    workSetting: num(job.workSetting) ?? WorkSetting.OnSite,
    // Read the canonical experience level the DTO actually emits
    // (`experienceLevel`), normalizing any legacy spelling to the SSoT value.
    seniority: normalizeSeniority(
      (job.experienceLevel as string) ?? (job.seniority as string),
    ) ?? "",
    hiringTarget: num(job.hiringTarget),
    goLiveDate: dateStr(job.goLiveDate),
    expirationDate: dateStr(job.expirationDate),
    status: num(job.status) ?? JobStatus.Draft,
    privacy_ShowJob: num(job.privacy_ShowJob) ?? DisplayPrivacy.ToPublic,
    heroImageUrl: (job.heroImageUrl as string) ?? "",
  };
}

/** The subset of canvas job content the job UPDATE route (`UpdateJobSchema`)
 *  actually accepts, in the SHAPE it expects: numeric enums converted to the
 *  string spellings the backend normalizers fold to canonical, and the canvas
 *  field names mapped to the route's (`atsApplyUrl` → `applyUrl`, `salary` →
 *  `salaryMin`). Before #2218 the raw numeric content was PUT verbatim, so the
 *  string-typed enum fields failed validation (400) and seniority — typed as a
 *  number against a string DTO field — silently dropped on every round-trip.
 *
 *  Fields the canvas exposes but the route has no column/schema for today
 *  (`bonus`, `equity`, `hiringTarget`, `goLiveDate`, `privacy_ShowJob`) are
 *  intentionally NOT sent — they're tracked as a follow-up in the gap register.
 */
export function contentToUpdateJob(
  content: JobDocumentContent,
): Record<string, unknown> {
  return {
    title: content.title,
    description: content.description,
    requirements: content.requirements,
    responsibilities: content.responsibilities,
    employmentType: content.employmentType
      .map((n) => EMPLOYMENT_TYPE_NAME[n])
      .filter(Boolean),
    workSetting: WORK_SETTING_NAME[content.workSetting],
    status: JOB_STATUS_NAME[content.status ?? JobStatus.Draft],
    // Canonical seniority string ("" → omit so the route doesn't null it).
    seniority: content.seniority || undefined,
    salaryMin: content.salary,
    applyUrl: content.atsApplyUrl || undefined,
    expirationDate: content.expirationDate || undefined,
    heroImageUrl: content.heroImageUrl || undefined,
  };
}

/** A blank job content for a brand-new job_doc draft (defaults match the legacy
 *  form's initial state). */
export function emptyJobContent(): JobDocumentContent {
  return jobItemToContent({});
}

/** Minimal create payload for the first save of a fresh job_doc draft — the
 *  strict `CreateJobSchema` only requires title + description; enum/publishing
 *  fields default server-side and are then editable via the update path. */
export function contentToCreateJob(content: JobDocumentContent): {
  title: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
} {
  return {
    title: content.title,
    description: content.description,
    requirements: content.requirements,
    responsibilities: content.responsibilities,
  };
}
