/**
 * POST /api/interview-assignments/generate — extract skills + LLM questions
 * in one shot (no DB write).
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { generateInterviewQuestions } from "../../services/interview/assignment-generation.js";
import { sendFailure } from "./shared.js";
import { success } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

const GenerateRequestSchema = z
  .object({
    resumeId: UuidLikeSchema.optional(),
    jobId: UuidLikeSchema.optional(),
    content: z.string().min(20).max(20_000).optional(),
    sourceType: z.enum(["job", "resume"]).optional(),
    targetRole: z.string().max(120).optional(),
    seniority: z.string().max(40).optional(),
    style: z.enum(["behavioral", "technical", "mixed"]).default("mixed"),
    count: z.number().int().min(3).max(10).default(5),
    sourceContext: z.enum(["tool", "ai-coach", "career-360", "pipeline"]).default("tool"),
  })
  .refine(
    (v) => Boolean(v.resumeId) || Boolean(v.jobId) || Boolean(v.content) || Boolean(v.targetRole),
    { message: "Provide resumeId, jobId, content, or targetRole" },
  );

export const interviewAssignmentGenerateRoutes = new Hono<AppEnv>();

interviewAssignmentGenerateRoutes.post("/generate", validateJson(GenerateRequestSchema, undefined, { emptyBody: null }), async (c) => {
  const user = c.var.user;
  requireUser(c);

  const body = c.req.valid("json");

  const result = await generateInterviewQuestions(c.env, user, body);
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data));
});
