import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Env, Variables, AppEnv } from "../types/index.js";
import { cdnUrl } from "../utils/cdn.js";
import { putObject } from "../services/storage/object-store.js";
import { getDb, schema } from "../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { aiFailure } from "../services/adapters/llm-error.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { getPrompt } from "../../../shared/ai-prompts/index.js";

const { interviewSessions, interviewAnswers } = schema;

export const interviewRoutes = new Hono<AppEnv>();
interviewRoutes.use("*", attachTokenBudget());

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const QuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  category: z.string(),
  timeLimit: z.number(),
});

const GenerateQuestionsSchema = z.object({
  jobDescription: z.string().min(20).max(5000),
  resumeText: z.string().max(5000).optional(),
  type: z.enum(["technical", "behavioral", "system-design", "product", "general"]).default("behavioral"),
  count: z.number().min(3).max(10).default(5),
});

const CreateSessionSchema = z.object({
  jobDescription: z.string().min(20).max(5000),
  interviewType: z.enum(["technical", "behavioral", "system-design", "product", "general"]).default("behavioral"),
  questions: z.array(QuestionSchema).min(1).max(10),
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

// ─── AI Helpers ──────────────────────────────────────────────────────────────

const QuestionsResponseSchema = z.object({
  questions: z.array(QuestionSchema),
});

function buildMockQuestions(type: string, count: number, jobDescription?: string): z.infer<typeof QuestionsResponseSchema> {
  // Extract a role hint from the JD so mock questions feel personalised
  const roleHint = jobDescription
    ? (() => {
        const m = jobDescription.match(/(?:senior|lead|staff|principal|junior)?\s*([a-z][a-z\s]{3,40}(?:engineer|developer|manager|designer|analyst|scientist|architect))/i);
        return m ? m[0].trim() : "this role";
      })()
    : "this role";

  const behavioral = [
    { id: "q1", question: `Tell me about yourself and why you're interested in ${roleHint}.`, category: "behavioral", timeLimit: 90 },
    { id: "q2", question: "Describe a challenging project you worked on and how you overcame the obstacles.", category: "behavioral", timeLimit: 120 },
    { id: "q3", question: `What specific experience do you have that makes you a strong fit for ${roleHint}?`, category: "behavioral", timeLimit: 90 },
    { id: "q4", question: "What is your greatest professional achievement and how did you measure its impact?", category: "behavioral", timeLimit: 90 },
    { id: "q5", question: "Describe a time you had to work with a difficult team member. How did you handle it?", category: "behavioral", timeLimit: 90 },
    { id: "q6", question: "Where do you see yourself in 5 years and how does this role fit that path?", category: "behavioral", timeLimit: 60 },
  ];
  const technical = [
    { id: "q1", question: `Walk me through a technically complex project relevant to ${roleHint}.`, category: "technical", timeLimit: 180 },
    { id: "q2", question: "How do you approach designing a system for high availability and scalability?", category: "technical", timeLimit: 120 },
    { id: "q3", question: "Explain a technical trade-off you made recently and why you chose that path.", category: "technical", timeLimit: 120 },
    { id: "q4", question: "How do you approach debugging a production issue under pressure?", category: "technical", timeLimit: 120 },
    { id: "q5", question: "What is your experience with distributed systems and how do you handle data consistency?", category: "technical", timeLimit: 120 },
    { id: "q6", question: "How do you ensure code quality and reliability in your team?", category: "technical", timeLimit: 90 },
  ];
  const base = type === "technical" ? technical : behavioral;
  return { questions: base.slice(0, count) };
}

const FeedbackSchema = z.object({
  score: z.number(),
  scoreBreakdown: z.object({
    clarity: z.number(),
    confidence: z.number(),
    structure: z.number(),
    relevance: z.number(),
    impact: z.number(),
  }),
  feedback: z.object({
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    suggestedAnswer: z.string(),
  }),
});

type FeedbackResult = z.infer<typeof FeedbackSchema>;

function buildMockFeedback(question: string, transcript: string): FeedbackResult {
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const hasNumbers = /\d/.test(transcript);
  const hasExample = /example|instance|time when|worked on|project/i.test(transcript);

  const clarity = Math.min(9, 5 + (wordCount > 50 ? 1.5 : 0) + (wordCount < 200 ? 0.5 : 0));
  const confidence = Math.min(9, 5 + (wordCount > 30 ? 1 : 0));
  const structure = Math.min(9, 5 + (hasExample ? 1.5 : 0) + (transcript.includes("first") || transcript.includes("then") ? 1 : 0));
  const relevance = Math.min(9, 5.5 + (hasExample ? 1 : 0));
  const impact = Math.min(9, 5 + (hasNumbers ? 1.5 : 0));
  const score = Math.round(((clarity + confidence + structure + relevance + impact) / 5) * 10) / 10;

  return {
    score,
    scoreBreakdown: {
      clarity: Math.round(clarity * 10) / 10,
      confidence: Math.round(confidence * 10) / 10,
      structure: Math.round(structure * 10) / 10,
      relevance: Math.round(relevance * 10) / 10,
      impact: Math.round(impact * 10) / 10,
    },
    feedback: {
      strengths: [
        wordCount > 50 ? "Good length and detail in your response" : "Clear and concise answer",
        hasExample ? "You provided a concrete example" : "You addressed the question directly",
      ],
      improvements: [
        !hasNumbers ? "Add specific metrics or numbers to quantify your impact" : "Continue using specific metrics",
        !hasExample ? "Use the STAR method: Situation, Task, Action, Result" : "Consider adding more measurable outcomes",
        wordCount < 50 ? "Expand your answer with more detail and context" : "Watch your pace and filler words",
      ],
      suggestedAnswer: `A strong answer to "${question}" would use the STAR method: describe a specific Situation, the Task you were responsible for, the Actions you took, and the measurable Results you achieved. Include specific numbers, percentages, or outcomes where possible.`,
    },
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/interview/questions
// Generate interview questions from a job description (no session created)
interviewRoutes.post("/questions", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = GenerateQuestionsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const { jobDescription, resumeText, type, count } = parsed.data;

  if (hasAnyLLMProviderKey(c.env)) {
    try {
      const systemPrompt = getPrompt("interview-question-generator").render({ type, count });

      const userContent = `Job Description:\n${jobDescription.slice(0, 3000)}${resumeText ? `\n\nCandidate Resume:\n${resumeText.slice(0, 2000)}` : ""}`;

      const llm = createLLMClient(c.env, c.var.user);
      const { data } = await llm.callJson("interview_questions", { useCase: "interview_questions", systemPrompt, userMessage: userContent }, QuestionsResponseSchema);
      return c.json(ok(data));
    } catch (err) {
      // Configured-but-threw: surface a typed AI_* envelope instead of
      // serving the canned mock questions as if they were generated. The
      // mock below remains the genuine "no provider key" fallback only.
      return aiFailure(c, err, "[interview/questions] LLM call failed");
    }
  }

  return c.json(ok(buildMockQuestions(type, count, jobDescription)));
});

// POST /api/interview/sessions
// Create a new interview session. Free tier is capped at
// FREE_INTERVIEW_SESSIONS_PER_MONTH calendar-month sessions via
// `servicesProcessor.enforce(c, "interview_session")`; Pro is unbounded
// (token budget still applies via per-answer LLM calls).
interviewRoutes.post("/sessions", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const limitErr = await servicesProcessor.enforce(c, "interview_session");
  if (limitErr) return limitErr;

  const db = getDb();
  const [session] = await db
    .insert(interviewSessions)
    .values({
      userId: user.sub,
      jobDescription: parsed.data.jobDescription,
      interviewType: parsed.data.interviewType,
      questions: parsed.data.questions as any,
      status: "active",
    } as any)
    .returning();

  servicesProcessor.meterEvent(c, "interview_session", {
    sessionId: session?.id,
    interviewType: parsed.data.interviewType,
  });

  return c.json(ok(session), 201);
});

// GET /api/interview/sessions
// List user's interview sessions
interviewRoutes.get("/sessions", async (c) => {
  const user = c.var.user;
  const db = getDb();

  const sessions = await db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.userId, user.sub))
    .orderBy(desc(interviewSessions.createdAt));

  return c.json(ok(sessions));
});

