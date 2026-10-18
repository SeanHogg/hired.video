/**
 * Job ingest endpoints — content → tracked job (use cases in
 * services/jobs/jobIngest.ts):
 *
 *   POST /createfromfile   multipart or JSON upload of a JD
 *   POST /extract          Chrome-extension page capture (dedup-aware)
 *   POST /:id/refresh      backfill missing fields on a tracked job
 *
 * Markdown-first description: the extractor converts whatever input (HTML,
 * PDF-extracted text, plain text) into Markdown before storing, so the
 * frontend can render formatted job descriptions consistently.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { attachTokenBudget } from "../../middleware/tierEnforcement.js";
import { createJobFromFile, extractJobFromPage, refreshTrackedJob } from "../../services/jobs/jobIngest.js";
import { extractCreateFromFilePayload } from "./payload.js";
import { llmFor } from "./http.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const jobIngestRoutes = new Hono<AppEnv>();

/** POST /api/jobs/createfromfile — runs the upload through the same
 *  extractAndClassifyJob + createTrackedJob pipeline the browser-extension
 *  ingress uses. */
jobIngestRoutes.post("/createfromfile", async (c) => {
  const userId = requireUser(c);
  const payload = await extractCreateFromFilePayload(c);
  const created = await createJobFromFile(payload, userId, llmFor(c));
  return c.json(success(created), 201);
});

/** POST /api/jobs/extract — track a job from a webpage. The extension sends
 *  `{ url, html, sourceUrl?, force?, track?, hintTitle?, hintCompany?, hintLocation? }`. */
jobIngestRoutes.post("/extract", attachTokenBudget(), async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => null);
  const url: string = typeof body?.url === "string" ? body.url : "";
  const trackParam = c.req.query("track");
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  const { status, data } = await extractJobFromPage({
    userId,
    html: typeof body?.html === "string" ? body.html : "",
    sourceUrl: typeof body?.sourceUrl === "string" ? body.sourceUrl : url,
    track: body?.track === false ? false : trackParam === "false" ? false : true,
    force: body?.force === true,
    hintTitle: str(body?.hintTitle),
    hintCompany: str(body?.hintCompany),
    hintLocation: str(body?.hintLocation),
    llm: llmFor(c),
  });
  return c.json(success(data), status);
});

/** POST /api/jobs/:id/refresh — backfill missing fields from posted HTML.
 *  `missingFields` (optional) is a strict allow-list; absent = fill any null. */
jobIngestRoutes.post("/:id/refresh", attachTokenBudget(), async (c) => {
  const userId = requireUser(c);

  const jobId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const html: string = typeof body?.html === "string" ? body.html : "";
  const url: string = typeof body?.url === "string" ? body.url : "";
  const missingFields: string[] | null = Array.isArray(body?.missingFields)
    ? body.missingFields.filter((f: unknown) => typeof f === "string")
    : null;
  if (!html) return c.json(error("VALIDATION_ERROR", "html is required"), 400);

  const data = await refreshTrackedJob({ userId, jobId, html, url, missingFields, llm: llmFor(c) });
  return c.json(success(data), 200);
});
