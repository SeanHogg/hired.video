// job-pipeline-service — recruiter kanban for one job's candidate pipeline.
// Mirrors api/src/routes/jobpipeline.ts. Stages use the canonical enum from
// shared/recruiter-pipeline so the frontend never has to re-state column order.

import { apiClient } from "@/lib/api-client";

// Re-export the shared enum so existing call sites don't have to change paths.
export {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  TERMINAL_STAGES,
  type PipelineStage,
} from "@shared/recruiter-pipeline";

import type { PipelineStage as _PipelineStage } from "@shared/recruiter-pipeline";
type PipelineStage = _PipelineStage;

export interface PipelineEntry {
  id: string;
  jobId: string;
  /** The originating job application, when the entry was created from one
   *  (added_from = 'application'). Drives "send this role's screening to the
   *  applicant" from the pipeline (#1855). Null for manually-added entries. */
  jobApplicationId: string | null;
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

  async logTouchpoint(
    jobId: string,
    entryId: string,
    type: "email" | "sms" | "call" | "note" | "interview_scheduled",
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await apiClient.post(`${base(jobId)}/${entryId}/touchpoint`, { type, payload });
  },

  async getReport(jobId: string): Promise<PipelineReport> {
    const response = await apiClient.get<PipelineReport>(`${base(jobId)}/reports`);
    return response.data;
  },

  async listShareLinks(jobId: string): Promise<{ links: PipelineShareLink[] }> {
    const response = await apiClient.get<{ links: PipelineShareLink[] }>(`${base(jobId)}/share`);
    return response.data;
  },

  async createShareLink(
    jobId: string,
    input: { label?: string; expiresAt?: string },
  ): Promise<PipelineShareLink> {
    const response = await apiClient.post<PipelineShareLink>(`${base(jobId)}/share`, input);
    return response.data;
  },

  async deleteShareLink(jobId: string, linkId: string): Promise<void> {
    await apiClient.delete(`${base(jobId)}/share/${linkId}`);
  },

  async getPublicPipeline(token: string): Promise<PublicPipeline> {
    const response = await apiClient.get<PublicPipeline>(`/api/pipeline/public/${token}`);
    return response.data;
  },
};

export interface PipelineShareLink {
  id: string;
  jobId: string;
  shareToken: string;
  label: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface PublicPipelineEntry {
  id: string;
  stage: PipelineStage;
  candidateName: string;
  candidateLocation: string | null;
  candidateAvatarUrl: string | null;
  tags: string[];
  stageChangedAt: string;
  addedFrom: string;
}

export interface PublicPipeline {
  job: { id: string; title: string; company: string | null };
  label: string | null;
  stages: { stage: PipelineStage; label: string; entries: PublicPipelineEntry[]; count: number }[];
  total: number;
}
