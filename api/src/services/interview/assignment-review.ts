/**
 * Recruiter review use cases for interview assignments: AI-score one answer
 * or all un-scored answers, record a shortlist/maybe/reject decision (and
 * propagate it to the linked job application), the combined report, and
 * the side-by-side compare. Role gates live on the routes; creator
 * ownership is enforced here.
 */
import { getDb, type Db } from "../../db/index.js";
import type { Env, JwtPayload } from "../../types/index.js";
import {
  findCandidateSummary,
  findInterviewById,
  findInterviewForCreator,
  findInterviewsForCreator,
  findResponseOnInterview,
  listResponsesForInterview,
  listResponsesForInterviews,
  setJobApplicationStatus,
  updateInterview,
  updateResponse,
  type CandidateSummaryRow,
  type InterviewAssignmentRow,
  type InterviewResponseRow,
} from "../../repositories/interviewAssignmentsRepository.js";
import type { GeneratedQuestion } from "./question-generator.js";
import { scoreAnswer, aggregateScores } from "./answer-scorer.js";
import { mapDecisionToApplicationStatus, type InterviewDecision } from "./decision-status-map.js";
import { viewerRoleFor, type ViewerRole } from "./assignment-lifecycle.js";
import { failWith, succeed, INTERVIEW_NOT_FOUND, type AssignmentResult } from "./assignment-result.js";

function questionsOf(interview: InterviewAssignmentRow): GeneratedQuestion[] {
  return (interview.questions as GeneratedQuestion[]) ?? [];
}

function answerTextOf(response: InterviewResponseRow): string {
  return response.textAnswer?.trim() || response.transcription?.trim() || "";
}

/** Run the LLM scorer for one answer and persist the verdict on the row. */
async function scoreAndSave(
  db: Db,
  env: Env,
  user: JwtPayload,
  args: { interview: InterviewAssignmentRow; response: InterviewResponseRow; question: GeneratedQuestion; answerText: string },
): Promise<{ score: number; saved: InterviewResponseRow | null }> {
  const result = await scoreAnswer(env, user, {
    question: args.question.text,
    skillLinks: args.question.skillLinks,
    category: args.question.category,
    answerText: args.answerText,
    targetRole: args.interview.targetRole ?? undefined,
  });
  const saved = await updateResponse(db, args.response.id, {
    aiScore: result.score,
    aiScoreBreakdown: result.breakdown,
    aiSummary: result.summary,
    aiStrengths: result.strengths,
    aiConcerns: result.concerns,
    aiScoredAt: new Date(),
  });
  return { score: result.score, saved };
}

export async function scoreInterviewResponse(
  env: Env,
  user: JwtPayload,
  id: string,
  responseId: string,
): Promise<AssignmentResult<InterviewResponseRow | null>> {
  const db = getDb();
  const interview = await findInterviewForCreator(db, id, user.sub);
  if (!interview) return INTERVIEW_NOT_FOUND;

  const response = await findResponseOnInterview(db, id, responseId);
  if (!response) return failWith(404, "NOT_FOUND", "Response not found");

  // Locate the question the response is tied to so we can give the LLM
  // context (question text + skill probes + category).
  const question = questionsOf(interview).find((q) => q.id === response.questionId);
  if (!question) return failWith(404, "NOT_FOUND", "Question not found on interview");

  const answerText = answerTextOf(response);
  if (!answerText) return failWith(400, "NO_TRANSCRIPT", "No answer text or transcript on this response");

  const { saved } = await scoreAndSave(db, env, user, { interview, response, question, answerText });
  return succeed(saved);
}

