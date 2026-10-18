/**
 * Self-serve mock-interview practice use cases behind /api/interview:
 * session CRUD, answer capture (optional video upload), feedback save,
 * completion scoring, share links and the public share view. Ownership
 * checks live here; usage enforcement + metering stay on the route.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { cdnUrl } from "../../utils/cdn.js";
import { randomHex } from "../../utils/crypto.js";
import { putObject } from "../storage/object-store.js";
import {
  deleteInterviewSessionWithAnswers,
  findInterviewAnswerForUser,
  findInterviewSessionForUser,
  findSharedInterviewSession,
  insertInterviewAnswer,
  insertInterviewSession,
  listInterviewAnswersForSession,
  listInterviewSessionsForUser,
  listPublicInterviewAnswers,
  updateInterviewAnswer,
  updateInterviewSession,
  type InterviewAnswerRow,
  type InterviewSessionRow,
} from "../../repositories/interviewPracticeRepository.js";
import type { PracticeFeedback } from "./practice-ai.js";

const sessionNotFound = () => new DomainError(404, "NOT_FOUND", "Session not found");

async function requireOwnedSession(sessionId: string, userId: string): Promise<InterviewSessionRow> {
  const session = await findInterviewSessionForUser(getDb(), sessionId, userId);
  if (!session) throw sessionNotFound();
  return session;
}

/** Mean of the scored answers rounded to one decimal, or null when none are scored. */
function averageScore(answers: Array<{ score: string | null }>): number | null {
  const scored = answers.filter((a) => a.score !== null);
  if (scored.length === 0) return null;
  const avg = scored.reduce((sum, a) => sum + parseFloat(a.score!), 0) / scored.length;
  return Math.round(avg * 10) / 10;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export interface CreatePracticeSessionInput {
  jobDescription: string;
  interviewType: string;
  questions: unknown[];
}

export function createPracticeSession(userId: string, input: CreatePracticeSessionInput): Promise<InterviewSessionRow> {
  return insertInterviewSession(getDb(), {
    userId,
    jobDescription: input.jobDescription,
    interviewType: input.interviewType,
    questions: input.questions,
    status: "active",
  });
}

export function listPracticeSessions(userId: string): Promise<InterviewSessionRow[]> {
  return listInterviewSessionsForUser(getDb(), userId);
}

export async function getPracticeSession(
  sessionId: string,
  userId: string,
): Promise<InterviewSessionRow & { answers: InterviewAnswerRow[] }> {
  const session = await requireOwnedSession(sessionId, userId);
  const answers = await listInterviewAnswersForSession(getDb(), sessionId);
  return { ...session, answers };
}

/** Marks the session completed with the mean of its scored answers. */
export async function completePracticeSession(
  sessionId: string,
  userId: string,
): Promise<Partial<InterviewSessionRow> & { answers: InterviewAnswerRow[] }> {
  await requireOwnedSession(sessionId, userId);
  const db = getDb();
  const answers = await listInterviewAnswersForSession(db, sessionId);
  const avg = averageScore(answers);
  const overallScore = avg !== null ? String(avg) : null;
  const updated = await updateInterviewSession(db, sessionId, { status: "completed", overallScore });
  return { ...updated, answers };
}

export async function deletePracticeSession(sessionId: string, userId: string): Promise<void> {
  await requireOwnedSession(sessionId, userId);
  await deleteInterviewSessionWithAnswers(getDb(), sessionId);
}

/** Public share link for the session; reuses the existing token when already shared. */
export async function sharePracticeSession(
  sessionId: string,
  userId: string,
): Promise<{ shareToken: string; shareUrl: string }> {
  const session = await requireOwnedSession(sessionId, userId);
  if (session.shareToken && session.isShared) {
    return { shareToken: session.shareToken, shareUrl: `/interview/shared/${session.shareToken}` };
  }
  // Random share token: 16 bytes → 32 hex chars.
  const shareToken = randomHex(16);
  await updateInterviewSession(getDb(), sessionId, { shareToken, isShared: true });
  return { shareToken, shareUrl: `/interview/shared/${shareToken}` };
}

/** Sanitised public summary — no user id, no raw transcript, no video URLs. */
export async function getSharedPracticeSession(shareToken: string) {
  const db = getDb();
  const session = await findSharedInterviewSession(db, shareToken);
  if (!session) throw new DomainError(404, "NOT_FOUND", "Session not found or not shared");

  const answers = await listPublicInterviewAnswers(db, session.id);
  const avgScore = averageScore(answers);

  return {
    id: session.id,
    interviewType: session.interviewType,
    questionCount: Array.isArray(session.questions) ? session.questions.length : 0,
    answeredCount: answers.length,
    overallScore: session.overallScore ?? (avgScore !== null ? String(avgScore) : null),
    status: session.status,
    completedAt: session.updatedAt,
    answers: answers.map((a) => ({
      question: a.question,
      score: a.score,
      feedbackSummary: (a.feedback as { summary?: string } | null)?.summary ?? null,
    })),
  };
}

// ─── Answers ────────────────────────────────────────────────────────────────

/** 404 unless the session exists and `userId` owns it. */
export async function assertOwnsPracticeSession(sessionId: string, userId: string): Promise<void> {
  await requireOwnedSession(sessionId, userId);
}

export interface SavePracticeAnswerInput {
  questionId: string;
  question: string;
  transcript?: string;
  videoUrl?: string;
  r2Key?: string;
}

/** Stores the optional recording in object storage, then inserts the answer. */
export async function savePracticeAnswer(
  sessionId: string,
  userId: string,
  fields: SavePracticeAnswerInput,
  videoFile: File | null,
): Promise<InterviewAnswerRow> {
  let r2Key: string | null = null;
  let videoUrl: string | null = null;

  if (videoFile && typeof videoFile.arrayBuffer === "function") {
    const key = `interview/${userId}/${sessionId}/${fields.questionId}-${Date.now()}.webm`;
    const bytes = await videoFile.arrayBuffer();
    if (await putObject(key, bytes, videoFile.type || "video/webm", { userId, sessionId })) {
      r2Key = key;
      videoUrl = cdnUrl(key);
    }
  }

  return insertInterviewAnswer(getDb(), {
    sessionId,
    userId,
    questionId: fields.questionId,
    question: fields.question,
    transcript: fields.transcript ?? null,
    videoUrl: videoUrl ?? fields.videoUrl ?? null,
    r2Key: r2Key ?? fields.r2Key ?? null,
  });
}

export async function getOwnedPracticeAnswer(answerId: string, userId: string): Promise<InterviewAnswerRow> {
  const answer = await findInterviewAnswerForUser(getDb(), answerId, userId);
  if (!answer) throw new DomainError(404, "NOT_FOUND", "Answer not found");
  return answer;
}

export function savePracticeFeedback(
  answerId: string,
  feedback: PracticeFeedback,
  transcript: string,
): Promise<InterviewAnswerRow | undefined> {
  return updateInterviewAnswer(getDb(), answerId, {
    score: String(feedback.score),
    feedback,
    transcript,
  });
}
