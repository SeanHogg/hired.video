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
   * Template descriptor for the PDF print window. Serialised into the print
   * URL (`?print=1&d=…`) so the print route renders the user's in-flight
   * template. The URL is the only reliable channel here: the print window is
   * opened with `noopener`, which gives it a *fresh* sessionStorage rather than
   * a copy of the opener's — so a sessionStorage stash would never reach it.
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
    const params = new URLSearchParams({ print: "1" });
    // Carry the in-flight descriptor in the URL — URLSearchParams percent-
    // encodes the JSON, and the print route reads it back via searchParams.
    if (descriptor) params.set("d", JSON.stringify(descriptor));
    await exportResumePdf(`/resumes/${id}?${params.toString()}`);
    return;
  }

  const resume = preloaded ?? (await resumeService.getResumeById(id));
  if (!resume) throw new Error(`Resume ${id} not found`);

  if (format === "word") exportResumeWord(resume);
  else if (format === "json") exportResumeJson(resume);
  else exportResumeText(resume);
}