export async function scoreAllInterviewResponses(
  env: Env,
  user: JwtPayload,
  id: string,
): Promise<AssignmentResult<{ scoredCount: number; overall: number; coverage: number }>> {
  const db = getDb();
  const interview = await findInterviewForCreator(db, id, user.sub);
  if (!interview) return INTERVIEW_NOT_FOUND;

  const responses = await listResponsesForInterview(db, id);
  const questions = questionsOf(interview);
  const questionById = new Map(questions.map((q) => [q.id, q]));

  let scoredCount = 0;
  const scoredRows: Array<{ score: number; required: boolean }> = [];

  for (const r of responses) {
    const q = questionById.get(r.questionId);
    if (!q) continue;
    const answerText = answerTextOf(r);
    if (!answerText) continue;

    // Skip if already scored — avoid burning LLM credits twice. Recruiter can
    // re-score one at a time via /responses/:rid/score if they really want.
    if (r.aiScoredAt) {
      if (typeof r.aiScore === "number") scoredRows.push({ score: r.aiScore, required: q.required });
      continue;
    }

    const { score } = await scoreAndSave(db, env, user, { interview, response: r, question: q, answerText });
    scoredCount += 1;
    scoredRows.push({ score, required: q.required });
  }

  // Roll up to an overall score on the interview row.
  const requiredQids = new Set(questions.filter((q) => q.required).map((q) => q.id));
  const allRows = responses
    .map((r) => ({ score: r.aiScore, required: requiredQids.has(r.questionId) }))
    .filter((r): r is { score: number; required: boolean } => r.score != null);
  // Merge in newly-scored rows from this run (the cached responses array is
  // pre-update, so include those too).
  for (const sr of scoredRows) allRows.push(sr);
  const { overall, coverage } = aggregateScores(allRows);

  await updateInterview(db, id, {
    aiOverallScore: overall,
    aiOverallSummary: `${coverage}% answer coverage; weighted average ${overall.toFixed(1)}/10`,
    aiScoredAt: new Date(),
    updatedAt: new Date(),
  });

  return succeed({ scoredCount, overall, coverage });
}

export async function decideInterview(
  recruiterId: string,
  id: string,
  input: { decision: InterviewDecision | null; reason?: string },
): Promise<AssignmentResult<InterviewAssignmentRow | null>> {
  const db = getDb();
  const interview = await findInterviewForCreator(db, id, recruiterId);
  if (!interview) return INTERVIEW_NOT_FOUND;

  const updated = await updateInterview(db, id, {
    decision: input.decision,
    decisionReason: input.reason ?? null,
    decisionBy: input.decision ? recruiterId : null,
    decisionAt: input.decision ? new Date() : null,
    status: input.decision ? "reviewed" : interview.status,
    updatedAt: new Date(),
  });

  // #1234: propagate the decision to the linked job_application row so the
  // pipeline view + recruiter dashboards reflect the screening outcome
  // without a second click. No-op when the interview was created ad-hoc
  // (assignment_type='assign' from the tool) and has no application_id.
  if (interview.applicationId) {
    await setJobApplicationStatus(db, interview.applicationId, mapDecisionToApplicationStatus(input.decision));
  }

  return succeed(updated);
}

export interface InterviewReport {
  interview: InterviewAssignmentRow;
  responses: InterviewResponseRow[];
  candidate: CandidateSummaryRow | null;
  viewerRole: ViewerRole;
}

export async function getInterviewReport(userId: string, id: string): Promise<AssignmentResult<InterviewReport>> {
  const db = getDb();
  const interview = await findInterviewById(db, id);
  if (!interview) return INTERVIEW_NOT_FOUND;
  const viewerRole = viewerRoleFor(interview, userId);
  if (!viewerRole) return failWith(403, "FORBIDDEN", "Not your interview");

  const responses = await listResponsesForInterview(db, id, { ordered: true });
  // Optional candidate lookup so the report carries a name on it. A join
  // would balloon the row width; one extra point read is cheap.
  const candidate = interview.candidateId ? await findCandidateSummary(db, interview.candidateId) : null;

  return succeed({ interview, responses, candidate, viewerRole });
}

/** Max interviews in one side-by-side compare. */
export const COMPARE_MAX_IDS = 6;

export async function compareInterviews(
  recruiterId: string,
  ids: string[],
): Promise<AssignmentResult<{ interviews: Array<{ interview: InterviewAssignmentRow; responses: InterviewResponseRow[] }> }>> {
  const db = getDb();
  const interviews = await findInterviewsForCreator(db, ids, recruiterId);
  if (interviews.length === 0) return failWith(404, "NOT_FOUND", "No matching interviews");

  // Pull responses for everything in a single query then bucket in memory —
  // far fewer round-trips than per-id selects.
  const responses = await listResponsesForInterviews(db, interviews.map((i) => i.id));
  const buckets = new Map<string, InterviewResponseRow[]>();
  for (const r of responses) {
    const bucket = buckets.get(r.interviewId) ?? [];
    bucket.push(r);
    buckets.set(r.interviewId, bucket);
  }

  return succeed({
    interviews: interviews.map((i) => ({ interview: i, responses: buckets.get(i.id) ?? [] })),
  });
}
