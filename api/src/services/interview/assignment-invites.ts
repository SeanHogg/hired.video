/**
 * Magic-link invite use cases: the PUBLIC sanitised preview
 * (GET /api/interview-assignments/invite/:token) and the job-seeker claim
 * (POST /api/interview-assignments/claim/:token).
 */
import { getDb } from "../../db/index.js";
import {
  findInterviewByInviteToken,
  updateInterview,
  type InterviewAssignmentRow,
} from "../../repositories/interviewAssignmentsRepository.js";
import { failWith, succeed, type AssignmentResult } from "./assignment-result.js";

const LINK_NOT_FOUND = failWith(404, "NOT_FOUND", "Interview link not found");

export interface InvitePreview {
  id: string;
  title: string;
  instructions: string | null;
  questionCount: number;
  questions: unknown;
  candidateEmail: string | null;
  assignmentType: string;
  candidateBound: boolean;
  deadline: Date | null;
  questionResponseDeadline: Date | null;
  inviteTokenExpiresAt: Date | null;
  status: string;
  expired: boolean;
  targetRole: string | null;
  prepTimeSec: number;
  maxRetakes: number;
  proctoringOn: boolean;
}

/** Enough for the landing page to render title + questions + the
 *  signup-vs-login affordance, without leaking response data. */
export function toInvitePreview(interview: InterviewAssignmentRow, now = Date.now()): InvitePreview {
  const expired =
    interview.inviteTokenExpiresAt !== null &&
    interview.inviteTokenExpiresAt !== undefined &&
    interview.inviteTokenExpiresAt.getTime() < now;
  return {
    id: interview.id,
    title: interview.title,
    instructions: interview.instructions,
    questionCount: Array.isArray(interview.questions) ? interview.questions.length : 0,
    questions: interview.questions, // full question list — the candidate needs to see them
    candidateEmail: interview.candidateEmail,
    assignmentType: interview.assignmentType ?? "assign",
    candidateBound: Boolean(interview.candidateId),
    deadline: interview.deadline,
    questionResponseDeadline: interview.questionResponseDeadline,
    inviteTokenExpiresAt: interview.inviteTokenExpiresAt,
    status: interview.status,
    expired,
    targetRole: interview.targetRole,
    // Recorder behaviour — drives prep timer, retake cap, proctoring flag.
    prepTimeSec: interview.prepTimeSec ?? 10,
    maxRetakes: interview.maxRetakes ?? 1,
    proctoringOn: interview.proctoringOn ?? true,
  };
}

export async function previewInterviewInvite(token: string): Promise<AssignmentResult<InvitePreview>> {
  const interview = await findInterviewByInviteToken(getDb(), token);
  if (!interview) return LINK_NOT_FOUND;
  return succeed(toInvitePreview(interview));
}

export interface ClaimInviteOutput {
  id: string;
  claimed: true;
  title: string;
  questions: unknown;
}

/** Binds candidate_id to the signed-in job seeker. Required before
 *  /respond will succeed on invite-type assignments. Role gate is on the route. */
export async function claimInterviewInvite(
  user: { sub: string; email?: string },
  token: string,
): Promise<AssignmentResult<ClaimInviteOutput>> {
  const db = getDb();
  const interview = await findInterviewByInviteToken(db, token);
  if (!interview) return LINK_NOT_FOUND;

  if (interview.inviteTokenExpiresAt && interview.inviteTokenExpiresAt.getTime() < Date.now()) {
    return failWith(410, "EXPIRED", "This invite link has expired");
  }

  // If already bound to another user, refuse — only the addressed
  // job_seeker can claim. (We compare by email so anyone with the link
  // who happens to be the addressed seeker can claim it; this is the
  // same model SendPulse / Calendly / Loom use for guest-link claims.)
  if (interview.candidateId && interview.candidateId !== user.sub) {
    return failWith(409, "ALREADY_CLAIMED", "This interview is already bound to another candidate");
  }
  if (
    interview.candidateEmail &&
    user.email &&
    interview.candidateEmail.toLowerCase() !== user.email.toLowerCase()
  ) {
    return failWith(
      403,
      "EMAIL_MISMATCH",
      "The invite was sent to a different email. Sign in with the address that received the invite.",
    );
  }

  await updateInterview(db, interview.id, { candidateId: user.sub, updatedAt: new Date() });

  return succeed({ id: interview.id, claimed: true as const, title: interview.title, questions: interview.questions });
}
