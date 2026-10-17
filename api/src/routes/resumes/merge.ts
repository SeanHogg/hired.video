/**
 * /api/resumes/merge — logic in services/resume/merge-flow.ts; either side
 * may be a stored résumé or inline content (/build merges into the page).
 *
 *   POST /merge/analyze     { sourceResumeId, targetResumeId | targetContent, useAI? }
 *   POST /merge/preview     the merged document, nothing saved
 *   POST /merge/execute     commit onto a stored target (in place, or `createNew`)
 *   POST /merge/from-file   upload → analysis against a target
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { DomainError } from "../../domains/errors.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { invalidResumeBody, invalidResumeContent } from "../../services/resume/errors.js";
import { analyzeMerge } from "../../services/resume/merge.js";
import { MergeRunSchema, commitMerge, resolveMergeSide, runMerge, type MergeRunInput } from "../../services/resume/merge-flow.js";
import { mergeFromFileHandler } from "../resume-merge-from-file.js";
import { ownerId, respond, type ResumeCtx } from "./shared.js";

export const resumeMergeRoutes = new Hono<AppEnv>();

const repo = () => buildRepos(getDb()).resumes;

const MergeAnalyzeSchema = z
  .object({
    sourceResumeId: UuidLikeSchema,
    targetResumeId: UuidLikeSchema.optional(),
    targetContent: z.record(z.string(), z.unknown()).optional(),
    useAI: z.boolean().optional().default(true),
  })
  .refine((d) => d.targetResumeId || d.targetContent, { message: "Either targetResumeId or targetContent must be provided" });

/** Content of one merge side, or a 404 naming which side is missing. */
async function side(c: ResumeCtx, which: "Source" | "Target", ref: { resumeId?: string; content?: Record<string, unknown> }) {
  const resolved = await resolveMergeSide(repo(), ownerId(c), which, ref);
  if ("which" in resolved) throw new DomainError(404, "NOT_FOUND", `${which} resume not found`);
  return resolved.content;
}

async function analyze(c: ResumeCtx) {
  const parsed = MergeAnalyzeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw invalidResumeBody(parsed.error.flatten());
  const { sourceResumeId, targetResumeId, targetContent, useAI } = parsed.data;
  if (sourceResumeId === targetResumeId) {
    throw new DomainError(400, "VALIDATION_ERROR", "Source and target must be different resumes");
  }
  const source = await side(c, "Source", { resumeId: sourceResumeId });
  const target = await side(c, "Target", { resumeId: targetResumeId, content: targetContent });
  const llm = useAI && hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, c.var.user) : null;
  const analysis = await analyzeMerge(source, target, llm, "resume_merge_analyze");
  return { analysis, sourceContent: source, targetContent: target };
}

async function runInput(c: ResumeCtx): Promise<MergeRunInput> {
  const parsed = MergeRunSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw invalidResumeBody(parsed.error.flatten());
  return parsed.data;
}

async function preview(c: ResumeCtx) {
  const input = await runInput(c);
  const target = await side(c, "Target", { resumeId: input.targetResumeId, content: input.targetContent });
  const source = await side(c, "Source", { resumeId: input.sourceResumeId, content: input.sourceContent });
  return runMerge(target, source, input);
}

async function execute(c: ResumeCtx) {
  const input = await runInput(c);
  if (!input.targetResumeId) throw new DomainError(400, "VALIDATION_ERROR", "targetResumeId is required to save a merge");
  const target = await side(c, "Target", { resumeId: input.targetResumeId, content: input.targetContent });
  const source = await side(c, "Source", { resumeId: input.sourceResumeId, content: input.sourceContent });
  const { mergedContent, stats } = runMerge(target, source, input);
  const outcome = await commitMerge(repo(), ownerId(c), {
    targetResumeId: input.targetResumeId,
    merged: mergedContent,
    createNew: input.createNew ?? false,
    newTitle: input.newTitle,
  });
  // `in` narrowing — the API compiles with `strict: false`.
  if ("code" in outcome) {
    if (outcome.code === "NOT_FOUND") throw new DomainError(404, "NOT_FOUND", "Target resume not found");
    throw invalidResumeContent(outcome.issues);
  }
  return { created: outcome.created, data: { resumeId: outcome.resumeId, title: outcome.title, ...stats } };
}

resumeMergeRoutes.post("/merge/analyze", (c) => respond(c, analyze(c)));
resumeMergeRoutes.post("/merge/preview", (c) => respond(c, preview(c)));
resumeMergeRoutes.post("/merge/execute", async (c) => {
  try {
    const { created, data } = await execute(c);
    return respond(c, Promise.resolve(data), created ? 201 : 200);
  } catch (err) {
    return respond(c, Promise.reject(err));
  }
});
resumeMergeRoutes.post("/merge/from-file", mergeFromFileHandler);
