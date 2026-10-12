/**
 * Résumé file → plain TEXT — the ONE read every text-consuming résumé tool
 * uses (Roast, Summarize, PDF→JSON, skill extractor, analysis tools,
 * sentiment, prompt editor, the kit's cover letter).
 *
 * Built on the shared upload decision (`resolveResumeUploadPayload`, #2228):
 *   - usable client-extracted text → returned as is (no network);
 *   - a JSON Resume export → rendered to readable plain text;
 *   - photos, scanned PDFs (rasterised pages) and files the browser can't
 *     read (pdfjs often fails on phones) → `POST /api/resumes/extract-text`,
 *     which runs the server extractor / vision OCR and returns `{ text }`.
 *
 * Resolves "" when the file genuinely has no readable text (the server's
 * EXTRACT_FAILED), so callers keep their own localized "couldn't read"
 * message; any other failure (network, quota, rate limit) rejects.
 */
import { z } from "zod";
import { ResumeContentSchema } from "@shared/resume";
import { apiClient } from "@/lib/api-client";
import { apiServerErrorCode } from "@/lib/api-error-code";
import { RESUME_FILE_ACCEPT, isAcceptedResumeFile } from "@/lib/build-entry";
import { resumeToPlainText } from "@/lib/resume-exporters";
import { resolveResumeUploadPayload, resumeFilesFormData } from "./resume-upload-payload";

/** `accept` for text-reading résumé tools: PDF, Word, text, Markdown, JSON Resume, photos. */
export const RESUME_TEXT_FILE_ACCEPT = `${RESUME_FILE_ACCEPT},.json`;

/** True when a picked / dropped file can be read by `getResumeTextFromFile`. */
export function isResumeTextFile(file: Pick<File, "name" | "type">): boolean {
  if (isAcceptedResumeFile(file)) return true;
  return file.type === "application/json" || file.name.toLowerCase().endsWith(".json");
}

const ExtractTextResponseSchema = z.object({ text: z.string() });

/** A JSON Resume rendered for text consumers; content that isn't a valid résumé shape stays readable JSON. */
function structuredResumeToText(content: Record<string, unknown>): string {
  const parsed = ResumeContentSchema.safeParse(content);
  return parsed.success ? resumeToPlainText(parsed.data) : JSON.stringify(content, null, 2);
}

export async function getResumeTextFromFile(file: File): Promise<string> {
  const payload = await resolveResumeUploadPayload(file);
  if (payload.kind === "text") return payload.text;
  if (payload.kind === "structured") return structuredResumeToText(payload.content);

  try {
    const { data } = await apiClient.request(
      "/api/resumes/extract-text",
      // Multi-page OCR can exceed the 30s default.
      { method: "POST", body: resumeFilesFormData(payload.files), timeout: 120_000 },
      ExtractTextResponseSchema,
    );
    return data.text;
  } catch (err) {
    if (apiServerErrorCode(err) === "EXTRACT_FAILED") return "";
    throw err;
  }
}
