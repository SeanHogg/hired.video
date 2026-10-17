/**
 * /api/resume-versions — the master / version surface /build reviews use.
 * Thin adapter: every rule lives in services/resume/lineage.ts (where a
 * copy goes, staleness, write-back) and services/resume/from-job.ts
 * (create-from-a-job). Behind the global auth middleware.
 *
 *   GET  /:id/lineage     ★ master / version of ★ master / standalone, % different, stale
 *   POST /:id/versions    save content as a version of :id's master
 *   POST /:id/synced      a version took its master's content in
 *   POST /master/facts    write confirmed gap answers to the master
 *   POST /from-job        draft a résumé for a job from the master's evidence (nothing saved)
 *
 * Not cached: lineage is two primary-key reads + one indexed count, and
 * every résumé write would have to invalidate it — the cache would cost
 * more than the read.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { ok, fail, failFromDomainError, type HandlerResult } from "../handlers/shared.js";
import { ResumeContentSchema } from "../../../shared/resume.js";
import { ConfirmedFactSchema } from "../../../shared/resume-tailor.js";
import { FromJobRequestSchema } from "../../../shared/resume-from-job.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { checkTokenBudget } from "../middleware/tierEnforcement.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import {
  describeLineage,
  markVersionSynced,
  saveVersionOfMaster,
  writeFactsToMaster,
} from "../services/resume/lineage.js";
import { refreshDiffPercentFor } from "../services/resume/view.js";
import { draftResumeFromJob } from "../services/resume/from-job.js";
import { resolveJobForFit } from "../services/job/match-handlers.js";
import { aiDomainError } from "../services/job/tailor-handler.js";
import { logger } from "../lib/logger.js";

export const resumeVersionRoutes = new Hono<AppEnv>();

const send = (c: Context<AppEnv>, r: HandlerResult) => c.json(r.body as never, r.status as never);
const repo = () => buildRepos(getDb()).resumes;

const SaveVersionSchema = z.object({
  content: ResumeContentSchema.partial(),
  title: z.string().trim().max(250).optional(),
  description: z.string().max(500).optional(),
});

const FactsSchema = z.object({ facts: z.array(ConfirmedFactSchema).min(1).max(20) });

resumeVersionRoutes.post("/master/facts", async (c) => {
  const parsed = FactsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return send(c, fail(400, "VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()));
  const userId = c.var.user.sub;
  const outcome = await writeFactsToMaster(repo(), userId, parsed.data.facts);
  if (outcome.ok === false) {
    return outcome.code === "NO_MASTER"
      ? send(c, fail(404, "NO_MASTER", "You don't have a master résumé yet"))
      : send(c, fail(400, "VALIDATION_ERROR", "Invalid resume content", { issues: outcome.issues }));
  }
  if (outcome.changed) await refreshDiffPercentFor(repo(), userId, outcome.masterId);
  return send(c, ok({ masterId: outcome.masterId, changed: outcome.changed }));
});

resumeVersionRoutes.post("/from-job", async (c) => {
  const blocked = await servicesProcessor.enforce(c, "resume_tailor");
  if (blocked) return blocked;
  const limitError = await checkTokenBudget(c as never);
  if (limitError) return limitError;

  const parsed = FromJobRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return send(c, fail(400, "VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()));
  const env = (c.env as never) ?? {};
  if (!hasAnyLLMProviderKey(env)) return send(c, fail(503, "AI_ERROR", "AI unavailable: no LLM configured"));

  const userId = c.var.user.sub;
  const db = getDb();
  const llm = createLLMClient(env, c.var.user);
  const job = await resolveJobForFit({ db, now: () => new Date(), llm }, parsed.data);
  if (!job) return send(c, fail(404, "NOT_FOUND", "Job not found"));

  const sourceId = parsed.data.resumeId ?? (await repo().findMasterForOwner(userId))?.id;
  if (!sourceId) return send(c, fail(404, "NO_MASTER", "Add a résumé first — it is the evidence a job résumé is built from"));

  try {
    const outcome = await draftResumeFromJob(repo(), llm, userId, {
      job: job.parsedJob,
      sourceId,
      includeVersions: parsed.data.includeVersions,
    });
    if (outcome.ok === false) {
      return outcome.code === "NO_SOURCE"
        ? send(c, fail(404, "NOT_FOUND", "Resume not found"))
        : send(c, fail(422, "NO_REQUIREMENTS", "Couldn't read any requirements from that job post. Try pasting the full description."));
    }
    servicesProcessor.meterEvent(c, "resume_tailor");
    return send(c, ok(outcome.draft));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[resume-versions/from-job] LLM call failed", { error: message });
    const aiError = aiDomainError(err, message);
    return send(c, aiError ? failFromDomainError(aiError) : fail(502, "AI_ERROR", "Couldn't draft a résumé for that job. Please try again."));
  }
});

resumeVersionRoutes.get("/:id/lineage", async (c) => {
  const lineage = await describeLineage(repo(), c.var.user.sub, c.req.param("id"));
  return lineage ? send(c, ok(lineage)) : send(c, fail(404, "NOT_FOUND", "Resume not found"));
});

resumeVersionRoutes.post("/:id/versions", async (c) => {
  const parsed = SaveVersionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return send(c, fail(400, "VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()));
  const outcome = await saveVersionOfMaster(repo(), c.var.user.sub, c.req.param("id"), {
    content: parsed.data.content,
    title: parsed.data.title ?? null,
    description: parsed.data.description ?? null,
  });
  if (!outcome.ok) {
    return outcome.code === "NOT_FOUND"
      ? send(c, fail(404, "NOT_FOUND", "Resume not found"))
      : send(c, fail(400, "VALIDATION_ERROR", "Invalid resume content", { issues: outcome.issues }));
  }
  return send(c, ok({ resumeId: outcome.row!.id, title: outcome.row!.title, masterId: outcome.masterId }, 201));
});

resumeVersionRoutes.post("/:id/synced", async (c) => {
  const done = await markVersionSynced(repo(), c.var.user.sub, c.req.param("id"));
  return done ? send(c, ok({ synced: true })) : send(c, fail(404, "NOT_FOUND", "Version not found"));
});
