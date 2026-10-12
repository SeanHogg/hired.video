/**
 * Résumé upload payload — ONE decision for how a picked file reaches the API.
 *
 * Shared by every résumé upload transport (`/api/resumes/parse` via
 * `resumeService.buildParseRequest`, `/api/resumes/merge/from-file` via
 * `resumeService.analyzeFileMerge`) so the routing rules live once:
 *   1. JSON Resume export → `structured` (exact, no AI roundtrip).
 *   2. Image (phone photo / scan) → `files` (HEIC re-encoded to JPEG, big
 *      photos downscaled); the server runs vision OCR.
 *   3. PDF/DOCX/text → fast client-side extraction; usable text → `text`.
 *   4. PDF with no text layer (a scan) → rasterise its pages here and upload
 *      them as images (`files`), so the server's vision OCR reads them.
 *   5. Anything else → `files` with the raw file, so the server's extractor +
 *      binary guard handles it.
 *
 * The mobile fix: when client pdfjs extraction fails (common on phones) we
 * NEVER send empty/garbage text — we upload the raw file instead.
 */
import {
  extractTextFromFile,
  parseJsonResumeFile,
  isResumeImageFile,
  isUsableResumeText,
} from "@/lib/extract-text";
import { isPdfFile, rasterizePdfToImages } from "@/lib/pdf-raster";
import { prepareResumeImage } from "@/lib/resume/prepare-resume-image";

export type ResumeUploadPayload =
  | { kind: "structured"; content: Record<string, unknown> }
  | { kind: "text"; text: string }
  /** Several entries are the pages of ONE document (a rasterised scan). */
  | { kind: "files"; files: File[] };

export async function resolveResumeUploadPayload(file: File): Promise<ResumeUploadPayload> {
  const jsonResume = await parseJsonResumeFile(file);
  if (jsonResume) return { kind: "structured", content: jsonResume };

  // HEIC → JPEG and oversize photos downscaled in the browser (#2230).
  if (isResumeImageFile(file)) return { kind: "files", files: [await prepareResumeImage(file)] };

  let text = "";
  try {
    text = await extractTextFromFile(file);
  } catch {
    text = "";
  }
  if (isUsableResumeText(text)) return { kind: "text", text };

  // No text layer: a scanned PDF. Render its pages to images here (the
  // Workers runtime has no canvas) so the server's vision OCR can read them.
  if (isPdfFile(file)) {
    const pages = await rasterizePdfToImages(file);
    if (pages.length > 0) return { kind: "files", files: pages };
  }
  // Client extraction failed / produced binary → let the server extract.
  return { kind: "files", files: [file] };
}

/** Multipart body with every file under the `file` field, in page order. */
export function resumeFilesFormData(files: readonly File[]): FormData {
  const fd = new FormData();
  for (const f of files) fd.append("file", f, f.name);
  return fd;
}
