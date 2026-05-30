// Single entry point for "download this resume as <format>".
//
// Any UI surface (ResumeDetail page, Resumes listing, action menus) should
// delegate here instead of reimplementing the dispatch. Centralising this
// keeps download-metric tracking, format routing, and data-loading in one
// place — add a new format or swap the analytics backend once, not N times.

import type { Resume } from "@/types/resume";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";
import { trackResumeDownload, type ResumeDownloadFormat } from "@/lib/analytics/resume-tracker";
import {
  exportResumeJson,
  exportResumePdf,
  exportResumeText,
  exportResumeWord,
} from "@/lib/resume-exporters";
import { resumeService } from "@/lib/services/resume-service";

export type { ResumeDownloadFormat };

export interface DownloadResumeOptions {
  id: string;
  format: ResumeDownloadFormat;
  /**
   * Already-loaded resume. If omitted (e.g. from a list row that doesn't hold
   * `data`), the helper fetches it. Ignored for PDF since the print window
   * renders the route directly.
   */
  preloaded?: Resume | null;
  /**
   * Template descriptor for the PDF print window. Stashed in sessionStorage
   * keyed by resume id so the print route can pick it up and honour the
   * user's in-flight edits.
   */
  descriptor?: ResumeTemplateDescriptor;
  /** Skip analytics — used for the sample resume and other non-owned reads. */
  skipTracking?: boolean;
}

export async function downloadResume({
  id,
  format,
  preloaded,
  descriptor,
  skipTracking,
}: DownloadResumeOptions): Promise<void> {
  if (!skipTracking) trackResumeDownload(id, format);

  if (format === "pdf") {
    if (descriptor) {
      try {
        sessionStorage.setItem(`resume-descriptor:${id}`, JSON.stringify(descriptor));
      } catch {
        // sessionStorage disabled/unavailable — print window falls back to defaults
      }
    }
    await exportResumePdf(`/resumes/${id}?print=1`);
    return;
  }

  const resume = preloaded ?? (await resumeService.getResumeById(id));
  if (!resume) throw new Error(`Resume ${id} not found`);

  if (format === "word") exportResumeWord(resume);
  else if (format === "json") exportResumeJson(resume);
  else exportResumeText(resume);
}
