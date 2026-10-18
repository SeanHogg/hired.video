/**
 * POST /api/resumes — every way a résumé is created, dispatched by `source`
 * through one registry (shared/resume-create.ts):
 *
 *   blank     { title?, content?, rawText?, slug?, status?, privacy?, isMaster? }
 *   file      multipart `file` entries (several = one scan's pages)
 *   text      { text, title? }                       (Chrome extension / paste)
 *   clone     { sourceId }
 *   variation { sourceId, content?, title?, description?, resumeData? } → + masterId
 *   job       { jobHtml | jobId, resumeId?, includeVersions? } → draft, NOT saved (200)
 *
 * Was: POST /, /save, /createfromfile, /createfromtext, /:id/clone,
 * /:id/createvariation, /api/resume-versions/:id/versions and /from-job.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { ResumeCreateSourceSchema, TextResumeRequestSchema, type ResumeCreateSource } from "../../../../shared/resume-create.js";
import { DomainError } from "../../domains/errors.js";
import { servicesProcessor } from "../../domains/services-processing/index.js";
import { checkTokenBudget } from "../../middleware/tierEnforcement.js";
import { hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { cloneResume, createBlankResume, createFromText, createFromUpload, createVariation } from "../../services/resume/create.js";
import { buildFromJobDeps } from "../../services/resume/deps.js";
import { invalidResumeBody } from "../../services/resume/errors.js";
import { draftFromJobRequest } from "../../services/resume/from-job-request.js";
import {
  RESUME_BINARY_TEXT_MESSAGE,
  classifyResumeText,
  expandScannedPdfUploads,
  extractUploadedResumeFiles,
} from "../../services/resume/uploadIntake.js";
import { readFormFiles } from "../../utils/multipart.js";
import { ocrResumeImage } from "../resume-parse.js";
import { gateUploadOcr } from "../resume-upload-ocr-gate.js";
import { failWith, respond, resumeDeps, type ResumeCtx } from "./shared.js";

export const resumeCreateRoutes = new Hono<AppEnv>();

type CreateHandler = (c: ResumeCtx, body: Record<string, unknown>) => Promise<Response>;

/** Multipart upload: shared intake (JSON Resume, PDF, DOCX, text, images).
 *  Scanned PDFs unpack to page JPEGs BEFORE the OCR gate so an extension
 *  bytes upload is metered like a browser raster (#2308, #2390). */
const createFromFile: CreateHandler = async (c) => {
  const { files } = await readFormFiles(c);
  if (files.length === 0) return failWith(c, new DomainError(422, "VALIDATION_ERROR", "No file provided."));

  const expanded = await expandScannedPdfUploads(files);
  const ocr = await gateUploadOcr(c, expanded, "createfromfile");
  if (ocr.blocked) return ocr.blocked;

  const intake = await extractUploadedResumeFiles(expanded, { ocrImage: (image) => ocrResumeImage(c, image) });
  if (intake.kind === "error") return failWith(c, new DomainError(422, "PARSE_FAILED", intake.message));

  let structured = intake.kind === "structured" ? intake.content : null;
  let text = "";
  if (!structured && intake.kind === "text" && intake.text) {
    // Same binary guard + JSON Resume short-circuit as /parse and /merge/from-file.
    const source = classifyResumeText(intake.text);
    if (source.kind === "binary") {
      return failWith(c, new DomainError(422, "INVALID_RESUME_TEXT", RESUME_BINARY_TEXT_MESSAGE));
    }
    if (source.kind === "structured") structured = source.content;
    else text = source.text;
  }

  const response = await respond(c, createFromUpload(resumeDeps(c), c.var.userId, { structured, text, filename: files[0].name }), 201);
  if (response.status === 201) ocr.meter();
  return response;
};

const createFromJob: CreateHandler = async (c, body) => {
  const blocked = await servicesProcessor.enforce(c, "resume_tailor");
  if (blocked) return blocked;
  const overBudget = await checkTokenBudget(c);
  if (overBudget) return overBudget;
  if (!hasAnyLLMProviderKey(c.env)) {
    return failWith(c, new DomainError(503, "AI_ERROR", "AI unavailable: no LLM configured"));
  }
  const draft = draftFromJobRequest(
    buildFromJobDeps(c.env, c.var.user),
    c.var.userId,
    body,
  ).then((d) => {
    servicesProcessor.meterEvent(c, "resume_tailor");
    return d;
  });
  return respond(c, draft);
};

const CREATE_SOURCES: Record<ResumeCreateSource, CreateHandler> = {
  blank: (c, body) => respond(c, createBlankResume(resumeDeps(c), c.var.userId, body), 201),
  file: createFromFile,
  text: async (c, body) => {
    const parsed = TextResumeRequestSchema.safeParse(body);
    if (!parsed.success) return failWith(c, invalidResumeBody(parsed.error.flatten()));
    return respond(c, createFromText(resumeDeps(c), c.var.userId, parsed.data), 201);
  },
  clone: (c, body) => respond(c, cloneResume(resumeDeps(c), c.var.userId, body), 201),
  variation: (c, body) => respond(c, createVariation(resumeDeps(c), c.var.userId, body), 201),
  job: createFromJob,
};

function isMultipart(c: ResumeCtx): boolean {
  return (c.req.header("content-type") ?? "").toLowerCase().includes("multipart/form-data");
}

resumeCreateRoutes.post("/", async (c) => {
  if (isMultipart(c)) return CREATE_SOURCES.file(c, {});
  const raw: unknown = await c.req.json().catch(() => null);
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const source = ResumeCreateSourceSchema.safeParse(body.source ?? "blank");
  if (!source.success) return failWith(c, invalidResumeBody(source.error.flatten()));
  return CREATE_SOURCES[source.data](c, body);
});
