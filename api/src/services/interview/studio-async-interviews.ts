/**
 * Legacy studio async-interview use cases behind /api/studio/async-interview*
 * (routes/studio-features/async-interviews.ts): create, invite view, answer,
 * submit, recruiter list + responses. The richer assignment flow lives in
 * assignment-lifecycle.ts; both share interviewAssignmentsRepository.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import {
  findInterviewById,
  findInterviewByInviteToken,
  findInterviewForCreator,
  insertInterview,
  insertResponse,
  listInterviewsCreatedBy,
  listResponsesForInterview,
  markCandidateResponsesSubmitted,
  updateInterview,
  type InterviewAssignmentRow,
  type InterviewResponseRow,
} from "../../repositories/interviewAssignmentsRepository.js";

/** The recruiter list on this legacy surface has always been 50 rows. */
const STUDIO_ASYNC_LIST_LIMIT = 50;

const notFound = () => new DomainError(404, "NOT_FOUND", "Interview not found");
const expired = () => new DomainError(410, "EXPIRED", "Interview has expired");

export interface CreateStudioAsyncInterviewInput {
  title: string;
  instructions?: string;
  candidateEmail?: string;
  candidateId?: string;
  jobId?: string;
  questions: unknown[];
  deadline?: string;
}

export async function createStudioAsyncInterview(recruiterId: string, input: CreateStudioAsyncInterviewInput) {
  const inviteToken = crypto.randomUUID();
  const interview = await insertInterview(getDb(), {
    recruiterId,
    candidateId: input.candidateId ?? null,
    candidateEmail: input.candidateEmail ?? null,
    jobId: input.jobId ?? null,
    title: input.title,
    instructions: input.instructions ?? null,
    questions: input.questions,
    deadline: input.deadline ? new Date(input.deadline) : null,
    inviteToken,
    status: "pending",
  });
  return {
    id: interview.id,
    inviteToken,
    inviteUrl: `https://hired.video/interview/${inviteToken}`,
    status: "pending" as const,
  };
}

/** Candidate-facing view of an invite; 404 unknown, 410 expired. */
export async function getStudioAsyncInvite(token: string) {
  const interview = await findInterviewByInviteToken(getDb(), token);
  if (!interview) throw notFound();
  if (interview.status === "expired") throw expired();
  return {
    id: interview.id,
    title: interview.title,
    instructions: interview.instructions,
    questions: interview.questions,
    deadline: interview.deadline,
    status: interview.status,
  };
}

export interface StudioAsyncResponseInput {
  questionId: string;
  recordingId?: string;
  videoUrl?: string;
  transcription?: string;
  durationMs?: number;
}

/** Record one answer and move the interview to in_progress. Unknown
 *  interviews answer 404 and expired ones 410 (same rule as the invite view)
 *  instead of writing an orphan response. */
export async function respondToStudioAsyncInterview(
  candidateId: string,
  interviewId: string,
  input: StudioAsyncResponseInput,
): Promise<InterviewResponseRow> {
  if (!UUID_LIKE_REGEX.test(interviewId)) throw notFound();
  const db = getDb();
  const interview = await findInterviewById(db, interviewId);
  if (!interview) throw notFound();
  if (interview.status === "expired") throw expired();

  const response = await insertResponse(db, {
    interviewId,
    candidateId,
    questionId: input.questionId,
    recordingId: input.recordingId ?? null,
    videoUrl: input.videoUrl ?? null,
    durationMs: input.durationMs ?? null,
    transcription: input.transcription ?? null,
    status: "recorded",
  });
  await updateInterview(db, interviewId, { status: "in_progress", updatedAt: new Date() });
  return response;
}

/** Mark the caller's answers submitted. The interview itself only flips to
 *  "submitted" when the caller actually answered it — a stranger can no
 *  longer change someone else's interview status. */
export async function submitStudioAsyncInterview(candidateId: string, interviewId: string) {
  const db = getDb();
  const answered = await markCandidateResponsesSubmitted(db, interviewId, candidateId);
  if (answered > 0) {
    await updateInterview(db, interviewId, { status: "submitted", updatedAt: new Date() });
  }
  return { status: "submitted" as const };
}

export function listStudioAsyncInterviews(recruiterId: string): Promise<InterviewAssignmentRow[]> {
  return listInterviewsCreatedBy(getDb(), recruiterId, { limit: STUDIO_ASYNC_LIST_LIMIT });
}

/** The recruiter's interview and its responses (oldest first); 404 when the
 *  caller did not create it. */
export async function getStudioAsyncInterviewResponses(recruiterId: string, interviewId: string) {
  const db = getDb();
  const interview = await findInterviewForCreator(db, interviewId, recruiterId);
  if (!interview) throw notFound();
  const responses = await listResponsesForInterview(db, interviewId, { ordered: true });
  return { interview, responses };
}
