/**
 * Résumé upload → plain TEXT (no AI structuring).
 *
 * The résumé-adjacent tools (roast, summarize, skill extractor, analysis
 * tools, sentiment, prompt editor, kit cover letter) consume text, not a
 * parsed JSON Resume. When the browser can't read a file itself — pdfjs fails
 * on many phones, and photos / scanned PDFs have no text layer — the client
 * uploads it to `POST /api/resumes/extract-text`, which runs this use case.
 *
 * It reuses the SAME intake as /parse and /merge/from-file (Workers-safe
 * PDF/DOCX extractor, vision OCR for images, page-ordered joins for a
 * rasterised scan) and the SAME binary guard (`classifyResumeText`), so the
 * routing rules never fork. The only model call is the injected OCR port.
 *
 * Pure of DB/HTTP — the route injects `ocrImage`.
 */
import {
  RESUME_BINARY_TEXT_MESSAGE,
  classifyResumeText,
  extractUploadedResumeFiles,
  isResumeImageFile,
  type UploadIntakeDeps,
} from "./uploadIntake.js";
import { resumeContentToText } from "./parse.js";

export type UploadTextResult = { kind: "text"; text: string } | { kind: "error"; message: string };

/** A JSON Resume rendered for text consumers — no truncation; the tools apply their own limits. */
function structuredToText(content: Record<string, unknown>): string {
  return resumeContentToText(content, Number.POSITIVE_INFINITY);
}

/** True when reading these uploads spends vision-OCR tokens (callers gate + meter on it). */
export function uploadsNeedOcr(files: readonly File[]): boolean {
  return files.some((f) => f instanceof File && isResumeImageFile(f));
}

/**
 * Uploaded file(s) → readable text, or a user-facing error. A JSON Resume
 * export (uploaded, or recognised in the extracted text) is rendered back to
 * plain text so every consumer gets the same shape.
 */
export async function extractResumeTextFromUploads(
  files: readonly File[],
  deps: Pick<UploadIntakeDeps, "ocrImage">,
): Promise<UploadTextResult> {
  const intake = await extractUploadedResumeFiles(files, deps);
  if (intake.kind === "error") return intake;
  if (intake.kind === "structured") return { kind: "text", text: structuredToText(intake.content) };

  const classified = classifyResumeText(intake.text);
  if (classified.kind === "binary") return { kind: "error", message: RESUME_BINARY_TEXT_MESSAGE };
  if (classified.kind === "structured") return { kind: "text", text: structuredToText(classified.content) };
  return { kind: "text", text: classified.text.trim() };
}
