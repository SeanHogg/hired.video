/**
 * Interview-assignment lifecycle use cases behind /api/interview-assignments:
 * assign (create + email magic link), resend, list mine, detail, answer one
 * question, submit. Authorization by ownership lives here; role gates stay
 * on the routes.
 */
import { getDb } from "../../db/index.js";
import type { Env } from "../../types/index.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import { randomHex } from "../../utils/crypto.js";
import {
  findCandidateAnswer,
  findInterviewById,
  findInterviewForCreator,
  findUserByExactEmail,
  insertInterview,
  insertResponse,
  listInterviewsAssignedTo,
  listInterviewsCreatedBy,
  listResponsesForInterview,
  markCandidateResponsesSubmitted,
  rotateInviteToken,
  updateInterview,
  updateResponse,
  type InterviewAssignmentRow,
  type InterviewResponseRow,
} from "../../repositories/interviewAssignmentsRepository.js";
import { transcribeResponseInBackground } from "./transcribe-response.js";
import { interviewInviteUrl, sendInterviewInviteEmail, type InviteAssignmentType } from "./assignment-invite-email.js";
import { failWith, succeed, INTERVIEW_NOT_FOUND, type AssignmentResult } from "./assignment-result.js";

const HOUR_MS = 3_600_000;
/** Magic-link lifetime applied on resend. */
const RESEND_LINK_TTL_MS = 7 * 24 * HOUR_MS;

// ─── Assign ─────────────────────────────────────────────────────────────────

export interface AssignInterviewInput {
  candidateEmail: string;
  title: string;
  instructions?: string;
  questions: unknown[];
  jobId?: string;
  sourceResumeId?: string;
  sourceContext: string;
  targetRole?: string;
  extractedSkills?: unknown[];
  questionSetId?: string;
  linkExpiryHours: number;
  responseWindowHours: number;
  prepTimeSec: number;
  maxRetakes: number;
  proctoringOn: boolean;
}

export interface AssignInterviewOutput {
  id: string;
  inviteToken: string;
  inviteUrl: string;
  assignmentType: "assign" | "invite";
  inviteTokenExpiresAt: string;
  questionResponseDeadline: string;
  candidateBound: boolean;
}

/** Strict for assign: existing job_seeker matched → assignment_type=assign.
 *  Lenient for invite: no matching user → assignment_type=invite. */
export async function assignInterview(
  recruiterId: string,
  input: AssignInterviewInput,
): Promise<AssignmentResult<AssignInterviewOutput>> {
  const db = getDb();
  const email = input.candidateEmail.toLowerCase().trim();

  const candidateRow = await findUserByExactEmail(db, email);
  const candidateExistsAsJobSeeker = candidateRow !== null && candidateRow.role === USER_ROLES.JOB_SEEKER;
  const assignmentType: "assign" | "invite" = candidateExistsAsJobSeeker ? "assign" : "invite";

  if (candidateRow && !candidateExistsAsJobSeeker) {
    // Email matches a non-seeker (recruiter / employer / admin). Refuse — a
    // recruiter shouldn't be assigning interviews to other recruiters, and
    // promoting their role on a magic-link claim would be a privilege
    // escalation surprise.
    return failWith(
      400,
      "INVALID_CANDIDATE_ROLE",
      "That email belongs to a non-job-seeker account. Interview assignments can only go to job seekers.",
    );
  }

  const token = randomHex(24);
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + input.linkExpiryHours * HOUR_MS);
  const responseDeadline = new Date(now.getTime() + input.responseWindowHours * HOUR_MS);

  const created = await insertInterview(db, {
    recruiterId,
    candidateId: candidateExistsAsJobSeeker ? candidateRow.id : null,
    candidateEmail: email,
    jobId: input.jobId ?? null,
    title: input.title,
    instructions: input.instructions ?? null,
    questions: input.questions,
    deadline: responseDeadline,
    status: "pending",
    inviteToken: token,
    inviteTokenExpiresAt: tokenExpiresAt,
    questionResponseDeadline: responseDeadline,
    sourceResumeId: input.sourceResumeId ?? null,
    sourceContext: input.sourceContext,
    targetRole: input.targetRole ?? null,
    extractedSkills: input.extractedSkills ?? null,
    assignmentType,
    questionSetId: input.questionSetId ?? null,
    prepTimeSec: input.prepTimeSec,
    maxRetakes: input.maxRetakes,
    proctoringOn: input.proctoringOn,
  });

  await sendInterviewInviteEmail({
    to: email,
    recipientName: candidateRow?.name?.split(/\s+/)[0] ?? "there",
    token,
    title: input.title,
    expiresAt: tokenExpiresAt,
    assignmentType,
  });

  return succeed({
    id: created.id,
    inviteToken: token,
    inviteUrl: interviewInviteUrl(token),
    assignmentType,
    inviteTokenExpiresAt: tokenExpiresAt.toISOString(),
    questionResponseDeadline: responseDeadline.toISOString(),
    candidateBound: candidateExistsAsJobSeeker,
  });
}