// GET /api/interview/sessions/:id
// Get a session with its answers
interviewRoutes.get("/sessions/:id", async (c) => {
  const user = c.var.user;
  const sessionId = c.req.param("id");
  const db = getDb();

  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, user.sub)))
    .limit(1);

  if (!session) return c.json(fail("NOT_FOUND", "Session not found"), 404);

  const answers = await db
    .select()
    .from(interviewAnswers)
    .where(eq(interviewAnswers.sessionId, sessionId));

  return c.json(ok({ ...session, answers }));
});

// POST /api/interview/sessions/:id/answers
// Save an answer for a question (multipart: optional video file + JSON fields)
interviewRoutes.post("/sessions/:id/answers", async (c) => {
  const user = c.var.user;
  const sessionId = c.req.param("id");
  const db = getDb();

  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, user.sub)))
    .limit(1);

  if (!session) return c.json(fail("NOT_FOUND", "Session not found"), 404);

  // Support both multipart (with video) and JSON payloads
  const contentType = c.req.header("content-type") ?? "";
  let fields: z.infer<typeof SaveAnswerSchema>;
  let videoFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData().catch(() => null);
    if (!form) return c.json(fail("VALIDATION_ERROR", "Invalid form data"), 400);
    videoFile = form.get("video") as File | null;
    const rawFields = {
      questionId: String(form.get("questionId") ?? ""),
      question: String(form.get("question") ?? ""),
      transcript: String(form.get("transcript") ?? "") || undefined,
    };
    const parsed = SaveAnswerSchema.safeParse(rawFields);
    if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid fields", parsed.error.flatten()), 400);
    fields = parsed.data;
  } else {
    const body = await c.req.json().catch(() => null);
    const parsed = SaveAnswerSchema.safeParse(body);
    if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
    fields = parsed.data;
  }

  let r2Key: string | null = null;
  let videoUrl: string | null = null;

  if (videoFile && typeof videoFile.arrayBuffer === "function") {
    const key = `interview/${user.sub}/${sessionId}/${fields.questionId}-${Date.now()}.webm`;
    const bytes = await videoFile.arrayBuffer();
    if (await putObject(key, bytes, videoFile.type || "video/webm", { userId: user.sub, sessionId })) {
      r2Key = key;
      videoUrl = cdnUrl(key);
    }
  }

  const [answer] = await db
    .insert(interviewAnswers)
    .values({
      sessionId,
      userId: user.sub,
      questionId: fields.questionId,
      question: fields.question,
      transcript: fields.transcript ?? null,
      videoUrl: videoUrl ?? fields.videoUrl ?? null,
      r2Key: r2Key ?? fields.r2Key ?? null,
    } as any)
    .returning();

  return c.json(ok(answer), 201);
});

