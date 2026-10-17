// assessments.ts — Candidate skills assessments (#76)
// Timed, AI-graded skills tests that appear as badges on candidate profiles.

import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { tryExtractJson } from "../../../shared/extract-json.js";

export const assessmentRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// ─── Public: browse available assessments ────────────────────────────────────

/** GET /api/assessments — list active assessments; optionally filter by ?skill= */
assessmentRoutes.get("/", async (c) => {
  const db = getDb();
  const skill = c.req.query("skill");
  const rows = await db
    .select({
      id: schema.skillAssessments.id,
      slug: schema.skillAssessments.slug,
      title: schema.skillAssessments.title,
      description: schema.skillAssessments.description,
      skillCategory: schema.skillAssessments.skillCategory,
      difficulty: schema.skillAssessments.difficulty,
      timeLimitMinutes: schema.skillAssessments.timeLimitMinutes,
      passingScore: schema.skillAssessments.passingScore,
    })
    .from(schema.skillAssessments)
    .where(and(
      eq(schema.skillAssessments.isActive, true),
      ...(skill ? [eq(schema.skillAssessments.skillCategory, skill)] : []),
    ))
    .orderBy(schema.skillAssessments.skillCategory);

  return c.json(success(rows), 200);
});

/** GET /api/assessments/:slug — assessment detail (questions hidden until started) */
assessmentRoutes.get("/:slug", async (c) => {
  const db = getDb();
  const [row] = await db
    .select({
      id: schema.skillAssessments.id,
      slug: schema.skillAssessments.slug,
      title: schema.skillAssessments.title,
      description: schema.skillAssessments.description,
      skillCategory: schema.skillAssessments.skillCategory,
      difficulty: schema.skillAssessments.difficulty,
      timeLimitMinutes: schema.skillAssessments.timeLimitMinutes,
      passingScore: schema.skillAssessments.passingScore,
    })
    .from(schema.skillAssessments)
    .where(and(eq(schema.skillAssessments.slug, c.req.param("slug")), eq(schema.skillAssessments.isActive, true)))
    .limit(1);

  if (!row) return c.json(error("NOT_FOUND", "Assessment not found"), 404);
  return c.json(success(row), 200);
});

// ─── Candidate attempt flow ───────────────────────────────────────────────────

/** POST /api/assessments/:slug/start — start a new attempt */
assessmentRoutes.post("/:slug/start", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [assessment] = await db
    .select()
    .from(schema.skillAssessments)
    .where(and(eq(schema.skillAssessments.slug, c.req.param("slug")), eq(schema.skillAssessments.isActive, true)))
    .limit(1);

  if (!assessment) return c.json(error("NOT_FOUND", "Assessment not found"), 404);

  // Check for active in-progress attempt
  const [existing] = await db
    .select({ id: schema.assessmentAttempts.id, expiresAt: schema.assessmentAttempts.expiresAt })
    .from(schema.assessmentAttempts)
    .where(and(
      eq(schema.assessmentAttempts.userId, userId),
      eq(schema.assessmentAttempts.assessmentId, assessment.id),
      eq(schema.assessmentAttempts.status, "in_progress"),
    ))
    .limit(1);

  if (existing && existing.expiresAt && existing.expiresAt > new Date()) {
    return c.json(error("CONFLICT", "You already have an active attempt for this assessment"), 409);
  }

  const expiresAt = assessment.timeLimitMinutes
    ? new Date(Date.now() + assessment.timeLimitMinutes * 60 * 1000)
    : null;

  const [attempt] = await db
    .insert(schema.assessmentAttempts)
    .values({
      userId,
      assessmentId: assessment.id,
      status: "in_progress",
      expiresAt,
    } as any)
    .returning();

  // Return questions (without correct answers)
  const questions = (assessment.questions ?? []).map((q: any) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    points: q.points,
  }));

  return c.json(success({
    attemptId: attempt.id,
    expiresAt: expiresAt?.toISOString() ?? null,
    timeLimitMinutes: assessment.timeLimitMinutes,
    questions,
  }), 201);
});

