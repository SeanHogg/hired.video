/**
 * Studio features — async employer video interviews. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 * Use cases live in services/interview/studio-async-interviews.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import {
  createStudioAsyncInterview,
  getStudioAsyncInterviewResponses,
  getStudioAsyncInvite,
  listStudioAsyncInterviews,
  respondToStudioAsyncInterview,
  submitStudioAsyncInterview,
} from "../../services/interview/studio-async-interviews.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const asyncInterviewRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  10. ASYNC EMPLOYER VIDEO INTERVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/async-interview — recruiter creates an async interview
asyncInterviewRoutes.post("/async-interview", validateJson(z.object({
    title: z.string().min(1).max(200),
    instructions: z.string().max(2000).optional(),
    candidateEmail: z.string().email().optional(),
    candidateId: UuidLikeSchema.optional(),
    jobId: UuidLikeSchema.optional(),
    questions: z.array(z.object({
      id: z.string(),
      text: z.string().min(1),
      maxDurationSec: z.number().min(30).max(300).default(120),
      required: z.boolean().default(true),
    })).min(1).max(10),
    deadline: z.string().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await createStudioAsyncInterview(userId, c.req.valid("json"))), 201);
});

// GET /api/studio/async-interview/invite/:token — candidate views interview invite
asyncInterviewRoutes.get("/async-interview/invite/:token", async (c) => {
  return c.json(success(await getStudioAsyncInvite(c.req.param("token"))));
});

// POST /api/studio/async-interview/:id/respond — candidate submits a video response
asyncInterviewRoutes.post("/async-interview/:id/respond", validateJson(z.object({
    questionId: z.string(),
    recordingId: UuidLikeSchema.optional(),
    videoUrl: z.string().optional(),
    transcription: z.string().optional(),
    durationMs: z.number().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const response = await respondToStudioAsyncInterview(userId, c.req.param("id"), c.req.valid("json"));
  return c.json(success(response), 201);
});

// POST /api/studio/async-interview/:id/submit — candidate marks interview as submitted
asyncInterviewRoutes.post("/async-interview/:id/submit", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await submitStudioAsyncInterview(userId, c.req.param("id"))));
});

// GET /api/studio/async-interviews — list interviews (for recruiter)
asyncInterviewRoutes.get("/async-interviews", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listStudioAsyncInterviews(userId)));
});

// GET /api/studio/async-interview/:id/responses — recruiter views candidate responses
asyncInterviewRoutes.get("/async-interview/:id/responses", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getStudioAsyncInterviewResponses(userId, c.req.param("id"))));
});
