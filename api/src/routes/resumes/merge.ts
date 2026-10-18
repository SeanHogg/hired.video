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
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { liveResumes } from "../../services/resume/deps.js";
import { invalidResumeContent } from "../../services/resume/errors.js";
import { analyzeMerge } from "../../services/resume/merge.js";
import { MergeRunSchema, commitMerge, resolveMergeSide, runMerge, type MergeRunInput } from "../../services/resume/merge-flow.js";
import { mergeFromFileHandler } from "../resume-merge-from-file.js";
import { invalidResumeBodyHook, respond, type ResumeCtx } from "./shared.js";
import { validateJson } from "../helpers/validate.js";

export const resumeMergeRoutes = new Hono<AppEnv>();

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
  const resolved = await resolveMergeSide(liveResumes(), c.var.userId, which, ref);
  if ("which" in resolved) throw new DomainError(404, "NOT_FOUND", `${which} resume not found`);
  return resolved.content;
}

async function analyze(c: ResumeCtx, input: z.output<typeof MergeAnalyzeSchema>) {
  const { sourceResumeId, targetResumeId, targetContent, useAI } = input;
  if (sourceResumeId === targetResumeId) {
    throw new DomainError(400, "VALIDATION_ERROR", "Source and target must be different resumes");
  }
  const source = await side(c, "Source", { resumeId: sourceResumeId });
  const target = await side(c, "Target", { resumeId: targetResumeId, content: targetContent });
  const llm = useAI && hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, c.var.user) : null;
  const analysis = await analyzeMerge(source, target, llm, "resume_merge_analyze");
  return { analysis, sourceContent: source, targetContent: target };
}

async function preview(c: ResumeCtx, input: MergeRunInput) {
  const target = await side(c, "Target", { resumeId: input.targetResumeId, content: input.targetContent });
  const source = await side(c, "Source", { resumeId: input.sourceResumeId, content: input.sourceContent });
  return runMerge(target, source, input);
}

async function execute(c: ResumeCtx, input: MergeRunInput) {
  if (!input.targetResumeId) throw new DomainError(400, "VALIDATION_ERROR", "targetResumeId is required to save a merge");
  const target = await side(c, "Target", { resumeId: input.targetResumeId, content: input.targetContent });
  const source = await side(c, "Source", { resumeId: input.sourceResumeId, content: input.sourceContent });
  const { mergedContent, stats } = runMerge(target, source, input);
  const outcome = await commitMerge(liveResumes(), c.var.userId, {
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

const mergeAnalyzeBody = validateJson(MergeAnalyzeSchema, invalidResumeBodyHook, { emptyBody: null });
const mergeRunBody = validateJson(MergeRunSchema, invalidResumeBodyHook, { emptyBody: null });

resumeMergeRoutes.post("/merge/analyze", mergeAnalyzeBody, (c) => respond(c, analyze(c, c.req.valid("json"))));
resumeMergeRoutes.post("/merge/preview", mergeRunBody, (c) => respond(c, preview(c, c.req.valid("json"))));
resumeMergeRoutes.post("/merge/execute", mergeRunBody, async (c) => {
  try {
    const { created, data } = await execute(c, c.req.valid("json"));
    return respond(c, Promise.resolve(data), created ? 201 : 200);
  } catch (err) {
    return respond(c, Promise.reject(err));
  }
});
resumeMergeRoutes.post("/merge/from-file", mergeFromFileHandler);
