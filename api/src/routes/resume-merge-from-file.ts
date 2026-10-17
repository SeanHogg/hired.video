/**
 * POST /api/resumes/merge/from-file — an uploaded résumé analysed as a merge
 * source against a target résumé (stored id or inline content).
 *
 * Two request shapes:
 *   - JSON `{ text | parsedContent, targetResumeId | targetContent, useAI }` —
 *     the client already extracted text, or sends a pre-parsed JSON Resume.
 *   - multipart/form-data `file` (one or more; several = the pages of a
 *     rasterised scan) + `targetResumeId` | `targetContent` (JSON string) +
 *     `useAI` ("true"/"false") — the raw file, read on the server through the
 *     SAME upload intake as /parse and /createfromfile (PDF/DOCX extractor,
 *     image → vision OCR). Mobile clients use this when pdfjs can't read the
 *     file, and for photos/scans (#2228).
 *
 * Either way the text then passes the shared binary guard + JSON Resume
 * short-circuit (`classifyResumeText`) before AI parsing, and the result
 * feeds the existing merge analysis. The orchestration lives in
 * services/resume/mergeFromFile.ts; this route reads the request, applies
 * the shared vision-OCR `resume_parse` gate + meter (#2390) and shapes the
 * response.
 */
import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { buildMergeFromFileDeps } from "../services/resume/deps.js";
import {
  analyzeMergeFromFile,
  type MergeFromFileInput,
  type MergeSourceInput,
} from "../services/resume/mergeFromFile.js";
import { ocrResumeImage, parseResumeTextWithAI } from "./resume-parse.js";
import { gateUploadOcr } from "./resume-upload-ocr-gate.js";
import { fail, ok } from "../utils/response.js";
import { readFormFiles } from "../utils/multipart.js";

type Ctx = Context<AppEnv>;
type Content = Record<string, unknown>;

const MergeTargetFields = {
  targetResumeId: UuidLikeSchema.optional(),
  targetContent: z.record(z.string(), z.unknown()).optional(),
  useAI: z.boolean().optional().default(true),
};
const hasTarget = (d: { targetResumeId?: string; targetContent?: Content }) =>
  Boolean(d.targetResumeId || d.targetContent);
const TARGET_REQUIRED = { message: "Either targetResumeId or targetContent must be provided" };

const MergeFromFileJsonSchema = z
  .object({
    // Either `parsedContent` (pre-parsed JSON Resume, e.g. a .json upload
    // normalised client-side) OR raw `text` (client-extracted PDF/DOCX/TXT
    // text that still needs AI parsing). `parsedContent` skips the AI step.
    text: z.string().optional(),
    parsedContent: z.record(z.string(), z.unknown()).optional(),
    ...MergeTargetFields,
  })
  .refine((d) => (d.text && d.text.length > 0) || d.parsedContent, {
    message: "Either text or parsedContent must be provided",
  })
  .refine(hasTarget, TARGET_REQUIRED);

const MergeFromFileMultipartSchema = z.object(MergeTargetFields).refine(hasTarget, TARGET_REQUIRED);

export async function mergeFromFileHandler(c: Ctx): Promise<Response> {
  const input = await readMergeFromFileInput(c);
  if (input instanceof Response) return input;

  const files = input.source.kind === "files" ? input.source.files : [];
  const ocr = await gateUploadOcr(c, files, "merge_from_file");
  if (ocr.blocked) return ocr.blocked;

  const outcome = await analyzeMergeFromFile(
    c.var.user.sub,
    input,
    buildMergeFromFileDeps(c.env, c.var.user, {
      ocrImage: (image) => ocrResumeImage(c, image),
      parseText: (text) => parseResumeTextWithAI(c, text),
    }),
  );
  if ("error" in outcome) {
    const status = outcome.error.code === "NOT_FOUND" ? 404 : 422;
    return c.json(fail(outcome.error.code, outcome.error.message), status);
  }
  ocr.meter();
  return c.json(ok(outcome.result), 200);
}

/** JSON body or multipart upload → one validated input, or the 400 to return. */
async function readMergeFromFileInput(c: Ctx): Promise<MergeFromFileInput | Response> {
  if ((c.req.header("Content-Type") ?? "").includes("multipart/form-data")) {
    const { form, files } = await readFormFiles(c);
    if (!form || files.length === 0) return c.json(fail("VALIDATION_ERROR", "No file provided."), 400);
    const field = (name: string): string | undefined => {
      const value = form.get(name);
      return typeof value === "string" && value ? value : undefined;
    };
    const parsed = MergeFromFileMultipartSchema.safeParse({
      targetResumeId: field("targetResumeId"),
      targetContent: parseJsonField(field("targetContent")),
      useAI: field("useAI") !== "false",
    });
    if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
    return { source: { kind: "files", files }, ...parsed.data };
  }

  const parsed = MergeFromFileJsonSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  const { text, parsedContent, ...target } = parsed.data;
  const source: MergeSourceInput = parsedContent
    ? { kind: "parsed", content: parsedContent }
    : { kind: "text", text: text ?? "" };
  return { source, ...target };
}

/** A multipart JSON field; malformed JSON is passed through as the raw string so validation rejects it. */
function parseJsonField(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
