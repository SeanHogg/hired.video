/**
 * Studio features — interview question library + practice. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 * Use cases live in services/studio/interview-practice.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import {
  listInterviewQuestions,
  listInterviewSessions,
  seedDefaultInterviewQuestions,
  startInterviewSession,
  updateInterviewSession,
} from "../../services/studio/interview-practice.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const interviewRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  7. INTERVIEW QUESTION LIBRARY + PRACTICE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/interview/questions — browse question library
interviewRoutes.get("/interview/questions", async (c) => {
  const questions = await listInterviewQuestions({
    category: c.req.query("category"),
    difficulty: c.req.query("difficulty"),
    industry: c.req.query("industry"),
  });
  return c.json(success(questions));
});

// POST /api/studio/interview/questions/seed — seed default questions
interviewRoutes.post("/interview/questions/seed", async (c) => {
  return c.json(success(await seedDefaultInterviewQuestions()));
});

// POST /api/studio/interview/session — start a practice session
interviewRoutes.post("/interview/session", validateJson(z.object({
    questionId: UuidLikeSchema,
    resumeText: z.string().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const session = await startInterviewSession(userId, c.req.valid("json"), { env: c.env, user: c.var.user });
  return c.json(success(session), 201);
});

// PATCH /api/studio/interview/session/:id — update session with recording + score
interviewRoutes.patch("/interview/session/:id", validateJson(z.object({
    recordingId: UuidLikeSchema.optional(),
    coachingId: UuidLikeSchema.optional(),
    answer: z.string().optional(),
    isPublic: z.boolean().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const updated = await updateInterviewSession(
    userId,
    c.req.param("id"),
    c.req.valid("json"),
    { env: c.env, user: c.var.user },
  );
  return c.json(success(updated));
});

// GET /api/studio/interview/sessions — list user's practice sessions
interviewRoutes.get("/interview/sessions", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listInterviewSessions(userId)));
});
