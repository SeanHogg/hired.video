/**
 * Pipeline share-link management — `/api/pipeline/share` (owner only).
 *
 *   GET    /share?jobId=     list a job's links
 *   POST   /share            create a link (body: jobId, label?, expiresAt?)
 *   DELETE /share/:linkId    revoke
 *
 * The anonymous portal read lives in ./public.ts. Persistence lives in
 * PipelineShareService.
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { requireJobOwner } from "../../services/jobs/jobOwnership.js";
import * as shareService from "../../services/pipeline/PipelineShareService.js";
import { validateJson } from "../helpers/validate.js";

export const pipelineShareRoutes = new Hono<AppEnv>();

const CreateShareSchema = z.object({
  jobId: UuidLikeSchema,
  label: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

pipelineShareRoutes.get("/", async (c) => {
  const jobId = c.req.query("jobId");
  if (!jobId) return c.json(error("VALIDATION_ERROR", "jobId is required"), 400);
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  return c.json(success({ links: await shareService.listShareLinks(jobId) }), 200);
});

pipelineShareRoutes.post("/", validateJson(CreateShareSchema, (e) => error("VALIDATION_ERROR", "Invalid share link", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const { denied } = await requireJobOwner(c, body.jobId);
  if (denied) return denied;

  const link = await shareService.createShareLink({
    jobId: body.jobId,
    label: body.label ? body.label.slice(0, 200) : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    createdByUserId: c.var.userId,
  });
  return c.json(success(link), 201);
});

pipelineShareRoutes.delete("/:linkId", async (c) => {
  const linkId = c.req.param("linkId");
  const jobId = await shareService.getShareLinkJobId(linkId);
  if (!jobId) return c.json(error("NOT_FOUND", "Share link not found"), 404);
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const removedId = await shareService.deleteShareLink(linkId);
  if (!removedId) return c.json(error("NOT_FOUND", "Share link not found"), 404);
  return c.json(success({ id: removedId }), 200);
});
