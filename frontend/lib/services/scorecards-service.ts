// scorecards-service.ts — Client for /api/scorecards.
//
// Covers the structured-hiring stack: scorecard templates + attributes,
// interview kits + stages, evaluator submissions, debrief aggregates,
// final hiring decisions, and the competency library (#1382).

import { apiClient } from "../api-client";
import type { BlindReviewMode } from "../scorecards/blind-review";

export type RatingScale = "1-4" | "1-5" | "thumbs" | "yes-no";
export type Recommendation = "strong_yes" | "yes" | "no" | "strong_no";
export type Decision = "approve" | "reject" | "hold" | "withdraw";
/** Migration 0132 / gap #1386. */
export type StageKind = "interview" | "async_video" | "take_home" | "assessment";
/** Migration 0132 / gap #1382. */
export type CompetencyTaxonomy =
  | "technical"
  | "behavioral"
  | "leadership"
  | "execution"
  | "other";

export interface ScorecardAttribute {
  id: string;
  templateId: string;
  /** Migration 0132 / gap #1382. */
  competencyId: string | null;
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
  /** Migration 0132 / gap #1382. */
  competencyId?: string | null;
}

export interface CreateScorecardTemplateInput {
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
  /** Migration 0132 / gap #1386. */
  stageKind: StageKind;
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
  /** Migration 0132 / gap #1380. */
  blindReviewMode: BlindReviewMode;
  /** Migration 0132 / gap #1383. */
  escalateToUserId: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  stages?: InterviewKitStage[];
}

export interface StageInput {
  name: string;
  description?: string;
  stageKind?: StageKind;
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
  blindReviewMode?: BlindReviewMode;
  escalateToUserId?: string | null;
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
  /** Migration 0132 / gap #1383. */
  dueAt: string | null;
  remindedAt: string | null;
  escalatedAt: string | null;
  /**
   * Migration 0132 / gap #1380. Set to `true` by the API when the
   * candidate identity was masked for this requester — the frontend uses
   * it to render an "Identity hidden" badge without re-deriving policy.
   */
  _anonymized?: true;
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
  /** Migration 0132 / gap #1383. ISO timestamp. */
  dueAt?: string;
}

export interface DebriefAggregate {
  submissions: ScorecardSubmission[];
  avgScore: number | null;
  recommendations: Partial<Record<Recommendation, number>>;
  attributes: { attributeId: string; name: string; avg: number | null; samples: number }[];
}

// ─── Competency framework (#1382) ────────────────────────────────────────────

export interface CompetencyLevel {
  id: string;
  competencyId: string;
  level: number;
  label: string;
  anchor: string;
  createdAt: string;
}

export interface Competency {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  taxonomy: CompetencyTaxonomy;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  levels?: CompetencyLevel[];
}

export interface CompetencyLevelInput {
  level: number;
  label: string;
  anchor: string;
}

export interface CreateCompetencyInput {
  companyId: string;
  name: string;
  description?: string;
  taxonomy?: CompetencyTaxonomy;
  levels?: CompetencyLevelInput[];
}

export interface UpdateCompetencyInput {
  name?: string;
  description?: string | null;
  taxonomy?: CompetencyTaxonomy;
  isArchived?: boolean;
  levels?: CompetencyLevelInput[];
}

/** Stage question (#1390). */
export interface StageQuestion {
  id: string;
  kitStageId: string;
  competencyId: string | null;
  prompt: string;
  difficulty: string | null;
  expectedAnswer: "star" | "technical" | "coding" | "portfolio" | "open";
  displayOrder: number;
  createdAt: string;
}

/** Take-home assignment (#1386). */
export interface TakeHomeAssignment {
  id: string;
  kitStageId: string;
  prompt: string;
  deliveryFormat: "github_url" | "file_upload" | "code_paste" | "doc_link";
  dueInHours: number;
  createdAt: string;
  updatedAt: string;
}

/** Take-home candidate submission (#1438). */
export interface TakeHomeSubmission {
  id: string;
  assignmentId: string;
  applicationId: string;
  candidateUserId: string | null;
  deliveryUrl: string | null;
  fileRefs: string[];
  textResponse: string | null;
  inviteToken: string | null;
  tokenExpiresAt: string | null;
  submittedAt: string | null;
  evaluatorScorecardSubmissionId: string | null;
  createdAt: string;
}

