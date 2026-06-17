/**
 * Interview-assignments service — frontend client for /api/interview-assignments/*.
 *
 * Used by the InterviewQuestions tool, the Career360 "generate questions"
 * deep-link, the AI Coach tool-call handler, and the candidate-facing
 * /interview/:token page.
 */

import { apiClient } from "../api-client";

export interface ExtractedSkill {
  name: string;
  category: string;
  importance?: string;
  level?: string | null;
  yearsOfExperience?: number | null;
  evidenceLabels?: string[];
}

export interface GeneratedQuestion {
  id: string;
  text: string;
  category: "behavioral" | "technical" | "system-design" | "situational" | "role-fit";
  maxDurationSec: number;
  required: boolean;
  skillLinks: string[];
}

export type QuestionStyle = "behavioral" | "technical" | "mixed";
export type SourceContext = "tool" | "ai-coach" | "career-360" | "pipeline" | "job-screening";

/** Question-count choices offered by every generate surface. The backend
 *  clamps to 3–10; these are the values we expose in the picker. */
export const QUESTION_COUNT_OPTIONS = [3, 4, 5, 6, 7, 8, 10] as const;
export type AssignmentType = "assign" | "invite" | "self" | "screening";
export type InterviewDecision = "shortlist" | "maybe" | "reject";

/** Proctoring signals captured by the recorder + text-answer editor.
 *  These are advisory — the recruiter sees the counts on each answer
 *  but the platform never auto-rejects on them. */
export interface ProctoringFlags {
  tabBlurCount: number;
  pasteCount: number;
  copyCount: number;
  fullscreenExits: number;
  prepUsedSec: number;
  retakesUsed: number;
  micLevelAvg?: number;
  deviceLabel?: string;
}

export interface AnswerScoreBreakdown {
  situation: number;
  task: number;
  action: number;
  result: number;
  skillProbe: number;
}

export interface GenerateRequest {
  resumeId?: string;
  jobId?: string;
  content?: string;
  sourceType?: "job" | "resume";
  targetRole?: string;
  seniority?: string;
  style?: QuestionStyle;
  count?: number;
  sourceContext?: SourceContext;
}

export interface GenerateResponse {
  skills: ExtractedSkill[];
  questions: GeneratedQuestion[];
  sourceContext: SourceContext;
  sourceResumeId: string | null;
  sourceJobId: string | null;
  /** Effective target role used by the LLM — falls back to JD title /
   *  resume most-recent role when the user didn't enter one. */
  targetRole: string | null;
  /** Human-readable provenance for the AI Coach hand-off prompt
   *  (e.g. "the JD for Director, Vehicle Cloud at Ford"). */
  sourceDescription: string | null;
}

export interface AssignRequest {
  candidateEmail: string;
  title: string;
  instructions?: string;
  questions: GeneratedQuestion[];
  jobId?: string;
  sourceResumeId?: string;
  sourceContext?: SourceContext;
  targetRole?: string;
  extractedSkills?: ExtractedSkill[];
  /** Reusable library set this assignment was created from. */
  questionSetId?: string;
  linkExpiryHours?: number;
  responseWindowHours?: number;
  /** Recorder behaviour applied to every question. */
  prepTimeSec?: number;
  maxRetakes?: number;
  proctoringOn?: boolean;
}

export interface AssignResponse {
  id: string;
  inviteToken: string;
  inviteUrl: string;
  assignmentType: AssignmentType;
  inviteTokenExpiresAt: string;
  questionResponseDeadline: string;
  candidateBound: boolean;
}

