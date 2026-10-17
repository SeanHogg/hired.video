// ── Job-draft mutation runner (writes through active-form-bridge) ──────────
//
// Unlike resume mutations — which persist via the API — job-draft writes
// land in the open job document's content in the studio (the canvas is the
// form, #1915). The document registers itself via `useActiveFormBridge`; the
// runner here just captures the args and the commit step calls `setValue`
// per field.

import { assertWritableField, fieldLabel, requireActiveForm } from "../active-form-bridge";
import { JOB_CREATE_FORM_ID } from "../form-ids";
import type { NormalizedToolRunResult, ToolRunContext } from "../types";

export type JobDraftFields = {
  title?: string;
  description?: string;
  company?: string;
  location?: string;
  responsibilities?: string;
  requirements?: string;
  employmentType?: string[];
  seniority?: string[];
  workSetting?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
};

/** Form id the studio's job document publishes via `useActiveFormBridge`
 *  (lib/tools/form-ids.ts is the single definition). */
export { JOB_CREATE_FORM_ID };

function pickJobDraftFields(args: Record<string, unknown>): JobDraftFields {
  const out: JobDraftFields = {};
  if (typeof args.title === "string") out.title = args.title;
  if (typeof args.description === "string") out.description = args.description;
  if (typeof args.company === "string") out.company = args.company;
  if (typeof args.location === "string") out.location = args.location;
  if (typeof args.responsibilities === "string") out.responsibilities = args.responsibilities;
  if (typeof args.requirements === "string") out.requirements = args.requirements;
  if (Array.isArray(args.employmentType)) {
    out.employmentType = args.employmentType.filter((v): v is string => typeof v === "string");
  }
  if (Array.isArray(args.seniority)) {
    out.seniority = args.seniority.filter((v): v is string => typeof v === "string");
  }
  if (typeof args.workSetting === "string") out.workSetting = args.workSetting;
  if (typeof args.salaryMin === "number") out.salaryMin = args.salaryMin;
  if (typeof args.salaryMax === "number") out.salaryMax = args.salaryMax;
  if (typeof args.currency === "string") out.currency = args.currency;
  return out;
}

const JOB_FIELD_LABELS: Record<keyof JobDraftFields, string> = {
  title: "Title",
  description: "Description",
  company: "Company",
  location: "Location",
  responsibilities: "Responsibilities",
  requirements: "Requirements",
  employmentType: "Employment type",
  seniority: "Seniority",
  workSetting: "Work setting",
  salaryMin: "Salary min",
  salaryMax: "Salary max",
  currency: "Currency",
};

function formatJobDraftPreview(fields: JobDraftFields): string {
  const lines: string[] = [];
  for (const key of Object.keys(fields) as (keyof JobDraftFields)[]) {
    const value = fields[key];
    if (value === undefined) continue;
    const label = JOB_FIELD_LABELS[key];
    if (Array.isArray(value)) {
      lines.push(`${label}: ${value.join(", ")}`);
    } else if (typeof value === "string" && value.length > 200) {
      lines.push(`${label}:\n${value}`);
    } else {
      lines.push(`${label}: ${String(value)}`);
    }
  }
  return lines.join("\n\n");
}

export async function runApplyJobDraft(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const fields = pickJobDraftFields(ctx.args);
  const provided = Object.keys(fields) as (keyof JobDraftFields)[];
  if (provided.length === 0) {
    throw new Error("apply_job_draft requires at least one field to set.");
  }

  // Validate every requested field against the page's writableFields
  // whitelist NOW (during run), so the model gets immediate feedback if
  // it picked an unknown field — instead of waiting for the user to hit
  // Apply.
  const handle = requireActiveForm(JOB_CREATE_FORM_ID);
  for (const key of provided) {
    assertWritableField(handle, key);
  }

  const summary =
    provided.length === 1
      ? `Update ${fieldLabel(handle, provided[0])} on the job posting.`
      : `Update ${provided.length} fields on the job posting.`;

  return {
    summary,
    previewText: formatJobDraftPreview(fields),
    mutation: { status: "pending", location: provided.join(", ") },
    raw: { kind: "apply_job_draft", formId: JOB_CREATE_FORM_ID, fields },
  };
}

/** Commit step: write each staged field into the open job form. */
export function commitJobDraft(formId: string, fields: JobDraftFields): string[] {
  const handle = requireActiveForm(formId);
  const provided = Object.keys(fields) as (keyof JobDraftFields)[];
  for (const key of provided) {
    assertWritableField(handle, key);
    handle.setValue(key, fields[key]);
  }
  return provided;
}
