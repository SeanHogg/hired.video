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
export type SourceContext = "tool" | "ai-coach" | "career-360" | "pipeline";
export type AssignmentType = "assign" | "invite" | "self";

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
  targetRole: string | null;
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
  linkExpiryHours?: number;
  responseWindowHours?: number;
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
  },
): Promise<AssignmentResponse> {
  const res = await apiClient.post<AssignmentResponse>(
    `/api/interview-assignments/${id}/respond`,
    params,
  );
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

/** Build a /ai-coach?q=... URL that drops the candidate (or self-
 *  practicer) into the AI Coach with the questions pre-loaded as a
 *  practice script. Used by the tool's "Practice in AI Coach" button. */
export function buildAICoachPracticeHref(
  questions: GeneratedQuestion[],
  targetRole?: string | null,
): string {
  const lines = [
    "Run me through this interview practice set, one question at a time. After each of my answers give me STAR-method feedback and a 0–10 score, then move to the next question.",
  ];
  if (targetRole) lines.push(`I'm preparing for: ${targetRole}.`);
  lines.push(
    "Questions to ask me in order:",
    ...questions.map((q, i) => `${i + 1}. ${q.text}`),
  );
  return `/ai-coach?q=${encodeURIComponent(lines.join("\n\n"))}`;
}