/** Public-by-token preview of a take-home assignment for the candidate. */
export interface TakeHomeInviteView {
  submission: TakeHomeSubmission;
  assignment: TakeHomeAssignment;
  stage: { id: string; name: string };
  expired: boolean;
  alreadySubmitted: boolean;
}

/** Kit coverage row (#1390). */
export interface KitCoverageRow {
  competencyId: string;
  competencyName: string;
  hasQuestions: boolean;
}

/** Bias-linter flag (#1385). */
export interface BiasFlag {
  phrase: string;
  severity: "low" | "medium" | "high";
  rationale: string;
  suggestedReplacement?: string;
}

export interface BiasLintResponse {
  flags: BiasFlag[];
}

/** Per-interviewer SLA reliability metrics (#1434). */
export interface InterviewerReliability {
  evaluatorUserId: string;
  totalWithSla: number;
  onTimeCount: number;
  lateCount: number;
  overdueDraftCount: number;
  avgLagMs: number | null;
  last30dCount: number;
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
  async createTemplate(input: CreateScorecardTemplateInput): Promise<ScorecardTemplate> {
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
    patch: Partial<
      Pick<
        InterviewKit,
        | "name"
        | "description"
        | "jobId"
        | "isArchived"
        | "blindReviewMode"
        | "escalateToUserId"
      >
    >,
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
  // Bias linter (#1385)
  async lintBias(input: {
    summary?: string;
    strengths?: string;
    concerns?: string;
  }): Promise<BiasLintResponse> {
    return (
      (
        await apiClient.post<BiasLintResponse>("/api/scorecards/bias-check", input)
      ).data ?? { flags: [] }
    );
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

  // Stage questions + take-home (#1386/#1390)
  async listStageQuestions(stageId: string): Promise<StageQuestion[]> {
    return (
      await apiClient.get<StageQuestion[]>(
        `/api/scorecards/stage-questions/${stageId}`,
      )
    ).data ?? [];
  },
  async addStageQuestion(
    stageId: string,
    input: {
      prompt: string;
      competencyId?: string | null;
      difficulty?: string | null;
      expectedAnswer?: StageQuestion["expectedAnswer"];
    },
  ): Promise<StageQuestion> {
    return (
      await apiClient.post<StageQuestion>(
        `/api/scorecards/stage-questions/${stageId}`,
        input,
      )
    ).data!;
  },
  async deleteStageQuestion(id: string): Promise<void> {
    await apiClient.delete(`/api/scorecards/stage-questions/items/${id}`);
  },
  async aiGenerateStageQuestions(
    stageId: string,
    input: {
      competencyId: string;
      level?: string;
      count?: number;
      targetRole?: string;
    },
  ): Promise<{ questions: StageQuestion[] }> {
    return (
      (
        await apiClient.post<{ questions: StageQuestion[] }>(
          `/api/scorecards/stage-questions/${stageId}/ai-generate`,
          input,
        )
      ).data ?? { questions: [] }
    );
  },

  async getTakeHome(stageId: string): Promise<TakeHomeAssignment | null> {
    return (
      await apiClient.get<TakeHomeAssignment>(`/api/scorecards/take-home/${stageId}`)
    ).data ?? null;
  },
  async upsertTakeHome(
    stageId: string,
    input: {
      prompt: string;
      deliveryFormat?: TakeHomeAssignment["deliveryFormat"];
      dueInHours?: number;
    },
  ): Promise<TakeHomeAssignment> {
    return (
      await apiClient.put<TakeHomeAssignment>(
        `/api/scorecards/take-home/${stageId}`,
        input,
      )
    ).data!;
  },

  async listTakeHomeSubmissions(stageId: string): Promise<TakeHomeSubmission[]> {
    return (
      (
        await apiClient.get<TakeHomeSubmission[]>(
          `/api/scorecards/take-home/${stageId}/submissions`,
        )
      ).data ?? []
    );
  },
  async createTakeHomeInvite(
    stageId: string,
    input: { applicationId: string; candidateUserId?: string },
  ): Promise<TakeHomeSubmission> {
    return (
      await apiClient.post<TakeHomeSubmission>(
        `/api/scorecards/take-home/${stageId}/invites`,
        input,
      )
    ).data!;
  },
  async startTakeHomeReview(input: {
    takeHomeSubmissionId: string;
    templateId: string;
  }): Promise<{ takeHomeSubmissionId: string; scorecardSubmissionId: string }> {
    return (
      await apiClient.post<{
        takeHomeSubmissionId: string;
        scorecardSubmissionId: string;
      }>("/api/scorecards/take-home/start-review", input)
    ).data!;
  },

  // Public-by-token take-home flow (#1438)
  async getTakeHomeInvite(token: string): Promise<TakeHomeInviteView | null> {
    return (
      await apiClient.get<TakeHomeInviteView>(
        `/api/public/take-home/invite/${encodeURIComponent(token)}`,
      )
    ).data ?? null;
  },
  async submitTakeHomeByToken(
    token: string,
    input: {
      deliveryUrl?: string;
      textResponse?: string;
      fileRefs?: string[];
    },
  ): Promise<TakeHomeSubmission> {
    return (
      await apiClient.post<TakeHomeSubmission>(
        `/api/public/take-home/invite/${encodeURIComponent(token)}`,
        input,
      )
    ).data!;
  },

  async getKitCoverage(kitId: string): Promise<KitCoverageRow[]> {
    return (
      (await apiClient.get<KitCoverageRow[]>(`/api/scorecards/coverage/${kitId}`))
        .data ?? []
    );
  },

  // Reliability + assignments (#1383/#1434/#1435)
  async getReliability(userId: string): Promise<InterviewerReliability | null> {
    return (
      await apiClient.get<InterviewerReliability>(
        `/api/scorecards/reliability/${encodeURIComponent(userId)}`,
      )
    ).data ?? null;
  },
  async assignSubmission(input: {
    templateId: string;
    applicationId: string;
    evaluatorUserId: string;
    kitStageId?: string;
    candidateUserId?: string;
    dueAt: string;
  }): Promise<ScorecardSubmission> {
    return (
      await apiClient.post<ScorecardSubmission>("/api/scorecards/assignments", input)
    ).data!;
  },

  // Competencies (#1382)
  async listCompetencies(companyId?: string): Promise<Competency[]> {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    return (await apiClient.get<Competency[]>(`/api/scorecards/competencies${qs}`)).data ?? [];
  },
  async getCompetency(id: string): Promise<Competency | null> {
    return (
      (await apiClient.get<Competency>(`/api/scorecards/competencies/${id}`)).data ?? null
    );
  },
  async createCompetency(input: CreateCompetencyInput): Promise<Competency> {
    return (await apiClient.post<Competency>("/api/scorecards/competencies", input)).data!;
  },
  async updateCompetency(id: string, patch: UpdateCompetencyInput): Promise<Competency> {
    return (await apiClient.patch<Competency>(`/api/scorecards/competencies/${id}`, patch))
      .data!;
  },

  // ─── #241 Hiring-manager scorecard visibility ───────────────────────────
  async getJobScorecardVisibility(
    jobId: string,
  ): Promise<{ override: ScorecardHmVisibility | null; companyDefault: ScorecardHmVisibility; effective: ScorecardHmVisibility }> {
    return (await apiClient.get(`/api/scorecards/visibility/job/${jobId}`)).data as any;
  },
  async setJobScorecardVisibility(jobId: string, mode: ScorecardHmVisibility | null): Promise<void> {
    await apiClient.put(`/api/scorecards/visibility/job/${jobId}`, { mode });
  },
  async getCompanyScorecardVisibility(companyId: string): Promise<{ default: ScorecardHmVisibility }> {
    return (await apiClient.get(`/api/scorecards/visibility/company/${companyId}`)).data as any;
  },
  async setCompanyScorecardVisibility(companyId: string, mode: ScorecardHmVisibility): Promise<void> {
    await apiClient.put(`/api/scorecards/visibility/company/${companyId}`, { mode });
  },
};

/** #241 — the three hiring-manager scorecard-visibility modes (mirrors the
 *  backend `SCORECARD_HM_VISIBILITY_MODES`). */
export const SCORECARD_HM_VISIBILITY_MODES = [
  "always_show_hm",
  "always_hide_hm",
  "hide_hm_until_submit",
] as const;
export type ScorecardHmVisibility = (typeof SCORECARD_HM_VISIBILITY_MODES)[number];
