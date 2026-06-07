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
  seniority?: number;
  industry: number[];
  hiringTarget?: number;
  goLiveDate?: string;
  expirationDate?: string;
  status?: number;
  privacy_ShowJob: number;
  heroImageUrl?: string;
}

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
    atsApplyUrl: (job.atsApplyUrl as string) || "",
    salary: num(job.salary),
    bonus: num(job.bonus),
    equity: num(job.equity),
    employmentType: (job.employmentType as number[]) || [EmploymentType.FullTime],
    workSetting: num(job.workSetting) ?? WorkSetting.OnSite,
    seniority: num(job.seniority),
    industry: (job.industry as number[]) || [],
    hiringTarget: num(job.hiringTarget),
    goLiveDate: dateStr(job.goLiveDate),
    expirationDate: dateStr(job.expirationDate),
    status: num(job.status) ?? JobStatus.Draft,
    privacy_ShowJob: num(job.privacy_ShowJob) ?? DisplayPrivacy.ToPublic,
    heroImageUrl: (job.heroImageUrl as string) ?? "",
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
