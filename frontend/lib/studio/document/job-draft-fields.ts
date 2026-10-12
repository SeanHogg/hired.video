/**
 * The AI coach's job-draft fields (`apply_job_draft`, lib/tools/registry.ts)
 * ⇄ the studio job document's content (`JobDocumentContent`). The tool speaks
 * the vocabulary of the retired JobCreatePage form (string enums, one
 * responsibility per line, salaryMin / salaryMax); this module is the single
 * translation so the coach writes straight onto the canvas (#1915). Pure.
 */
import { WorkSetting } from "@/lib/constants/enums";
import { emptyJobContent, toEmploymentTypes, toSeniorities, type JobDocumentContent } from "./job-content";

/** Fields the coach may write — the same whitelist the form exposed. */
export const JOB_DRAFT_WRITABLE_FIELDS = [
  "title",
  "description",
  "company",
  "location",
  "responsibilities",
  "requirements",
  "employmentType",
  "seniority",
  "workSetting",
  "salaryMin",
  "salaryMax",
  "currency",
] as const;
export type JobDraftField = (typeof JOB_DRAFT_WRITABLE_FIELDS)[number];

const WORK_SETTING_BY_NAME: Record<string, number> = {
  onsite: WorkSetting.OnSite,
  remote: WorkSetting.Remote,
  hybrid: WorkSetting.Hybrid,
};

const key = (v: string): string => v.toLowerCase().replace(/[^a-z]/g, "");
const lines = (v: unknown): string[] =>
  typeof v === "string" ? v.split("\n").map((l) => l.trim()).filter(Boolean) : [];
const asNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** The live content as the form-shaped snapshot the coach reads. */
export function jobContentToDraftValues(content: JobDocumentContent | null): Record<JobDraftField, unknown> {
  const c = content ?? emptyJobContent();
  return {
    title: c.title,
    description: c.description,
    company: c.company ?? "",
    location: c.location ?? "",
    responsibilities: c.responsibilities.join("\n"),
    requirements: c.requirements.join("\n"),
    employmentType: c.employmentType,
    seniority: c.seniority,
    workSetting: c.workSetting,
    salaryMin: c.salary,
    salaryMax: c.salaryMax,
    currency: c.currency ?? "",
  };
}

/** Write one coach field into the content; an unusable value is a no-op. */
export function applyJobDraftField(
  content: JobDocumentContent | null,
  field: string,
  value: unknown,
): JobDocumentContent {
  const c = content ?? emptyJobContent();
  const text = typeof value === "string" ? value : undefined;
  switch (field as JobDraftField) {
    case "title":
      return text === undefined ? c : { ...c, title: text };
    case "description":
      return text === undefined ? c : { ...c, description: text };
    case "company":
      return text === undefined ? c : { ...c, company: text };
    case "location":
      return text === undefined ? c : { ...c, location: text };
    case "currency":
      return text === undefined ? c : { ...c, currency: text };
    case "responsibilities":
      return text === undefined ? c : { ...c, responsibilities: lines(text) };
    case "requirements":
      return text === undefined ? c : { ...c, requirements: lines(text) };
    case "employmentType": {
      // Any spelling (FullTime, ContractToHire, BoardSeat …) → canonical.
      const types = toEmploymentTypes(value);
      return types.length > 0 ? { ...c, employmentType: types } : c;
    }
    case "seniority": {
      const levels = toSeniorities(value);
      return levels.length > 0 ? { ...c, seniority: levels } : c;
    }
    case "workSetting": {
      const setting = typeof value === "string" ? WORK_SETTING_BY_NAME[key(value)] : undefined;
      return setting === undefined ? c : { ...c, workSetting: setting };
    }
    case "salaryMin": {
      const n = asNumber(value);
      return n === undefined ? c : { ...c, salary: n };
    }
    case "salaryMax": {
      const n = asNumber(value);
      return n === undefined ? c : { ...c, salaryMax: n };
    }
    default:
      return c;
  }
}