/** POST /api/assessments/attempts/:attemptId/submit — submit answers for grading */
assessmentRoutes.post("/attempts/:attemptId/submit", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [attempt] = await db
    .select()
    .from(schema.assessmentAttempts)
    .where(and(
      eq(schema.assessmentAttempts.id, c.req.param("attemptId")),
      eq(schema.assessmentAttempts.userId, userId),
    ))
    .limit(1);

  if (!attempt) return c.json(error("NOT_FOUND", "Attempt not found"), 404);
  if (attempt.status !== "in_progress") return c.json(error("CONFLICT", `Attempt is already ${attempt.status}`), 409);
  if (attempt.expiresAt && attempt.expiresAt < new Date()) {
    await db.update(schema.assessmentAttempts)
      .set({ status: "expired" } as any)
      .where(eq(schema.assessmentAttempts.id, attempt.id));
    return c.json(error("GONE", "Assessment time limit exceeded"), 410);
  }

  const body = await c.req.json().catch(() => ({}));
  const answers: Record<string, string | number> = body.answers ?? {};

  // Fetch assessment with questions
  const [assessment] = await db
    .select()
    .from(schema.skillAssessments)
    .where(eq(schema.skillAssessments.id, attempt.assessmentId))
    .limit(1);

  if (!assessment) return c.json(error("NOT_FOUND", "Assessment not found"), 404);

  // Grade automatically-gradeable questions
  const questions: any[] = assessment.questions ?? [];
  const gradingResults: Record<string, { correct: boolean; points: number; feedback?: string }> = {};
  let rawScore = 0;
  let totalPoints = 0;

  for (const q of questions) {
    totalPoints += q.points;
    const answer = answers[q.id];
    let correct = false;

    if (q.type === "multiple_choice" || q.type === "true_false") {
      correct = String(answer).toLowerCase() === String(q.correctAnswer).toLowerCase();
    } else if (q.type === "short_answer") {
      // AI-grade if possible, otherwise defer
      correct = false; // will be updated by AI grading below
    }
    // code questions always need AI grading

    const pts = correct ? q.points : 0;
    rawScore += pts;
    gradingResults[q.id] = { correct, points: pts };
  }

  // AI grading for short_answer and code questions
  let aiFeedback = "";
  const shortAnswerQs = questions.filter((q) => q.type === "short_answer" || q.type === "code");

  if (hasAnyLLMProviderKey(c.env as any) && shortAnswerQs.length > 0) {
    try {
      const gradingPrompt = `You are a technical skills grader. Grade these answers for the assessment "${assessment.title}":

${shortAnswerQs.map((q: any) => `Q: ${q.prompt}\nExpected: ${q.correctAnswer ?? "(open ended)"}\nCandidateAnswer: ${String(answers[q.id] ?? "")}`).join("\n\n")}

Respond with JSON: { "grades": { "<questionId>": { "correct": boolean, "points": number, "feedback": string } }, "overallFeedback": string }
Max points per question: ${shortAnswerQs.map((q: any) => `${q.id}: ${q.points}`).join(", ")}`;

      const llm = createLLMClient(c.env as any, c.var.user);
      const { content } = await llm.callText("assessment_grading", { useCase: "reviews", systemPrompt: "", userMessage: gradingPrompt });
      const parsed = tryExtractJson<{
        grades?: Record<string, { correct: boolean; points?: number; feedback?: string }>;
        overallFeedback?: string;
      }>(content);
      if (parsed?.grades) {
        for (const [qId, grade] of Object.entries(parsed.grades)) {
          const delta = (grade.points ?? 0) - (gradingResults[qId]?.points ?? 0);
          rawScore += delta;
          gradingResults[qId] = { correct: grade.correct, points: grade.points ?? 0, feedback: grade.feedback };
        }
      }
      aiFeedback = parsed?.overallFeedback ?? "";
    } catch { /* keep auto-grade results */ }
  }

  const percentageScore = totalPoints > 0 ? Math.round((rawScore / totalPoints) * 100) : 0;
  const passed = percentageScore >= assessment.passingScore;

  const [updated] = await db
    .update(schema.assessmentAttempts)
    .set({
      status: "graded",
      answers,
      gradingResults,
      rawScore,
      totalPoints,
      percentageScore: String(percentageScore),
      passed,
      aiFeedback,
      submittedAt: new Date(),
      gradedAt: new Date(),
    } as any)
    .where(eq(schema.assessmentAttempts.id, attempt.id))
    .returning();

  return c.json(success({
    attemptId: attempt.id,
    percentageScore,
    rawScore,
    totalPoints,
    passed,
    aiFeedback,
    gradingResults,
    assessment: { title: assessment.title, passingScore: assessment.passingScore },
  }), 200);
});

/** GET /api/assessments/me/results — all completed attempts for the logged-in user */
assessmentRoutes.get("/me/results", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const rows = await db
    .select({
      id: schema.assessmentAttempts.id,
      assessmentId: schema.assessmentAttempts.assessmentId,
      status: schema.assessmentAttempts.status,
      percentageScore: schema.assessmentAttempts.percentageScore,
      passed: schema.assessmentAttempts.passed,
      gradedAt: schema.assessmentAttempts.gradedAt,
      title: schema.skillAssessments.title,
      skillCategory: schema.skillAssessments.skillCategory,
      difficulty: schema.skillAssessments.difficulty,
    })
    .from(schema.assessmentAttempts)
    .innerJoin(schema.skillAssessments, eq(schema.skillAssessments.id, schema.assessmentAttempts.assessmentId))
    .where(and(
      eq(schema.assessmentAttempts.userId, userId),
      inArray(schema.assessmentAttempts.status, ["graded", "submitted"]),
    ))
    .orderBy(desc(schema.assessmentAttempts.gradedAt));

  return c.json(success(rows), 200);
});

/** GET /api/assessments/users/:userId/badges — public passed assessments for a profile */
assessmentRoutes.get("/users/:userId/badges", async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      title: schema.skillAssessments.title,
      skillCategory: schema.skillAssessments.skillCategory,
      difficulty: schema.skillAssessments.difficulty,
      percentageScore: schema.assessmentAttempts.percentageScore,
      gradedAt: schema.assessmentAttempts.gradedAt,
    })
    .from(schema.assessmentAttempts)
    .innerJoin(schema.skillAssessments, eq(schema.skillAssessments.id, schema.assessmentAttempts.assessmentId))
    .where(and(
      eq(schema.assessmentAttempts.userId, c.req.param("userId")),
      eq(schema.assessmentAttempts.passed, true),
    ))
    .orderBy(desc(schema.assessmentAttempts.gradedAt));

  return c.json(success(rows), 200);
});

assessmentRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Assessment endpoint not found" } }, 404),
);
