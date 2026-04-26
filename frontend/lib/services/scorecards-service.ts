// scorecards-service.ts — Client for /api/scorecards.
//
// Covers the structured-hiring stack: scorecard templates + attributes,
// interview kits + stages, evaluator submissions, debrief aggregates,
// and final hiring decisions.

import { apiClient } from "../api-client";

export type RatingScale = "1-4" | "1-5" | "thumbs" | "yes-no";
export type Recommendation = "strong_yes" | "yes" | "no" | "strong_no";
export type Decision = "approve" | "reject" | "hold" | "withdraw";

export interface ScorecardAttribute {
  id: string;
  templateId: string;
  name: string;
  description: string | null;
  displayOrder: number;
  weight: number;
  anchors: Record<string, string> | null;
  createdAt: string;
}

export interface ScorecardTemplate {
  id: string;
  companyId: string;
  createdByUserId: string;
  name: string;
  description: string | null;
  ratingScale: RatingScale;
  roleFamily: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  attributes?: ScorecardAttribute[];
}

export interface AttributeInput {
  name: string;
  description?: string;
  displayOrder?: number;
  weight?: number;
  anchors?: Record<string, string>;
}

export interface CreateTemplateInput {
  companyId: string;
  name: string;
  description?: string;
  ratingScale?: RatingScale;
  roleFamily?: string;
  attributes: AttributeInput[];
}

export interface InterviewKitStage {
  id: string;
  kitId: string;
  name: string;
  description: string | null;
  displayOrder: number;
  durationMinutes: number | null;
  suggestedQuestions: string[] | null;
  scorecardTemplateId: string | null;
  createdAt: string;
}

export interface InterviewKit {
  id: string;
  companyId: string;
  jobId: string | null;
  createdByUserId: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  stages?: InterviewKitStage[];
}

export interface StageInput {
  name: string;
  description?: string;
  displayOrder?: number;
  durationMinutes?: number;
  suggestedQuestions?: string[];
  scorecardTemplateId?: string;
}

export interface CreateKitInput {
  companyId: string;
  jobId?: string;
  name: string;
  description?: string;
  stages: StageInput[];
}

export interface SubmissionRating {
  id: string;
  submissionId: string;
  attributeId: string;
  rating: number | null;
  notes: string | null;
}

export interface RatingInput {
  attributeId: string;
  rating: number | null;
  notes?: string;
}

export interface ScorecardSubmission {
  id: string;
  templateId: string;
  interviewId: string | null;
  kitStageId: string | null;
  applicationId: string;
  candidateUserId: string | null;
  evaluatorUserId: string;
  overallRecommendation: Recommendation | null;
  overallScore: number | null;
  summary: string | null;
  strengths: string | null;
  concerns: string | null;
  status: "draft" | "submitted";
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ratings?: SubmissionRating[];
}

export interface CreateSubmissionInput {
  templateId: string;
  applicationId: string;
  interviewId?: string;
  kitStageId?: string;
  candidateUserId?: string;
  ratings?: RatingInput[];
  overallRecommendation?: Recommendation;
  summary?: string;
  strengths?: string;
  concerns?: string;
}

export interface DebriefAggregate {
  submissions: ScorecardSubmission[];
  avgScore: number | null;
  recommendations: Partial<Record<Recommendation, number>>;
  attributes: { attributeId: string; name: string; avg: number | null; samples: number }[];
}

export interface HiringDecisionRecord {
  id: string;
  companyId: string;
  jobId: string | null;
  applicationId: string;
  candidateUserId: string | null;
  decidedByUserId: string;
  decision: Decision;
  reason: string | null;
  aggregateSnapshot: {
    submissionCount: number;
    avgScore: number | null;
    recommendations: Partial<Record<Recommendation, number>>;
  } | null;
  decidedAt: string;
  createdAt: string;
}

