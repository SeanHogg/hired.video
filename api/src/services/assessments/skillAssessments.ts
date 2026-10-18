/**
 * Skills assessments (#76) — the candidate attempt flow: start a timed
 * attempt, then submit answers for auto + AI grading. Data access is
 * SkillAssessmentsRepository; failures are DomainErrors the global handler
 * renders with the same status/code the route always returned.
 */
import { DomainError } from "../../domains/errors.js";
import {
  SkillAssessmentsRepository,
  type SkillAssessment,
} from "../../repositories/skillAssessmentsRepository.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../adapters/llm-client.js";
import type { LLMEnv } from "../adapters/llm/types.js";
import type { JwtPayload } from "../../types/index.js";
import { tryExtractJson } from "../../../../shared/extract-json.js";

type Question = NonNullable<SkillAssessment["questions"]>[number];
type GradingResults = Record<string, { correct: boolean; points: number; feedback?: string }>;

export interface StartedAttempt {
  attemptId: string;
  expiresAt: string | null;
  timeLimitMinutes: number | null;
  questions: Array<Pick<Question, "id" | "type" | "prompt" | "options" | "points">>;
}

/** Starts a new attempt; questions are returned without correct answers. */
export async function startAssessmentAttempt(
  userId: string,
  slug: string,
  repo = new SkillAssessmentsRepository(),
): Promise<StartedAttempt> {
  const assessment = await repo.findActiveBySlug(slug);
  if (!assessment) throw new DomainError(404, "NOT_FOUND", "Assessment not found");

  const existing = await repo.findInProgressAttempt(userId, assessment.id);
  if (existing && existing.expiresAt && existing.expiresAt > new Date()) {
    throw new DomainError(409, "CONFLICT", "You already have an active attempt for this assessment");
  }

  const expiresAt = assessment.timeLimitMinutes
    ? new Date(Date.now() + assessment.timeLimitMinutes * 60 * 1000)
    : null;
  const attempt = await repo.insertAttempt(userId, assessment.id, expiresAt);

  return {
    attemptId: attempt.id,
    expiresAt: expiresAt?.toISOString() ?? null,
    timeLimitMinutes: assessment.timeLimitMinutes,
    questions: (assessment.questions ?? []).map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      points: q.points,
    })),
  };
}

export interface SubmitContext {
  env: LLMEnv | undefined;
  user: JwtPayload | null | undefined;
}

/** Grades a submitted attempt (auto-grade MC/TF, AI-grade short answer/code). */
export async function submitAssessmentAttempt(
  userId: string,
  attemptId: string,
  answers: Record<string, string | number>,
  ctx: SubmitContext,
  repo = new SkillAssessmentsRepository(),
) {
  const attempt = await repo.findOwnedAttempt(userId, attemptId);
  if (!attempt) throw new DomainError(404, "NOT_FOUND", "Attempt not found");
  if (attempt.status !== "in_progress") throw new DomainError(409, "CONFLICT", `Attempt is already ${attempt.status}`);
  if (attempt.expiresAt && attempt.expiresAt < new Date()) {
    await repo.markAttemptExpired(attempt.id);
    throw new DomainError(410, "GONE", "Assessment time limit exceeded");
  }

  const assessment = await repo.findById(attempt.assessmentId);
  if (!assessment) throw new DomainError(404, "NOT_FOUND", "Assessment not found");

  const questions: Question[] = assessment.questions ?? [];
  const gradingResults: GradingResults = {};
  let rawScore = 0;
  let totalPoints = 0;

  for (const q of questions) {
    totalPoints += q.points;
    // short_answer + code start ungraded; AI grading below may award points.
    const correct = (q.type === "multiple_choice" || q.type === "true_false")
      && String(answers[q.id]).toLowerCase() === String(q.correctAnswer).toLowerCase();
    const pts = correct ? q.points : 0;
    rawScore += pts;
    gradingResults[q.id] = { correct, points: pts };
  }

  let aiFeedback = "";
  const openQs = questions.filter((q) => q.type === "short_answer" || q.type === "code");
  if (hasAnyLLMProviderKey(ctx.env) && openQs.length > 0) {
    try {
      const gradingPrompt = `You are a technical skills grader. Grade these answers for the assessment "${assessment.title}":

${openQs.map((q) => `Q: ${q.prompt}\nExpected: ${q.correctAnswer ?? "(open ended)"}\nCandidateAnswer: ${String(answers[q.id] ?? "")}`).join("\n\n")}

Respond with JSON: { "grades": { "<questionId>": { "correct": boolean, "points": number, "feedback": string } }, "overallFeedback": string }
Max points per question: ${openQs.map((q) => `${q.id}: ${q.points}`).join(", ")}`;

      const llm = createLLMClient(ctx.env, ctx.user);
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

  await repo.markAttemptGraded(attempt.id, {
    answers,
    gradingResults,
    rawScore,
    totalPoints,
    percentageScore: String(percentageScore),
    passed,
    aiFeedback,
  });

  return {
    attemptId: attempt.id,
    percentageScore,
    rawScore,
    totalPoints,
    passed,
    aiFeedback,
    gradingResults,
    assessment: { title: assessment.title, passingScore: assessment.passingScore },
  };
}
