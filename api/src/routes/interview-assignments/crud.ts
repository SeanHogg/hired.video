/**
 * Assignment CRUD + candidate answering:
 *   POST /assign        — create assignment + send magic link (recruiter-side)
 *   POST /:id/resend    — regenerate token + re-send email (creator)
 *   GET  /mine          — interviews I created + interviews assigned to me
 *   GET  /:id           — full record (creator OR assigned candidate)
 *   POST /:id/respond   — submit one answer (text OR video)
 *   POST /:id/submit    — mark all responses submitted
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import {
  assignInterview,
  getInterviewDetail,
  listMyInterviews,
  recordInterviewAnswer,
  resendInterviewInvite,
  submitInterview,
} from "../../services/interview/assignment-lifecycle.js";
import { canAssign, sendFailure } from "./shared.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

const QuestionInputSchema = z.object({
  id: z.string(),
  text: z.string().min(8),
  category: z.string().optional(),
  maxDurationSec: z.number().int().min(30).max(300).default(120),
  required: z.boolean().default(true),
  skillLinks: z.array(z.string()).default([]),
});

const AssignRequestSchema = z.object({
  candidateEmail: z.string().email(),
  title: z.string().min(1).max(200).default("Interview Questions"),
  instructions: z.string().max(2000).optional(),
  questions: z.array(QuestionInputSchema).min(1).max(10),
  jobId: UuidLikeSchema.optional(),
  sourceResumeId: UuidLikeSchema.optional(),
  sourceContext: z.enum(["tool", "ai-coach", "career-360", "pipeline", "job-screening"]).default("tool"),
  targetRole: z.string().max(120).optional(),
  extractedSkills: z.array(z.any()).optional(),
  /** Provenance: the reusable library set this assignment was created from
   *  (if any). The library is decoupled from the live row — once assigned,
   *  per-candidate edits don't bleed back to the library. */
  questionSetId: UuidLikeSchema.optional(),
  /** How long the magic link is valid (hours). */
  linkExpiryHours: z.number().int().min(1).max(720).default(168), // 7 days default
  /** How long the candidate has to submit responses once they open the link (hours). */
  responseWindowHours: z.number().int().min(1).max(720).default(72),
  /** Recorder behaviour applied to every question. */
  prepTimeSec: z.number().int().min(0).max(120).default(10),
  maxRetakes: z.number().int().min(0).max(10).default(1),
  proctoringOn: z.boolean().default(true),
});

const ProctoringFlagsSchema = z
  .object({
    tabBlurCount: z.number().int().nonnegative().default(0),
    pasteCount: z.number().int().nonnegative().default(0),
    copyCount: z.number().int().nonnegative().default(0),
    fullscreenExits: z.number().int().nonnegative().default(0),
    prepUsedSec: z.number().int().nonnegative().default(0),
    retakesUsed: z.number().int().nonnegative().default(0),
    micLevelAvg: z.number().optional(),
    deviceLabel: z.string().max(100).optional(),
  })
  .optional();

const RespondRequestSchema = z.object({
  questionId: z.string(),
  responseMode: z.enum(["text", "video"]),
  textAnswer: z.string().max(20_000).optional(),
  recordingId: UuidLikeSchema.optional(),
  videoUrl: z.string().optional(),
  durationMs: z.number().optional(),
  transcription: z.string().optional(),
  proctoringFlags: ProctoringFlagsSchema,
  /** 1-indexed; recorder tells us which attempt this is. Capped server-side by the row's maxRetakes. */
  attempt: z.number().int().min(1).max(11).optional(),
});

export const interviewAssignmentCrudRoutes = new Hono<AppEnv>();

interviewAssignmentCrudRoutes.post("/assign", validateJson(AssignRequestSchema, undefined, { emptyBody: null }), async (c) => {
  const user = c.var.user;
  requireUser(c);
  if (!canAssign(user)) {
    return c.json(error("FORBIDDEN", "Only recruiters or employers can assign interviews to candidates"), 403);
  }

  const body = c.req.valid("json");

  const result = await assignInterview(user.sub, body);
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data), 201);
});

interviewAssignmentCrudRoutes.post("/:id/resend", async (c) => {
  const user = c.var.user;
  requireUser(c);

  const result = await resendInterviewInvite(user.sub, c.req.param("id"));
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data));
});

interviewAssignmentCrudRoutes.get("/mine", async (c) => {
  const user = c.var.user;
  requireUser(c);
  const mine = await listMyInterviews(user.sub, user.email);
  return c.json(success(mine));
});

interviewAssignmentCrudRoutes.get("/:id", async (c) => {
  const user = c.var.user;
  requireUser(c);

  const result = await getInterviewDetail(user.sub, c.req.param("id"));
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data));
});

interviewAssignmentCrudRoutes.post("/:id/respond", validateJson(RespondRequestSchema, (e) => error("VALIDATION_ERROR", "Invalid response payload", e.flatten()), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  requireUser(c);

  const body = c.req.valid("json");

  const result = await recordInterviewAnswer(
    c.env,
    user.sub,
    c.req.param("id"),
    body,
    c.executionCtx?.waitUntil?.bind(c.executionCtx),
  );
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data), 201);
});

interviewAssignmentCrudRoutes.post("/:id/submit", async (c) => {
  const user = c.var.user;
  requireUser(c);

  const result = await submitInterview(user.sub, c.req.param("id"));
  if (result.ok === false) return sendFailure(c, result);
  return c.json(success(result.data));
});
