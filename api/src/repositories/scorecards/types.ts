/**
 * Scorecards persistence — row + input/patch types shared by every
 * per-aggregate repository under `repositories/scorecards/` and the
 * `ScorecardsRepository` composition root (`../scorecardsRepository.ts`).
 */

import { schema } from "../../db/index.js";

const {
  scorecardTemplates,
  scorecardAttributes,
  interviewKits,
  interviewKitStages,
  scorecardSubmissions,
  scorecardSubmissionRatings,
  hiringDecisions,
  competencies,
  competencyLevels,
  interviewStageQuestions,
  takeHomeAssignments,
  takeHomeSubmissions,
} = schema;

export type DbLike = any;

// Drizzle's `$inferInsert` strips columns that have a `.default()` from
// the insert type — making "optional" fields look "missing" at the call
// site. We therefore define the public insert contract explicitly here
// and only narrow with `as any` at the actual `.values()` call.

export type ScorecardTemplateRow = typeof scorecardTemplates.$inferSelect;
export type ScorecardAttributeRow = typeof scorecardAttributes.$inferSelect;
export type InterviewKitRow = typeof interviewKits.$inferSelect;
export type InterviewKitStageRow = typeof interviewKitStages.$inferSelect;
export type ScorecardSubmissionRow = typeof scorecardSubmissions.$inferSelect;
export type ScorecardSubmissionRatingRow = typeof scorecardSubmissionRatings.$inferSelect;
export type HiringDecisionRow = typeof hiringDecisions.$inferSelect;
export type CompetencyRow = typeof competencies.$inferSelect;
export type CompetencyLevelRow = typeof competencyLevels.$inferSelect;
export type StageQuestionRow = typeof interviewStageQuestions.$inferSelect;
export type TakeHomeAssignmentRow = typeof takeHomeAssignments.$inferSelect;
export type TakeHomeSubmissionRow = typeof takeHomeSubmissions.$inferSelect;

export interface NewTakeHomeSubmission {
  assignmentId: string;
  applicationId: string;
  candidateUserId?: string | null;
  inviteToken: string;
  tokenExpiresAt: Date;
}

export interface UpdateTakeHomeSubmissionPatch {
  deliveryUrl?: string | null;
  fileRefs?: string[];
  textResponse?: string | null;
  submittedAt?: Date | null;
  evaluatorScorecardSubmissionId?: string | null;
}

export interface NewStageQuestion {
  kitStageId: string;
  competencyId?: string | null;
  prompt: string;
  difficulty?: string | null;
  expectedAnswer?: string;
  displayOrder?: number;
}

export interface NewTakeHomeAssignment {
  kitStageId: string;
  prompt: string;
  deliveryFormat?: string;
  dueInHours?: number;
}

export interface NewCompetency {
  companyId: string;
  createdByUserId: string;
  name: string;
  description?: string | null;
  taxonomy?: string;
  isArchived?: boolean;
}

export interface NewCompetencyLevel {
  competencyId: string;
  level: number;
  label: string;
  anchor: string;
}

export interface UpdateCompetencyPatch {
  name?: string;
  description?: string | null;
  taxonomy?: string;
  isArchived?: boolean;
}

export interface OverdueSubmission {
  id: string;
  templateId: string;
  evaluatorUserId: string;
  applicationId: string;
  candidateUserId: string | null;
  kitStageId: string | null;
  dueAt: Date;
  remindedAt: Date | null;
  escalatedAt: Date | null;
}

/** Per-interviewer SLA reliability metrics (migration 0132 / gap #1434). */
export interface InterviewerReliability {
  evaluatorUserId: string;
  /** Submissions with both `dueAt` AND `submittedAt` — basis for lag math. */
  totalWithSla: number;
  /** Count of those submitted at or before their `dueAt`. */
  onTimeCount: number;
  /** Count of those submitted after their `dueAt`. */
  lateCount: number;
  /** Currently overdue drafts (status='draft', dueAt < now). */
  overdueDraftCount: number;
  /** Average lag in ms (submittedAt - dueAt); positive = late, negative = early. */
  avgLagMs: number | null;
  /** Total submissions in last 30 days regardless of SLA. */
  last30dCount: number;
}

export interface NewScorecardTemplate {
  companyId: string;
  createdByUserId: string;
  name: string;
  description?: string | null;
  ratingScale?: string;
  roleFamily?: string | null;
  isArchived?: boolean;
  /** Migration 0134 / gap #1384. */
  requiredCertificationCourseId?: string | null;
}

export interface NewScorecardAttribute {
  templateId: string;
  name: string;
  description?: string | null;
  displayOrder?: number;
  weight?: number;
  anchors?: Record<string, string> | null;
  /** Migration 0132 / gap #1382. Optional link to a reusable competency. */
  competencyId?: string | null;
}

export interface NewInterviewKit {
  companyId: string;
  createdByUserId: string;
  name: string;
  jobId?: string | null;
  description?: string | null;
  isArchived?: boolean;
  /** Migration 0132 / gap #1380. */
  blindReviewMode?: string;
  /** Migration 0132 / gap #1383. */
  escalateToUserId?: string | null;
}

export interface NewInterviewKitStage {
  kitId: string;
  name: string;
  description?: string | null;
  displayOrder?: number;
  durationMinutes?: number;
  suggestedQuestions?: string[];
  scorecardTemplateId?: string;
  /** Migration 0132 / gap #1386. */
  stageKind?: string;
}

export interface NewScorecardSubmission {
  templateId: string;
  applicationId: string;
  evaluatorUserId: string;
  interviewId?: string;
  kitStageId?: string;
  candidateUserId?: string;
  overallRecommendation?: string;
  overallScore?: number | null;
  summary?: string | null;
  strengths?: string | null;
  concerns?: string | null;
  status?: "draft" | "submitted";
  submittedAt?: Date | null;
  /** Migration 0132 / gap #1383. Soft deadline for SLA tracking. */
  dueAt?: Date | null;
}

export interface NewScorecardSubmissionRating {
  submissionId: string;
  attributeId: string;
  rating: number | null;
  notes?: string | null;
}

export interface NewHiringDecision {
  companyId: string;
  applicationId: string;
  decidedByUserId: string;
  decision: string;
  jobId?: string;
  candidateUserId?: string;
  reason?: string;
  aggregateSnapshot?: unknown;
}

export interface UpdateTemplatePatch {
  name?: string;
  description?: string | null;
  ratingScale?: string;
  roleFamily?: string | null;
  isArchived?: boolean;
  requiredCertificationCourseId?: string | null;
}

export interface UpdateAttributePatch {
  name?: string;
  description?: string | null;
  displayOrder?: number;
  weight?: number;
  anchors?: Record<string, string> | null;
  competencyId?: string | null;
}

export interface UpdateKitPatch {
  name?: string;
  description?: string | null;
  jobId?: string | null;
  isArchived?: boolean;
  blindReviewMode?: string;
  escalateToUserId?: string | null;
}

export interface UpdateStagePatch {
  name?: string;
  description?: string | null;
  displayOrder?: number;
  durationMinutes?: number;
  suggestedQuestions?: string[];
  scorecardTemplateId?: string | null;
  stageKind?: string;
}

export interface UpdateSubmissionPatch {
  overallRecommendation?: string | null;
  overallScore?: number | null;
  summary?: string | null;
  strengths?: string | null;
  concerns?: string | null;
  status?: "draft" | "submitted";
  submittedAt?: Date | null;
  dueAt?: Date | null;
  remindedAt?: Date | null;
  escalatedAt?: Date | null;
}