// ─── Resend ─────────────────────────────────────────────────────────────────

export interface ResendInviteOutput {
  id: string;
  inviteToken: string;
  inviteUrl: string;
  inviteTokenExpiresAt: string;
  resendCount: number;
}

export async function resendInterviewInvite(
  recruiterId: string,
  id: string,
): Promise<AssignmentResult<ResendInviteOutput>> {
  const db = getDb();
  const interview = await findInterviewForCreator(db, id, recruiterId);
  if (!interview) return INTERVIEW_NOT_FOUND;
  if (interview.status === "submitted" || interview.status === "reviewed") {
    return failWith(400, "INVALID_STATE", "Interview already submitted");
  }
  if (!interview.candidateEmail) {
    return failWith(400, "NO_EMAIL", "This interview has no candidate email on file");
  }

  // Reset the magic link clock; question response deadline is left alone
  // so the recruiter can extend without re-mailing if they want.
  const newToken = randomHex(24);
  const tokenExpiresAt = new Date(Date.now() + RESEND_LINK_TTL_MS);
  const updated = await rotateInviteToken(db, id, {
    token: newToken,
    expiresAt: tokenExpiresAt,
    // If status was 'expired', un-expire it — the recruiter just unblocked the candidate.
    status: interview.status === "expired" ? "pending" : interview.status,
  });

  await sendInterviewInviteEmail({
    to: interview.candidateEmail,
    recipientName: "there",
    token: newToken,
    title: interview.title,
    expiresAt: tokenExpiresAt,
    assignmentType: (interview.assignmentType as InviteAssignmentType) ?? "assign",
    isResend: true,
  });

  return succeed({
    id: updated.id,
    inviteToken: newToken,
    inviteUrl: interviewInviteUrl(newToken),
    inviteTokenExpiresAt: tokenExpiresAt.toISOString(),
    resendCount: updated.resendCount,
  });
}

// ─── Mine / detail ──────────────────────────────────────────────────────────

export async function listMyInterviews(
  userId: string,
  email: string | undefined,
): Promise<{ createdByMe: InterviewAssignmentRow[]; assignedToMe: InterviewAssignmentRow[] }> {
  const db = getDb();
  const [createdByMe, assignedToMe] = await Promise.all([
    listInterviewsCreatedBy(db, userId),
    listInterviewsAssignedTo(db, userId, email ?? ""),
  ]);
  return { createdByMe, assignedToMe };
}

export type ViewerRole = "creator" | "candidate";

/** Creator OR bound candidate may read; anyone else gets 403. */
export function viewerRoleFor(interview: InterviewAssignmentRow, userId: string): ViewerRole | null {
  if (interview.recruiterId === userId) return "creator";
  if (interview.candidateId === userId) return "candidate";
  return null;
}

export async function getInterviewDetail(
  userId: string,
  id: string,
): Promise<AssignmentResult<{ interview: InterviewAssignmentRow; responses: InterviewResponseRow[]; viewerRole: ViewerRole }>> {
  const db = getDb();
  const interview = await findInterviewById(db, id);
  if (!interview) return INTERVIEW_NOT_FOUND;
  const viewerRole = viewerRoleFor(interview, userId);
  if (!viewerRole) return failWith(403, "FORBIDDEN", "Not your interview");
  const responses = await listResponsesForInterview(db, id, { ordered: true });
  return succeed({ interview, responses, viewerRole });
}

