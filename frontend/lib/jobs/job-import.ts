/**
 * Job import — the retired JobCreatePage's upload paths, brought into the
 * studio's job create step (#1915): a PDF / DOCX description, or a CSV / XLSX
 * file, is parsed by the SAME endpoint the form used
 * (`jobService.createJobFromFile` → `POST /api/Job/CreateFromFile`), and the
 * parsed posting becomes a DRAFT job the studio opens on the canvas. The CSV
 * template download is the form's, unchanged.
 *
 * Like the form, each file yields one posting (the endpoint extracts one job
 * per file); several files make several drafts.
 */
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { contentToCreateJob, jobItemToContent, type JobWritePayload } from "@/lib/studio/document/job-content";

/** What the create step's file input accepts (documents + spreadsheets). */
export const JOB_IMPORT_ACCEPT = ".pdf,.doc,.docx,.csv,.xlsx,.xls";

/** The form's sample CSV (header + two example rows). */
export const JOB_CSV_TEMPLATE = `Title,Description,Company,Location,Employment Type,Seniority,Work Setting,Responsibilities,Requirements
"Software Engineer","Develop and maintain software applications","Tech Corp","San Francisco, CA","FullTime","Mid","Onsite","Develop features\nWrite tests\nCode reviews","Bachelor's degree\n3+ years experience\nJavaScript knowledge"
"Product Manager","Lead product development and strategy","Innovation Inc","New York, NY","FullTime","Senior","Hybrid","Define product roadmap\nWork with stakeholders\nAnalyze metrics","MBA preferred\n5+ years PM experience\nAgile methodology"`;

export const JOB_CSV_TEMPLATE_FILENAME = "job_template.csv";

/** Download the sample CSV (browser only). */
export function downloadJobCsvTemplate(): void {
  const blob = new Blob([JOB_CSV_TEMPLATE], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = JOB_CSV_TEMPLATE_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/** A parsed posting → the DRAFT the studio opens. Always a Draft: an import
 *  is never published before the owner reviews it on the canvas. Pure. */
export function parsedJobToDraft(parsed: JobSummary, fallbackTitle: string): JobWritePayload {
  const content = jobItemToContent(parsed as unknown as Record<string, unknown>);
  const title = content.title.trim() || fallbackTitle;
  return { ...contentToCreateJob({ ...content, title }), title, status: "Draft" };
}

/** File name without its extension — the title when the parse found none. */
function baseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, "") || file.name;
}

export interface JobImportResult {
  /** New draft job ids, in file order. */
  created: string[];
  /** Files that couldn't be parsed or saved. */
  failed: string[];
}

/** Parse each file and create a draft posting from it. One bad file never
 *  stops the rest. */
export async function importJobFiles(files: readonly File[]): Promise<JobImportResult> {
  const result: JobImportResult = { created: [], failed: [] };
  for (const file of files) {
    try {
      const parsed = await jobService.createJobFromFile(file);
      const draft = parsedJobToDraft(parsed, baseName(file));
      if (!draft.description.trim()) throw new Error("empty description");
      const created = await jobService.createJob(draft);
      result.created.push(created.id);
    } catch {
      result.failed.push(file.name);
    }
  }
  return result;
}
