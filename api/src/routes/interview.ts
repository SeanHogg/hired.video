import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { aiFailure } from "../services/adapters/llm-error.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { readForm } from "../utils/multipart.js";
import { success, error } from "../types/index.js";
import { validateJson } from "./helpers/validate.js";
import {
  generatePracticeQuestions,
  PracticeQuestionSchema,
  scorePracticeAnswer,
  type PracticeFeedback,
} from "../services/interview/practice-ai.js";
import {
  assertOwnsPracticeSession,
  completePracticeSession,
  createPracticeSession,
  deletePracticeSession,
  getOwnedPracticeAnswer,
  getPracticeSession,
  getSharedPracticeSession,
  listPracticeSessions,
  savePracticeAnswer,
  savePracticeFeedback,
  sharePracticeSession,
} from "../services/interview/practice-sessions.js";

export const interviewRoutes = new Hono<AppEnv>();
interviewRoutes.use("*", attachTokenBudget());

// ─── Schemas ─────────────────────────────────────────────────────────────────

const GenerateQuestionsSchema = z.object({
  jobDescription: z.string().min(20).max(5000),
  resumeText: z.string().max(5000).optional(),
  type: z.enum(["technical", "behavioral", "system-design", "product", "general"]).default("behavioral"),
  count: z.number().min(3).max(10).default(5),
});

const CreateSessionSchema = z.object({
  jobDescription: z.string().min(20).max(5000),
  interviewType: z.enum(["technical", "behavioral", "system-design", "product", "general"]).default("behavioral"),
  questions: z.array(PracticeQuestionSchema).min(1).max(10),
});

const SaveAnswerSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  transcript: z.string().optional(),
  videoUrl: z.string().optional(),
  r2Key: z.string().optional(),
});

const AnalyzeAnswerSchema = z.object({
  question: z.string(),
  transcript: z.string().min(1),
  jobDescription: z.string().optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/interview/questions
// Generate interview questions from a job description (no session created)
interviewRoutes.post("/questions", validateJson(GenerateQuestionsSchema, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  try {
    return c.json(success(await generatePracticeQuestions(c.env, c.var.user, body)));
  } catch (err) {
    // Configured-but-threw: surface a typed AI_* envelope instead of
    // serving the canned mock questions as if they were generated. The
    // mock remains the genuine "no provider key" fallback only.
    return aiFailure(c, err, "[interview/questions] LLM call failed");
  }
});

// POST /api/interview/sessions
// Create a new interview session. Free tier is capped at
// FREE_INTERVIEW_SESSIONS_PER_MONTH calendar-month sessions via
// `servicesProcessor.enforce(c, "interview_session")`; Pro is unbounded
// (token budget still applies via per-answer LLM calls).
interviewRoutes.post("/sessions", validateJson(CreateSessionSchema, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const body = c.req.valid("json");

  const limitErr = await servicesProcessor.enforce(c, "interview_session");
  if (limitErr) return limitErr;

  const session = await createPracticeSession(user.sub, body);

  servicesProcessor.meterEvent(c, "interview_session", {
    sessionId: session?.id,
    interviewType: body.interviewType,
  });

  return c.json(success(session), 201);
});

// GET /api/interview/sessions
// List user's interview sessions
interviewRoutes.get("/sessions", async (c) => {
  return c.json(success(await listPracticeSessions(c.var.user.sub)));
});

// GET /api/interview/sessions/:id
// Get a session with its answers
interviewRoutes.get("/sessions/:id", async (c) => {
  return c.json(success(await getPracticeSession(c.req.param("id"), c.var.user.sub)));
});

// POST /api/interview/sessions/:id/answers
// Save an answer for a question (multipart: optional video file + JSON fields)
interviewRoutes.post("/sessions/:id/answers", async (c) => {
  const user = c.var.user;
  const sessionId = c.req.param("id");

  await assertOwnsPracticeSession(sessionId, user.sub);

  // Support both multipart (with video) and JSON payloads
  const contentType = c.req.header("content-type") ?? "";
  let fields: z.infer<typeof SaveAnswerSchema>;
  let videoFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await readForm(c);
    if (!form) return c.json(error("VALIDATION_ERROR", "Invalid form data"), 400);
    videoFile = form.get("video") as unknown as File | null;
    const rawFields = {
      questionId: String(form.get("questionId") ?? ""),
      question: String(form.get("question") ?? ""),
      transcript: String(form.get("transcript") ?? "") || undefined,
    };
    const parsed = SaveAnswerSchema.safeParse(rawFields);
    if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid fields", parsed.error.flatten()), 400);
    fields = parsed.data;
  } else {
    const body = await c.req.json().catch(() => null);
    const parsed = SaveAnswerSchema.safeParse(body);
    if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
    fields = parsed.data;
  }

  const answer = await savePracticeAnswer(sessionId, user.sub, fields, videoFile);
  return c.json(success(answer), 201);
});

// POST /api/interview/answers/:answerId/analyze
// Run AI analysis on a single answer
interviewRoutes.post("/answers/:answerId/analyze", async (c) => {
  const answerId = c.req.param("answerId");
  const answer = await getOwnedPracticeAnswer(answerId, c.var.user.sub);

  const body = await c.req.json().catch(() => ({}));
  const extra = AnalyzeAnswerSchema.safeParse({
    question: answer.question,
    transcript: body.transcript ?? answer.transcript ?? "",
    jobDescription: body.jobDescription,
  });

  if (!extra.success || !extra.data.transcript) {
    return c.json(error("VALIDATION_ERROR", "Transcript is required for analysis"), 400);
  }

  let feedbackResult: PracticeFeedback;
  try {
    feedbackResult = await scorePracticeAnswer(c.env, c.var.user, extra.data);
  } catch (err) {
    // Configured-but-threw: surface a typed AI_* envelope instead of
    // saving + returning canned mock feedback as if the AI scored it.
    return aiFailure(c, err, "[interview/analyze] LLM call failed");
  }

  const updated = await savePracticeFeedback(answerId, feedbackResult, extra.data.transcript);
  return c.json(success(updated));
});

// PATCH /api/interview/sessions/:id/complete
// Mark session complete and compute overall score
interviewRoutes.patch("/sessions/:id/complete", async (c) => {
  return c.json(success(await completePracticeSession(c.req.param("id"), c.var.user.sub)));
});

// DELETE /api/interview/sessions/:id
interviewRoutes.delete("/sessions/:id", async (c) => {
  await deletePracticeSession(c.req.param("id"), c.var.user.sub);
  return c.json(success({ deleted: true }));
});

// ─── POST /api/interview/sessions/:id/share ───────────────────────────────────
// Generate a public share link for a completed interview session so candidates
// can send pre-qualified results to recruiters.

interviewRoutes.post("/sessions/:id/share", async (c) => {
  return c.json(success(await sharePracticeSession(c.req.param("id"), c.var.user.sub)), 200);
});

// ─── GET /api/interview/public/:shareToken ────────────────────────────────────
// Public endpoint — no auth required. Returns a sanitised summary of a shared
// interview session for recruiters to review.

interviewRoutes.get("/public/:shareToken", async (c) => {
  const { shareToken } = c.req.param();
  return c.json(success(await getSharedPracticeSession(shareToken)), 200);
});