export const scorecardsService = {
  // Templates
  async listTemplates(companyId?: string): Promise<ScorecardTemplate[]> {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    return (await apiClient.get<ScorecardTemplate[]>(`/api/scorecards/templates${qs}`)).data ?? [];
  },
  async getTemplate(id: string): Promise<ScorecardTemplate | null> {
    return (await apiClient.get<ScorecardTemplate>(`/api/scorecards/templates/${id}`)).data ?? null;
  },
  async createTemplate(input: CreateTemplateInput): Promise<ScorecardTemplate> {
    return (await apiClient.post<ScorecardTemplate>("/api/scorecards/templates", input)).data!;
  },
  async updateTemplate(
    id: string,
    patch: Partial<Pick<ScorecardTemplate, "name" | "description" | "ratingScale" | "roleFamily" | "isArchived">>,
  ): Promise<ScorecardTemplate> {
    return (await apiClient.patch<ScorecardTemplate>(`/api/scorecards/templates/${id}`, patch)).data!;
  },
  async addAttribute(templateId: string, input: AttributeInput): Promise<ScorecardAttribute> {
    return (
      await apiClient.post<ScorecardAttribute>(`/api/scorecards/templates/${templateId}/attributes`, input)
    ).data!;
  },
  async updateAttribute(id: string, patch: Partial<AttributeInput>): Promise<ScorecardAttribute> {
    return (await apiClient.patch<ScorecardAttribute>(`/api/scorecards/attributes/${id}`, patch)).data!;
  },
  async deleteAttribute(id: string): Promise<void> {
    await apiClient.delete(`/api/scorecards/attributes/${id}`);
  },

  // Kits
  async listKits(filter?: { companyId?: string; jobId?: string }): Promise<InterviewKit[]> {
    const params = new URLSearchParams();
    if (filter?.companyId) params.set("companyId", filter.companyId);
    if (filter?.jobId) params.set("jobId", filter.jobId);
    const qs = params.toString();
    return (await apiClient.get<InterviewKit[]>(`/api/scorecards/kits${qs ? `?${qs}` : ""}`)).data ?? [];
  },
  async getKit(id: string): Promise<InterviewKit | null> {
    return (await apiClient.get<InterviewKit>(`/api/scorecards/kits/${id}`)).data ?? null;
  },
  async createKit(input: CreateKitInput): Promise<InterviewKit> {
    return (await apiClient.post<InterviewKit>("/api/scorecards/kits", input)).data!;
  },
  async updateKit(
    id: string,
    patch: Partial<Pick<InterviewKit, "name" | "description" | "jobId" | "isArchived">>,
  ): Promise<InterviewKit> {
    return (await apiClient.patch<InterviewKit>(`/api/scorecards/kits/${id}`, patch)).data!;
  },
  async addStage(kitId: string, input: StageInput): Promise<InterviewKitStage> {
    return (await apiClient.post<InterviewKitStage>(`/api/scorecards/kits/${kitId}/stages`, input)).data!;
  },
  async updateStage(id: string, patch: Partial<StageInput>): Promise<InterviewKitStage> {
    return (await apiClient.patch<InterviewKitStage>(`/api/scorecards/stages/${id}`, patch)).data!;
  },
  async deleteStage(id: string): Promise<void> {
    await apiClient.delete(`/api/scorecards/stages/${id}`);
  },

  // Submissions
  async listSubmissions(filter: { applicationId?: string; interviewId?: string }): Promise<ScorecardSubmission[]> {
    const params = new URLSearchParams();
    if (filter.applicationId) params.set("applicationId", filter.applicationId);
    if (filter.interviewId) params.set("interviewId", filter.interviewId);
    return (
      await apiClient.get<ScorecardSubmission[]>(`/api/scorecards/submissions?${params.toString()}`)
    ).data ?? [];
  },
  async getSubmission(id: string): Promise<ScorecardSubmission | null> {
    return (await apiClient.get<ScorecardSubmission>(`/api/scorecards/submissions/${id}`)).data ?? null;
  },
  async createSubmission(input: CreateSubmissionInput): Promise<ScorecardSubmission> {
    return (await apiClient.post<ScorecardSubmission>("/api/scorecards/submissions", input)).data!;
  },
  async updateSubmission(
    id: string,
    patch: {
      ratings?: RatingInput[];
      overallRecommendation?: Recommendation;
      summary?: string | null;
      strengths?: string | null;
      concerns?: string | null;
    },
  ): Promise<ScorecardSubmission> {
    return (await apiClient.patch<ScorecardSubmission>(`/api/scorecards/submissions/${id}`, patch)).data!;
  },
  async submitSubmission(id: string): Promise<ScorecardSubmission> {
    return (await apiClient.post<ScorecardSubmission>(`/api/scorecards/submissions/${id}/submit`, {})).data!;
  },

  // Debrief + decisions
  async getDebrief(applicationId: string): Promise<DebriefAggregate> {
    return (
      await apiClient.get<DebriefAggregate>(
        `/api/scorecards/debrief?applicationId=${encodeURIComponent(applicationId)}`,
      )
    ).data ?? { submissions: [], avgScore: null, recommendations: {}, attributes: [] };
  },
  async listDecisions(applicationId: string): Promise<HiringDecisionRecord[]> {
    return (
      await apiClient.get<HiringDecisionRecord[]>(
        `/api/scorecards/decisions?applicationId=${encodeURIComponent(applicationId)}`,
      )
    ).data ?? [];
  },
  async createDecision(input: {
    companyId: string;
    applicationId: string;
    jobId?: string;
    candidateUserId?: string;
    decision: Decision;
    reason?: string;
  }): Promise<HiringDecisionRecord> {
    return (await apiClient.post<HiringDecisionRecord>("/api/scorecards/decisions", input)).data!;
  },
};
