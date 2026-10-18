/**
 * POST /api/resumes/extract-text — uploaded résumé file(s) → `{ text }`.
 *
 * multipart/form-data, one or more `file` parts (several = the pages of a
 * rasterised scan, joined in order). Text only: PDF/DOCX/TXT go through the
 * Workers-safe extractor, images through vision OCR, and the result passes
 * the shared binary guard. No AI structuring — tools that need a parsed JSON
 * Resume use /api/resumes/parse instead.
 *
 * Optional-auth (app.ts RESUME_PARSE_ROUTE) because the résumé tools run for
 * signed-out visitors too (Resume Roast, the kit drop zone): anonymous
 * callers are IP-capped by the same limiter as /parse (mounted in
 * resumes.ts). Vision OCR is the only token spend, so only an upload that
 * needs it is gated + metered against the `resume_parse` entitlement, the
 * same budget /parse charges for OCR; a plain document read is free.
 */
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { extractResumeTextFromUploads } from "../services/resume/uploadText.js";
import { ocrResumeImage } from "./resume-parse.js";
import { gateUploadOcr } from "./resume-upload-ocr-gate.js";
import { readFormFiles } from "../utils/multipart.js";
import { success, error } from "../types/index.js";

export async function resumeExtractTextHandler(c: Context<AppEnv>): Promise<Response> {
  if (!(c.req.header("Content-Type") ?? "").includes("multipart/form-data")) {
    return c.json(error("VALIDATION_ERROR", "Upload the file as multipart/form-data under `file`."), 400);
  }
  const { files } = await readFormFiles(c);
  if (files.length === 0) return c.json(error("VALIDATION_ERROR", "No file provided."), 400);

  const ocr = await gateUploadOcr(c, files, "extract_text");
  if (ocr.blocked) return ocr.blocked;

  const result = await extractResumeTextFromUploads(files, { ocrImage: (image) => ocrResumeImage(c, image) });
  if (result.kind === "error") return c.json(error("EXTRACT_FAILED", result.message), 422);

  ocr.meter();
  return c.json(success({ text: result.text }), 200);
}
