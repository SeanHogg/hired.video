/**
 * Frontend client for /api/interview-question-sets/*.
 *
 * The reusable library a recruiter / employer pulls from when:
 *   - they post a job and want to attach a screening interview
 *     (via PUT /api/jobs/:id/screening), or
 *   - they ad-hoc assign an interview from the Interview Questions tool
 *     and want to reuse the set on the next candidate.
 *
 * Sets are owned either by a user (personal scratchpad) OR by a company
 * (shared library across the company's recruiters); the API enforces the
 * xor and returns whichever the caller can see.
 */

import { apiClient } from "../api-client";
import type { ExtractedSkill, GeneratedQuestion, QuestionStyle } from "./interview-assignments-service";

export interface InterviewQuestionSet {
  id: string;
  ownerUserId: string | null;
  ownerCompanyId: string | null;
  title: string;
  description: string | null;
  targetRole: string | null;
  style: QuestionStyle;
  questions: GeneratedQuestion[];
  skills: ExtractedSkill[];
  prepTimeSec: number;
  maxRetakes: number;
  proctoringOn: boolean;
  isArchived: boolean;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuestionSetPayload {
  title: string;
  description?: string;
  targetRole?: string;
  style?: QuestionStyle;
  questions: GeneratedQuestion[];
  skills?: ExtractedSkill[];
  prepTimeSec?: number;
  maxRetakes?: number;
  proctoringOn?: boolean;
  /** When set, the set is owned by this company (shared with every active
   *  member). Omit for a personal set. */
  companyId?: string;
}

export type UpdateQuestionSetPayload = Partial<Omit<CreateQuestionSetPayload, "companyId">> & {
  isArchived?: boolean;
};

export async function listQuestionSets(includeArchived = false): Promise<InterviewQuestionSet[]> {
  const res = await apiClient.get<{ sets: InterviewQuestionSet[] }>(
    `/api/interview-question-sets${includeArchived ? "?includeArchived=true" : ""}`,
  );
  return res.data.sets;
}

export async function getQuestionSet(id: string): Promise<InterviewQuestionSet> {
  const res = await apiClient.get<InterviewQuestionSet>(`/api/interview-question-sets/${id}`);
  return res.data;
}

export async function createQuestionSet(
  payload: CreateQuestionSetPayload,
): Promise<InterviewQuestionSet> {
  const res = await apiClient.post<InterviewQuestionSet>(`/api/interview-question-sets`, payload);
  return res.data;
}

export async function updateQuestionSet(
  id: string,
  payload: UpdateQuestionSetPayload,
): Promise<InterviewQuestionSet> {
  const res = await apiClient.put<InterviewQuestionSet>(
    `/api/interview-question-sets/${id}`,
    payload,
  );
  return res.data;
}

export async function archiveQuestionSet(id: string): Promise<void> {
  await apiClient.delete(`/api/interview-question-sets/${id}`);
}

// ─── Job screening attachment ──────────────────────────────────────────────

export type ScreeningRequirement = "none" | "optional" | "required";

export interface JobScreeningConfig {
  questionSetId: string | null;
  screeningRequired: ScreeningRequirement;
  set: InterviewQuestionSet | null;
}

/** Owner-only — used by the job edit page to read the full attachment. */
export async function getJobScreening(jobId: string): Promise<JobScreeningConfig> {
  const res = await apiClient.get<JobScreeningConfig>(`/api/jobs/${jobId}/screening`);
  return res.data;
}

/** Candidate-safe — used by the apply page to warn the candidate that a
 *  screening interview will follow. Returns aggregate stats only, never the
 *  actual question text. */
export interface JobScreeningPreview {
  hasScreening: boolean;
  screeningRequired?: ScreeningRequirement;
  title?: string;
  description?: string | null;
  questionCount?: number;
  expectedMinutes?: number;
  prepTimeSec?: number;
  maxRetakes?: number;
  proctoringOn?: boolean;
}

export async function getJobScreeningPreview(jobId: string): Promise<JobScreeningPreview> {
  const res = await apiClient.get<JobScreeningPreview>(`/api/jobs/${jobId}/screening/preview`);
  return res.data;
}

export async function setJobScreening(
  jobId: string,
  payload: { questionSetId: string | null; screeningRequired: ScreeningRequirement },
): Promise<JobScreeningConfig> {
  const res = await apiClient.put<JobScreeningConfig>(`/api/jobs/${jobId}/screening`, payload);
  return res.data;
}

// ─── Bulk-invite backfill (#1236) ──────────────────────────────────────────

export interface BackfillPreview {
  count: number;
}

export interface BackfillResult {
  count: number;
  created: number;
  failures: Array<{ applicationId: string; reason: string }>;
}

export async function getJobScreeningBackfillPreview(jobId: string): Promise<BackfillPreview> {
  const res = await apiClient.get<BackfillPreview>(`/api/jobs/${jobId}/screening/backfill-preview`);
  return res.data;
}

export async function runJobScreeningBackfill(jobId: string): Promise<BackfillResult> {
  const res = await apiClient.post<BackfillResult>(`/api/jobs/${jobId}/screening/backfill`, {});
  return res.data;
}