// ─── Respond / submit (candidate) ───────────────────────────────────────────

export interface RecordAnswerInput {
  questionId: string;
  responseMode: "text" | "video";
  textAnswer?: string;
  recordingId?: string;
  videoUrl?: string;
  durationMs?: number;
  transcription?: string;
  proctoringFlags?: Record<string, unknown>;
  attempt?: number;
}

const NOT_ASSIGNED_TO_YOU = failWith(403, "FORBIDDEN", "This interview was not assigned to you");

export async function recordInterviewAnswer(
  env: Env,
  candidateId: string,
  id: string,
  input: RecordAnswerInput,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<AssignmentResult<InterviewResponseRow>> {
  const db = getDb();
  const interview = await findInterviewById(db, id);
  if (!interview) return INTERVIEW_NOT_FOUND;
  if (interview.candidateId !== candidateId) return NOT_ASSIGNED_TO_YOU;
  if (interview.questionResponseDeadline && interview.questionResponseDeadline.getTime() < Date.now()) {
    return failWith(410, "EXPIRED", "The response window for this interview has closed");
  }
  if (input.responseMode === "text" && !input.textAnswer?.trim()) {
    return failWith(400, "VALIDATION_ERROR", "textAnswer is required for text responses");
  }
  if (input.responseMode === "video" && !input.videoUrl && !input.recordingId) {
    return failWith(400, "VALIDATION_ERROR", "videoUrl or recordingId is required for video responses");
  }

  // Upsert by (interview, candidate, question) so a candidate can re-record.
  const existing = await findCandidateAnswer(db, { interviewId: id, candidateId, questionId: input.questionId });

  // Cap attempt against the interview's maxRetakes. attempts > maxRetakes+1
  // are silently coerced so a misbehaving client can't claim "this is take 9"
  // and trick the recruiter UI into showing inflated retake counts.
  const allowedAttempts = Math.max(1, (interview.maxRetakes ?? 1) + 1);
  const attempt = Math.min(input.attempt ?? (existing ? (existing.attempt ?? 1) + 1 : 1), allowedAttempts);

  const answerFields = {
    recordingId: input.recordingId ?? null,
    videoUrl: input.videoUrl ?? null,
    durationMs: input.durationMs ?? null,
    transcription: input.transcription ?? null,
    textAnswer: input.textAnswer ?? null,
    responseMode: input.responseMode,
    attempt,
    status: "recorded",
  };

  const saved = existing
    ? await updateResponse(db, existing.id, {
        ...answerFields,
        proctoringFlags: input.proctoringFlags ?? existing.proctoringFlags ?? {},
        // A re-record invalidates the previous AI score — clear so the
        // recruiter knows the saved AI verdict is stale.
        aiScore: null,
        aiScoreBreakdown: null,
        aiSummary: null,
        aiStrengths: null,
        aiConcerns: null,
        aiScoredAt: null,
      })
    : await insertResponse(db, {
        ...answerFields,
        interviewId: id,
        candidateId,
        questionId: input.questionId,
        proctoringFlags: input.proctoringFlags ?? {},
      });

  await updateInterview(db, id, { status: "in_progress", updatedAt: new Date() });

  // #1238: fire-and-forget transcription on video responses. Caller never
  // waits; recruiter polls `transcriptionStatus` on the row to know.
  if (input.responseMode === "video" && saved.videoUrl) {
    transcribeResponseInBackground(env, db, { responseId: saved.id, videoUrl: saved.videoUrl }, waitUntil);
  }

  return succeed(saved);
}

export async function submitInterview(
  candidateId: string,
  id: string,
): Promise<AssignmentResult<{ status: "submitted" }>> {
  const db = getDb();
  const interview = await findInterviewById(db, id);
  if (!interview) return INTERVIEW_NOT_FOUND;
  if (interview.candidateId !== candidateId) return NOT_ASSIGNED_TO_YOU;

  await markCandidateResponsesSubmitted(db, id, candidateId);
  await updateInterview(db, id, { status: "submitted", updatedAt: new Date() });
  return succeed({ status: "submitted" as const });
}