// POST /api/interview/answers/:answerId/analyze
// Run AI analysis on a single answer
interviewRoutes.post("/answers/:answerId/analyze", async (c) => {
  const user = c.var.user;
  const answerId = c.req.param("answerId");
  const db = getDb();

  const [answer] = await db
    .select()
    .from(interviewAnswers)
    .where(and(eq(interviewAnswers.id, answerId), eq(interviewAnswers.userId, user.sub)))
    .limit(1);

  if (!answer) return c.json(fail("NOT_FOUND", "Answer not found"), 404);

  const body = await c.req.json().catch(() => ({}));
  const extra = AnalyzeAnswerSchema.safeParse({
    question: answer.question,
    transcript: body.transcript ?? answer.transcript ?? "",
    jobDescription: body.jobDescription,
  });

  if (!extra.success || !extra.data.transcript) {
    return c.json(fail("VALIDATION_ERROR", "Transcript is required for analysis"), 400);
  }

  let feedbackResult;

  if (hasAnyLLMProviderKey(c.env)) {
    try {
      const systemPrompt = `${getPrompt("interview-answer-coach").render({})}

Schema:
{
  "score": number,
  "scoreBreakdown": { "clarity": number, "confidence": number, "structure": number, "relevance": number, "impact": number },
  "feedback": {
    "strengths": string[],
    "improvements": string[],
    "suggestedAnswer": string
  }
}`;

      const jobContext = extra.data.jobDescription ? `\nJob context: ${extra.data.jobDescription.slice(0, 500)}` : "";
      const userContent = `Question: ${extra.data.question}${jobContext}\n\nCandidate's answer:\n${extra.data.transcript.slice(0, 2000)}`;

      const llm = createLLMClient(c.env, c.var.user);
      const { data } = await llm.callJson("interview_analyze", { useCase: "interview_analyze", systemPrompt, userMessage: userContent }, FeedbackSchema);
      feedbackResult = data;
    } catch (err) {
      // Configured-but-threw: surface a typed AI_* envelope instead of
      // saving + returning canned mock feedback as if the AI scored it.
      return aiFailure(c, err, "[interview/analyze] LLM call failed");
    }
  } else {
    feedbackResult = buildMockFeedback(extra.data.question, extra.data.transcript);
  }

  // Save feedback to the answer
  const [updated] = await db
    .update(interviewAnswers)
    .set({
      score: String(feedbackResult.score),
      feedback: feedbackResult as any,
      transcript: extra.data.transcript,
    } as any)
    .where(eq(interviewAnswers.id, answerId))
    .returning();

  return c.json(ok(updated));
});

