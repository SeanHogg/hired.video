// job-pipeline-service — recruiter kanban for one job's candidate pipeline.
// Mirrors api/src/routes/jobpipeline.ts. Stages use the canonical enum from
// shared/recruiter-pipeline so the frontend never has to re-state column order.

import { apiClient } from "@/lib/api-client";

export const PIPELINE_STAGES = [
  "applied",
  "longlist",
  "screening",
  "interviewing",
  "shortlist",
  "submitted",
  "offer",
  "hired",
  "rejected",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  applied: "Applied",
  longlist: "Long List",
  screening: "Screening",
  interviewing: "Interviewing",
  shortlist: "Short List",
  submitted: "Submitted",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export interface PipelineEntry {
  id: string;
  jobId: string;
  candidateUserId: string | null;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  candidateLocation: string | null;
  candidateLinkedinUrl: string | null;
  candidateResumeUrl: string | null;
  candidateAvatarUrl: string | null;
  stage: PipelineStage;
  stageChangedAt: string;
  ownerId: string | null;
  addedFrom: string;
  notes: string | null;
  tags: string[];
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineStageGroup {
  stage: PipelineStage;
  entries: PipelineEntry[];
  count: number;
}

export interface PipelineSnapshot {
  stages: PipelineStageGroup[];
  total: number;
}

export interface PipelineReport {
  total: number;
  active: number;
  rejected: number;
  hired: number;
  stages: { stage: PipelineStage; count: number; avgDaysInStage: number }[];
}

export interface AddPipelineEntryInput {
  candidateName: string;
  candidateEmail?: string;
  candidatePhone?: string;
  candidateLocation?: string;
  candidateLinkedinUrl?: string;
  candidateResumeUrl?: string;
  candidateAvatarUrl?: string;
  candidateUserId?: string;
  stage?: PipelineStage;
  notes?: string;
  tags?: string[];
}

const base = (jobId: string) => `/api/jobs/${jobId}/pipeline`;

export const jobPipelineService = {
  async list(jobId: string): Promise<PipelineSnapshot> {
    const response = await apiClient.get<PipelineSnapshot>(base(jobId));
    return response.data;
  },

  async add(jobId: string, input: AddPipelineEntryInput): Promise<PipelineEntry> {
    const response = await apiClient.post<PipelineEntry>(base(jobId), input);
    return response.data;
  },

  async moveStage(
    jobId: string,
    entryId: string,
    stage: PipelineStage,
    rejectionReason?: string,
  ): Promise<PipelineEntry> {
    const response = await apiClient.patch<PipelineEntry>(`${base(jobId)}/${entryId}/stage`, {
      stage,
      ...(rejectionReason ? { rejectionReason } : {}),
    });
    return response.data;
  },

  async update(
    jobId: string,
    entryId: string,
    updates: { notes?: string | null; tags?: string[]; ownerId?: string | null },
  ): Promise<PipelineEntry> {
    const response = await apiClient.patch<PipelineEntry>(`${base(jobId)}/${entryId}`, updates);
    return response.data;
  },

  async remove(jobId: string, entryId: string): Promise<void> {
    await apiClient.delete(`${base(jobId)}/${entryId}`);
  },

  async getReport(jobId: string): Promise<PipelineReport> {
    const response = await apiClient.get<PipelineReport>(`${base(jobId)}/reports`);
    return response.data;
  },
};
