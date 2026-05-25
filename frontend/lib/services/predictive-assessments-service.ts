/**
 * Thin client for /api/predictive-assessments. One module owns the wire
 * shape so the tool page, the history sidebar, and the eventual recruiter
 * profile-view widget all read off the same DTOs.
 */

import { apiClient } from "../api-client";
import type {
  AssessmentDescriptor,
  AssessmentKind,
} from "@shared/assessments/kinds";
import type { AssessmentQuestion } from "@shared/assessments/question-banks";

export interface AssessmentRun {
  id: string;
  userId: string;
  assessmentKind: AssessmentKind;
  status: "started" | "in_progress" | "completed" | "abandoned";
  questionIndex: number;
  responses: Array<{ questionId: string; value: string | number }>;
  scores: { scores: Record<string, number>; counts: Record<string, number>; overall: number } | null;
  results: {
    narrative?: string;
    topStrength?: string | null;
    topGrowth?: string | null;
    roleAlignment?: Record<string, { resume: number; role: number; gap: number }>;
    /** Calibrated percentile per dimension key (0..100). Populated only
     *  once the norms-recompute worker has seen enough completed runs
     *  to back the curve — empty until then. */
    percentiles?: Record<string, number>;
    /** Size of the population the percentile curve was computed against. */
    normSampleSize?: number;
  } | null;
  isProRun: boolean;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeMatchResult {
  matchScore: number;
  perDimension: Record<string, { resume: number; role: number; gap: number }>;
  overIndexes: string[];
  underIndexes: string[];
  run: AssessmentRun | null;
}

export const predictiveAssessmentsService = {
  async listKinds(): Promise<AssessmentDescriptor[]> {
    const res = await apiClient.get<AssessmentDescriptor[]>("/api/predictive-assessments/kinds", null as any);
    return res.data;
  },

  async getQuestions(kind: AssessmentKind): Promise<{ descriptor: AssessmentDescriptor; questions: AssessmentQuestion[] }> {
    const res = await apiClient.get<{ descriptor: AssessmentDescriptor; questions: AssessmentQuestion[] }>(
      `/api/predictive-assessments/kinds/${kind}/questions`,
      null as any,
    );
    return res.data;
  },

  async start(kind: AssessmentKind): Promise<AssessmentRun> {
    const res = await apiClient.post<AssessmentRun>("/api/predictive-assessments/start", { kind });
    return res.data;
  },

  async respond(runId: string, questionId: string, value: string | number): Promise<AssessmentRun> {
    const res = await apiClient.post<AssessmentRun>(`/api/predictive-assessments/${runId}/respond`, { questionId, value });
    return res.data;
  },

  async complete(runId: string): Promise<AssessmentRun> {
    const res = await apiClient.post<AssessmentRun>(`/api/predictive-assessments/${runId}/complete`, {});
    return res.data;
  },

  async listRuns(): Promise<AssessmentRun[]> {
    const res = await apiClient.get<AssessmentRun[]>("/api/predictive-assessments/runs", null as any);
    return res.data;
  },

  async getRun(id: string): Promise<AssessmentRun> {
    const res = await apiClient.get<AssessmentRun>(`/api/predictive-assessments/runs/${id}`, null as any);
    return res.data;
  },

  async resumeMatch(input: { resumeText: string; roleTitle?: string; roleDescription?: string }): Promise<ResumeMatchResult> {
    const res = await apiClient.post<ResumeMatchResult>("/api/predictive-assessments/resume-match", input);
    return res.data;
  },
};