// PATCH /api/interview/sessions/:id/complete
// Mark session complete and compute overall score
interviewRoutes.patch("/sessions/:id/complete", async (c) => {
  const user = c.var.user;
  const sessionId = c.req.param("id");
  const db = getDb();

  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, user.sub)))
    .limit(1);

  if (!session) return c.json(fail("NOT_FOUND", "Session not found"), 404);

  const answers = await db
    .select()
    .from(interviewAnswers)
    .where(eq(interviewAnswers.sessionId, sessionId));

  const scoredAnswers = answers.filter((a) => a.score !== null);
  let overallScore: string | null = null;
  if (scoredAnswers.length > 0) {
    const avg = scoredAnswers.reduce((sum, a) => sum + parseFloat(a.score!), 0) / scoredAnswers.length;
    overallScore = String(Math.round(avg * 10) / 10);
  }

  const [updated] = await db
    .update(interviewSessions)
    .set({ status: "completed", overallScore, updatedAt: new Date() } as any)
    .where(eq(interviewSessions.id, sessionId))
    .returning();

  return c.json(ok({ ...updated, answers }));
});

// DELETE /api/interview/sessions/:id
interviewRoutes.delete("/sessions/:id", async (c) => {
  const user = c.var.user;
  const sessionId = c.req.param("id");
  const db = getDb();

  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, user.sub)))
    .limit(1);

  if (!session) return c.json(fail("NOT_FOUND", "Session not found"), 404);

  await db.delete(interviewAnswers).where(eq(interviewAnswers.sessionId, sessionId));
  await db.delete(interviewSessions).where(eq(interviewSessions.id, sessionId));

  return c.json(ok({ deleted: true }));
});

// ─── POST /api/interview/sessions/:id/share ───────────────────────────────────
// Generate a public share link for a completed interview session so candidates
// can send pre-qualified results to recruiters.

interviewRoutes.post("/sessions/:id/share", async (c) => {
  const user = c.var.user;
  const sessionId = c.req.param("id");
  const db = getDb();

  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, user.sub)))
    .limit(1);

  if (!session) return c.json(fail("NOT_FOUND", "Session not found"), 404);

  // Reuse existing token if already shared
  if (session.shareToken && (session.isShared as any)) {
    const shareUrl = `/interview/shared/${session.shareToken}`;
    return c.json(ok({ shareToken: session.shareToken, shareUrl }), 200);
  }

  // Generate a short random token (12 hex chars = 6 bytes = low collision for this use case)
  const rawToken = crypto.getRandomValues(new Uint8Array(16));
  const shareToken = Array.from(rawToken).map((b) => b.toString(16).padStart(2, "0")).join("");

  await db
    .update(interviewSessions)
    .set({ shareToken, isShared: true, updatedAt: new Date() } as any)
    .where(eq(interviewSessions.id, sessionId));

  const shareUrl = `/interview/shared/${shareToken}`;
  return c.json(ok({ shareToken, shareUrl }), 200);
});

// ─── GET /api/interview/public/:shareToken ────────────────────────────────────
// Public endpoint — no auth required. Returns a sanitised summary of a shared
// interview session for recruiters to review.

interviewRoutes.get("/public/:shareToken", async (c) => {
  const { shareToken } = c.req.param();
  const db = getDb();

  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.shareToken, shareToken), eq(interviewSessions.isShared, true as any)))
    .limit(1);

  if (!session) return c.json(fail("NOT_FOUND", "Session not found or not shared"), 404);

  const answers = await db
    .select({
      question: interviewAnswers.question,
      score: interviewAnswers.score,
      feedback: interviewAnswers.feedback,
    })
    .from(interviewAnswers)
    .where(eq(interviewAnswers.sessionId, session.id));

  const scoredAnswers = answers.filter((a) => a.score !== null);
  const avgScore = scoredAnswers.length > 0
    ? Math.round(scoredAnswers.reduce((s, a) => s + parseFloat(a.score!), 0) / scoredAnswers.length * 10) / 10
    : null;

  // Return sanitised data — no user ID, no raw transcript, no video URLs
  return c.json(ok({
    id: session.id,
    interviewType: session.interviewType,
    questionCount: (session.questions as any[])?.length ?? 0,
    answeredCount: answers.length,
    overallScore: session.overallScore ?? (avgScore !== null ? String(avgScore) : null),
    status: session.status,
    completedAt: session.updatedAt,
    answers: answers.map((a) => ({
      question: a.question,
      score: a.score,
      feedbackSummary: (a.feedback as any)?.summary ?? null,
    })),
  }), 200);
});