export interface InterviewAssignmentRow {
  id: string;
  recruiterId: string;
  candidateId: string | null;
  candidateEmail: string | null;
  jobId: string | null;
  title: string;
  instructions: string | null;
  questions: GeneratedQuestion[];
  deadline: string | null;
  status: string;
  inviteToken: string | null;
  inviteTokenExpiresAt: string | null;
  questionResponseDeadline: string | null;
  resendCount: number;
  lastResentAt: string | null;
  sourceResumeId: string | null;
  sourceContext: string | null;
  targetRole: string | null;
  extractedSkills: ExtractedSkill[] | null;
  assignmentType: AssignmentType | null;
  // Question-set provenance + apply-flow link (0120).
  questionSetId: string | null;
  applicationId: string | null;
  // Recruiter decision pillar.
  decision: InterviewDecision | null;
  decisionReason: string | null;
  decisionBy: string | null;
  decisionAt: string | null;
  // AI overall aggregate.
  aiOverallScore: number | null;
  aiOverallSummary: string | null;
  aiScoredAt: string | null;
  // Recorder behaviour.
  prepTimeSec: number;
  maxRetakes: number;
  proctoringOn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentResponse {
  id: string;
  interviewId: string;
  candidateId: string;
  questionId: string;
  recordingId: string | null;
  videoUrl: string | null;
  videoKey: string | null;
  durationMs: number | null;
  transcription: string | null;
  textAnswer: string | null;
  responseMode: "text" | "video";
  status: string;
  // 0120: AI scoring + proctoring + retake.
  aiScore: number | null;
  aiScoreBreakdown: AnswerScoreBreakdown | null;
  aiSummary: string | null;
  aiStrengths: string[] | null;
  aiConcerns: string[] | null;
  aiScoredAt: string | null;
  proctoringFlags: ProctoringFlags;
  attempt: number;
  createdAt: string;
}

export interface InvitePreview {
  id: string;
  title: string;
  instructions: string | null;
  questionCount: number;
  questions: GeneratedQuestion[];
  candidateEmail: string | null;
  assignmentType: AssignmentType;
  candidateBound: boolean;
  deadline: string | null;
  questionResponseDeadline: string | null;
  inviteTokenExpiresAt: string | null;
  status: string;
  expired: boolean;
  targetRole: string | null;
  // Recorder behaviour (0120) — drives prep timer + retake button + proctoring overlay.
  prepTimeSec: number;
  maxRetakes: number;
  proctoringOn: boolean;
}

export async function generateInterviewQuestions(
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const res = await apiClient.post<GenerateResponse>("/api/interview-assignments/generate", req);
  return res.data;
}

export async function assignInterview(req: AssignRequest): Promise<AssignResponse> {
  const res = await apiClient.post<AssignResponse>("/api/interview-assignments/assign", req);
  return res.data;
}

export async function resendInterviewInvite(
  id: string,
): Promise<{
  id: string;
  inviteToken: string;
  inviteUrl: string;
  inviteTokenExpiresAt: string;
  resendCount: number;
}> {
  const res = await apiClient.post<{
    id: string;
    inviteToken: string;
    inviteUrl: string;
    inviteTokenExpiresAt: string;
    resendCount: number;
  }>(`/api/interview-assignments/${id}/resend`, {});
  return res.data;
}

export async function listMyInterviewAssignments(): Promise<{
  createdByMe: InterviewAssignmentRow[];
  assignedToMe: InterviewAssignmentRow[];
}> {
  const res = await apiClient.get<{
    createdByMe: InterviewAssignmentRow[];
    assignedToMe: InterviewAssignmentRow[];
  }>("/api/interview-assignments/mine");
  return res.data;
}

export async function getInterviewAssignment(
  id: string,
): Promise<{
  interview: InterviewAssignmentRow;
  responses: AssignmentResponse[];
  viewerRole: "creator" | "candidate";
}> {
  const res = await apiClient.get<{
    interview: InterviewAssignmentRow;
    responses: AssignmentResponse[];
    viewerRole: "creator" | "candidate";
  }>(`/api/interview-assignments/${id}`);
  return res.data;
}

export async function submitInterviewResponse(
  id: string,
  params: {
    questionId: string;
    responseMode: "text" | "video";
    textAnswer?: string;
    recordingId?: string;
    videoUrl?: string;
    durationMs?: number;
    transcription?: string;
    proctoringFlags?: Partial<ProctoringFlags>;
    attempt?: number;
  },
): Promise<AssignmentResponse> {
  const res = await apiClient.post<AssignmentResponse>(
    `/api/interview-assignments/${id}/respond`,
    params,
  );
  return res.data;
}

export async function scoreSingleAnswer(
  interviewId: string,
  responseId: string,
): Promise<AssignmentResponse> {
  const res = await apiClient.post<AssignmentResponse>(
    `/api/interview-assignments/${interviewId}/responses/${responseId}/score`,
    {},
  );
  return res.data;
}

export async function scoreAllAnswers(
  interviewId: string,
): Promise<{ scoredCount: number; overall: number; coverage: number }> {
  const res = await apiClient.post<{ scoredCount: number; overall: number; coverage: number }>(
    `/api/interview-assignments/${interviewId}/score-all`,
    {},
  );
  return res.data;
}

export async function setInterviewDecision(
  interviewId: string,
  decision: InterviewDecision | null,
  reason?: string,
): Promise<InterviewAssignmentRow> {
  const res = await apiClient.post<InterviewAssignmentRow>(
    `/api/interview-assignments/${interviewId}/decision`,
    { decision, reason },
  );
  return res.data;
}

export interface InterviewReport {
  interview: InterviewAssignmentRow;
  responses: AssignmentResponse[];
  candidate: { id: string; name: string | null; email: string | null } | null;
  viewerRole: "creator" | "candidate";
}

export async function getInterviewReport(interviewId: string): Promise<InterviewReport> {
  const res = await apiClient.get<InterviewReport>(
    `/api/interview-assignments/${interviewId}/report`,
  );
  return res.data;
}

export async function compareInterviews(ids: string[]): Promise<{
  interviews: Array<{ interview: InterviewAssignmentRow; responses: AssignmentResponse[] }>;
}> {
  const res = await apiClient.get<{
    interviews: Array<{ interview: InterviewAssignmentRow; responses: AssignmentResponse[] }>;
  }>(`/api/interview-assignments/compare?ids=${encodeURIComponent(ids.join(","))}`);
  return res.data;
}

export async function finalizeInterviewAssignment(id: string): Promise<void> {
  await apiClient.post(`/api/interview-assignments/${id}/submit`, {});
}

export async function getInterviewInvitePreview(token: string): Promise<InvitePreview> {
  const res = await apiClient.get<InvitePreview>(`/api/interview-assignments/invite/${token}`);
  return res.data;
}

export async function claimInterviewInvite(token: string): Promise<{
  id: string;
  claimed: boolean;
  title: string;
  questions: GeneratedQuestion[];
}> {
  const res = await apiClient.post<{
    id: string;
    claimed: boolean;
    title: string;
    questions: GeneratedQuestion[];
  }>(`/api/interview-assignments/claim/${token}`, {});
  return res.data;
}

export interface PracticeHandoff {
  questions: GeneratedQuestion[];
  targetRole?: string | null;
  seniority?: string | null;
  style?: QuestionStyle | null;
  sourceDescription?: string | null;
  skills?: ExtractedSkill[];
}

/** The durable session context (role / seniority / style / source / skills)
 *  for a practice hand-off, as the bullet block the AI Coach pins in its
 *  system prompt. Empty string when the hand-off carries no context. */
function buildPracticeContext(handoff: PracticeHandoff): string {
  const { targetRole, seniority, style, sourceDescription, skills } = handoff;
  const contextLines: string[] = [];
  if (targetRole) contextLines.push(`- Target role: ${targetRole}`);
  if (seniority) contextLines.push(`- Seniority: ${seniority}`);
  if (style) contextLines.push(`- Style: ${style}`);
  if (sourceDescription) contextLines.push(`- Generated from: ${sourceDescription}`);
  if (skills && skills.length > 0) {
    contextLines.push(`- Skills probed: ${skills.slice(0, 10).map((s) => s.name).join(", ")}`);
  }
  return contextLines.length > 0
    ? `Interview practice session:\n${contextLines.join("\n")}`
    : "";
}

/** Build a /ai-coach?q=...&ctx=... URL that drops the candidate (or self-
 *  practicer) into the AI Coach with the full generator context, so the
 *  coach can begin Q1 without re-asking for role / seniority / source.
 *  Used by the tool's "Practise in AI Coach" button.
 *
 *  #971: the durable context rides a separate `ctx` param so the AI Coach
 *  pins it in the SYSTEM prompt (never compacted) — only the questions +
 *  kickoff instruction go in `q` (the first user message). Previously the
 *  whole block was the first user message and evaporated after a few turns
 *  of server-side history compaction. */
export function buildAICoachPracticeHref(handoff: PracticeHandoff): string {
  const { questions } = handoff;
  const context = buildPracticeContext(handoff);

  const lines = [
    "I'm starting an interview practice session — please run me through the questions below in order, one at a time. After each of my answers, give me STAR-method feedback and a 0–10 score, then move to the next question.",
    "DO NOT ask me for additional context — everything you need is supplied (the session context is pinned above). Begin with Question 1.",
    "Questions (ask in this exact order):\n" +
      questions.map((q, i) => `${i + 1}. ${q.text}`).join("\n"),
  ];
  const ctxParam = context ? `&ctx=${encodeURIComponent(context)}` : "";
  return `/ai-coach?q=${encodeURIComponent(lines.join("\n\n"))}${ctxParam}`;
}
