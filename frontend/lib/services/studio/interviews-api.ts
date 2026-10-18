// Interview practice, skills demos and async interviews — re-exported by
// studio-features-service.ts.
import { apiClient } from "../../api-client";
import type {
  AsyncInterview,
  AsyncInterviewResponsesResult,
  InterviewQuestion,
  InterviewSession,
  SkillsDemo,
  SkillsDemoScript,
} from "./features-types";

// ─── Interview Practice ─────────────────────────────────────────────────────

export async function getInterviewQuestions(filters?: {
  category?: string;
  difficulty?: string;
  industry?: string;
}): Promise<InterviewQuestion[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.difficulty) params.set("difficulty", filters.difficulty);
  if (filters?.industry) params.set("industry", filters.industry);
  const qs = params.toString();
  const res = await apiClient.get<InterviewQuestion[]>(`/api/studio/interview/questions${qs ? `?${qs}` : ""}`);
  return res.data;
}

export async function seedInterviewQuestions(): Promise<{ seeded: number }> {
  const res = await apiClient.post<{ seeded: number }>("/api/studio/interview/questions/seed", {});
  return res.data;
}

export async function startInterviewSession(params: {
  questionId: string;
  resumeText?: string;
}): Promise<InterviewSession> {
  const res = await apiClient.post<InterviewSession>("/api/studio/interview/session", params);
  return res.data;
}

export async function updateInterviewSession(
  sessionId: string,
  updates: Partial<{ recordingId: string; coachingId: string; answer: string; isPublic: boolean }>,
): Promise<InterviewSession> {
  const res = await apiClient.patch<InterviewSession>(`/api/studio/interview/session/${sessionId}`, updates);
  return res.data;
}

export async function getInterviewSessions(): Promise<InterviewSession[]> {
  const res = await apiClient.get<InterviewSession[]>("/api/studio/interview/sessions");
  return res.data;
}

// ─── Skills Demos ───────────────────────────────────────────────────────────

export async function createSkillsDemo(params: {
  skillName: string;
  template?: "general" | "code-walkthrough" | "design-portfolio" | "data-analysis";
  title: string;
  description?: string;
  projectUrl?: string;
  recordingId?: string;
  projectId?: string;
}): Promise<SkillsDemo> {
  const res = await apiClient.post<SkillsDemo>("/api/studio/skills-demo", params);
  return res.data;
}

export async function updateSkillsDemo(
  id: string,
  updates: Partial<{ videoUrl: string; thumbnailUrl: string; durationMs: number; isPublic: boolean; title: string; description: string }>,
): Promise<SkillsDemo> {
  const res = await apiClient.patch<SkillsDemo>(`/api/studio/skills-demo/${id}`, updates);
  return res.data;
}

export async function getSkillsDemos(): Promise<SkillsDemo[]> {
  const res = await apiClient.get<SkillsDemo[]>("/api/studio/skills-demos");
  return res.data;
}

export async function getUserSkillsDemos(userId: string): Promise<SkillsDemo[]> {
  const res = await apiClient.get<SkillsDemo[]>(`/api/studio/skills-demos/user/${userId}`);
  return res.data;
}

export async function generateSkillsDemoScript(params: {
  skillName: string;
  template: "general" | "code-walkthrough" | "design-portfolio" | "data-analysis";
  projectUrl?: string;
  projectDescription?: string;
  resumeText?: string;
}): Promise<SkillsDemoScript> {
  const res = await apiClient.post<SkillsDemoScript>("/api/studio/skills-demo/generate-script", params);
  return res.data;
}

// ─── Async Interviews ───────────────────────────────────────────────────────

export async function createAsyncInterview(params: {
  title: string;
  instructions?: string;
  candidateEmail?: string;
  candidateId?: string;
  jobId?: string;
  questions: Array<{ id: string; text: string; maxDurationSec?: number; required?: boolean }>;
  deadline?: string;
}): Promise<AsyncInterview & { inviteUrl: string }> {
  const res = await apiClient.post<AsyncInterview & { inviteUrl: string }>("/api/studio/async-interview", params);
  return res.data;
}

export async function getAsyncInterviewInvite(token: string): Promise<AsyncInterview> {
  const res = await apiClient.get<AsyncInterview>(`/api/studio/async-interview/invite/${token}`);
  return res.data;
}

export async function submitAsyncResponse(interviewId: string, params: {
  questionId: string;
  recordingId?: string;
  videoUrl?: string;
  transcription?: string;
  durationMs?: number;
}): Promise<void> {
  await apiClient.post(`/api/studio/async-interview/${interviewId}/respond`, params);
}

export async function finalizeAsyncInterview(interviewId: string): Promise<void> {
  await apiClient.post(`/api/studio/async-interview/${interviewId}/submit`, {});
}

export async function getAsyncInterviews(): Promise<AsyncInterview[]> {
  const res = await apiClient.get<AsyncInterview[]>("/api/studio/async-interviews");
  return res.data;
}

export async function getAsyncInterviewResponses(interviewId: string): Promise<AsyncInterviewResponsesResult> {
  const res = await apiClient.get<AsyncInterviewResponsesResult>(`/api/studio/async-interview/${interviewId}/responses`);
  return res.data;
}
