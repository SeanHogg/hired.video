import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { interviewSessions, interviewAnswers } = schema;

export const interviewRoutes = new Hono<{ Variables: Variables }>();

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

async function callOpenRouter<T>(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
  schema: z.ZodSchema<T>,
  model = "google/gemini-flash-1.5",
): Promise<T> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hired.video",
      "X-Title": "hired.video Interview Practice",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");

  const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const parsed = schema.safeParse(JSON.parse(stripped));
  if (!parsed.success) throw new Error(`LLM returned invalid schema: ${JSON.stringify(parsed.error.flatten())}`);
  return parsed.data;
}

const QuestionsResponseSchema = z.object({
  questions: z.array(QuestionSchema),
});

function buildMockQuestions(type: string, count: number): z.infer<typeof QuestionsResponseSchema> {
  const behavioral = [
    { id: "q1", question: "Tell me about yourself and your professional background.", category: "behavioral", timeLimit: 90 },
    { id: "q2", question: "Describe a challenging project you worked on and how you overcame obstacles.", category: "behavioral", timeLimit: 120 },
    { id: "q3", question: "Give an example of a time you had to work with a difficult team member.", category: "behavioral", timeLimit: 90 },
    { id: "q4", question: "What is your greatest professional achievement and why?", category: "behavioral", timeLimit: 90 },
    { id: "q5", question: "Where do you see yourself in 5 years?", category: "behavioral", timeLimit: 60 },
  ];
  const technical = [
    { id: "q1", question: "Walk me through how you would design a URL shortener service.", category: "technical", timeLimit: 180 },
    { id: "q2", question: "Explain the difference between REST and GraphQL APIs.", category: "technical", timeLimit: 90 },
    { id: "q3", question: "How do you approach debugging a production issue?", category: "technical", timeLimit: 120 },
    { id: "q4", question: "What is your experience with distributed systems and how do you handle consistency?", category: "technical", timeLimit: 120 },
    { id: "q5", question: "Describe a time you had to make a technical trade-off and explain your reasoning.", category: "technical", timeLimit: 120 },
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

// ─── Storage helpers (same pattern as studio.ts) ────────────────────────────

function getS3Client() {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "auto",
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

function getBucket(): string {
  return process.env.STORAGE_BUCKET ?? "hired.video";
}

function canUseObjectStorage(): boolean {
  return Boolean(process.env.STORAGE_ENDPOINT && process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY);
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
  const apiKey = process.env.OPENROUTER_API_KEY || (globalThis as any).__ENV?.OPENROUTER_API_KEY;

  if (apiKey) {
    try {
      const systemPrompt = `You are an expert technical interviewer. Generate ${count} interview questions tailored to the job description.
Interview type: ${type}

Rules:
- Questions must be directly relevant to the job description
- Mix question difficulty (warm-up → challenging)
- Each question should have a timeLimit in seconds (60-180)
- Return ONLY valid JSON

JSON schema:
{ "questions": [{ "id": "q1", "question": "...", "category": "behavioral|technical|system-design", "timeLimit": 90 }] }`;

      const userContent = `Job Description:\n${jobDescription.slice(0, 3000)}${resumeText ? `\n\nResume:\n${resumeText.slice(0, 2000)}` : ""}`;

      const result = await callOpenRouter(apiKey, systemPrompt, userContent, QuestionsResponseSchema);
      return c.json(ok(result));
    } catch (err) {
      console.error("[interview/questions] LLM call failed, using mock:", err);
    }
  }

  return c.json(ok(buildMockQuestions(type, count)));
});

// POST /api/interview/sessions
// Create a new interview session
interviewRoutes.post("/sessions", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

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

  if (videoFile && typeof videoFile.arrayBuffer === "function" && canUseObjectStorage()) {
    r2Key = `interview/${user.sub}/${sessionId}/${fields.questionId}-${Date.now()}.webm`;
    const bytes = await videoFile.arrayBuffer();
    const s3 = getS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: r2Key,
        Body: Buffer.from(bytes),
        ContentType: videoFile.type || "video/webm",
        Metadata: { userId: user.sub, sessionId },
      }),
    );
    videoUrl = `https://cdn.hired.video/${r2Key}`;
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

  const apiKey = process.env.OPENROUTER_API_KEY || (globalThis as any).__ENV?.OPENROUTER_API_KEY;
  let feedbackResult;

  if (apiKey) {
    try {
      const systemPrompt = `You are an expert interview coach. Evaluate the candidate's answer and return a JSON object.

Rules:
- score: overall 0-10 (be calibrated: 6-7 is good, 8-9 is excellent)
- scoreBreakdown: rate each dimension 0-10
- strengths: 2-3 specific things they did well
- improvements: 2-3 specific, actionable improvements
- suggestedAnswer: a model answer showing how to improve
- Return ONLY valid JSON

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

      feedbackResult = await callOpenRouter(apiKey, systemPrompt, userContent, FeedbackSchema);
    } catch (err) {
      console.error("[interview/analyze] LLM call failed, using mock:", err);
      feedbackResult = buildMockFeedback(extra.data.question, extra.data.transcript);
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
