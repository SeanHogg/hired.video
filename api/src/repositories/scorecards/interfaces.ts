/**
 * Scorecards persistence — role interfaces, one per aggregate. Consumers
 * depend on the narrowest role they use; `IScorecardsRepository` (in
 * `../scorecardsRepository.ts`) is the union of all of them.
 */

import type {
  CompetencyLevelRow,
  CompetencyRow,
  HiringDecisionRow,
  InterviewerReliability,
  InterviewKitRow,
  InterviewKitStageRow,
  NewCompetency,
  NewCompetencyLevel,
  NewHiringDecision,
  NewInterviewKit,
  NewInterviewKitStage,
  NewScorecardAttribute,
  NewScorecardSubmission,
  NewScorecardSubmissionRating,
  NewScorecardTemplate,
  NewStageQuestion,
  NewTakeHomeAssignment,
  NewTakeHomeSubmission,
  OverdueSubmission,
  ScorecardAttributeRow,
  ScorecardSubmissionRatingRow,
  ScorecardSubmissionRow,
  ScorecardTemplateRow,
  StageQuestionRow,
  TakeHomeAssignmentRow,
  TakeHomeSubmissionRow,
  UpdateAttributePatch,
  UpdateCompetencyPatch,
  UpdateKitPatch,
  UpdateStagePatch,
  UpdateSubmissionPatch,
  UpdateTakeHomeSubmissionPatch,
  UpdateTemplatePatch,
} from "./types.js";

/** Scorecard templates + their rubric attributes. */
export interface IScorecardTemplatesRepository {
  findTemplateById(id: string): Promise<ScorecardTemplateRow | null>;
  /** Batch read — one inArray query; order not guaranteed. */
  findTemplatesByIds(ids: readonly string[]): Promise<ScorecardTemplateRow[]>;
  findActiveTemplatesForCompanies(companyIds: readonly string[]): Promise<ScorecardTemplateRow[]>;
  insertTemplate(input: NewScorecardTemplate): Promise<ScorecardTemplateRow>;
  updateTemplate(id: string, patch: UpdateTemplatePatch): Promise<ScorecardTemplateRow>;

  findAttributesForTemplate(templateId: string): Promise<ScorecardAttributeRow[]>;
  findAttributesForTemplates(templateIds: readonly string[]): Promise<ScorecardAttributeRow[]>;
  findAttributeById(id: string): Promise<ScorecardAttributeRow | null>;
  insertAttribute(input: NewScorecardAttribute): Promise<ScorecardAttributeRow>;
  insertAttributes(rows: readonly NewScorecardAttribute[]): Promise<ScorecardAttributeRow[]>;
  updateAttribute(id: string, patch: UpdateAttributePatch): Promise<ScorecardAttributeRow>;
  deleteAttribute(id: string): Promise<void>;
}

/** Interview kits + their stages. */
export interface IInterviewKitsRepository {
  findKitById(id: string): Promise<InterviewKitRow | null>;
  findKitsByIds(ids: readonly string[]): Promise<InterviewKitRow[]>;
  findActiveKits(filter: {
    companyIds: readonly string[];
    jobId?: string;
    onlyCompanyId?: string;
  }): Promise<InterviewKitRow[]>;
  insertKit(input: NewInterviewKit): Promise<InterviewKitRow>;
  updateKit(id: string, patch: UpdateKitPatch): Promise<InterviewKitRow>;

  findStagesForKit(kitId: string): Promise<InterviewKitStageRow[]>;
  findStageById(id: string): Promise<InterviewKitStageRow | null>;
  findStagesByIds(ids: readonly string[]): Promise<InterviewKitStageRow[]>;
  insertStage(input: NewInterviewKitStage): Promise<InterviewKitStageRow>;
  insertStages(rows: readonly NewInterviewKitStage[]): Promise<InterviewKitStageRow[]>;
  updateStage(id: string, patch: UpdateStagePatch): Promise<InterviewKitStageRow>;
  deleteStage(id: string): Promise<void>;
}

/** Stage question bank (#1390). */
export interface IStageQuestionsRepository {
  findQuestionsForStage(kitStageId: string): Promise<StageQuestionRow[]>;
  findQuestionsForStages(kitStageIds: readonly string[]): Promise<StageQuestionRow[]>;
  findStageQuestionById(id: string): Promise<StageQuestionRow | null>;
  insertStageQuestion(input: NewStageQuestion): Promise<StageQuestionRow>;
  deleteStageQuestion(id: string): Promise<void>;
}

/** Scorecard submissions + their per-attribute ratings. */
export interface IScorecardSubmissionsRepository {
  findSubmissionById(id: string): Promise<ScorecardSubmissionRow | null>;
  findSubmissionsForApplication(applicationId: string): Promise<ScorecardSubmissionRow[]>;
  findSubmissionsForInterview(interviewId: string): Promise<ScorecardSubmissionRow[]>;
  findSubmittedForApplication(applicationId: string): Promise<ScorecardSubmissionRow[]>;
  /** Submitted scorecards for many applications in one inArray read. */
  findSubmittedForApplications(applicationIds: readonly string[]): Promise<ScorecardSubmissionRow[]>;
  insertSubmission(input: NewScorecardSubmission): Promise<ScorecardSubmissionRow>;
  updateSubmission(id: string, patch: UpdateSubmissionPatch): Promise<ScorecardSubmissionRow>;
  /** Apply ONE identical patch to many submissions in a single UPDATE. */
  updateSubmissions(ids: readonly string[], patch: UpdateSubmissionPatch): Promise<void>;

  findRatingsForSubmission(submissionId: string): Promise<ScorecardSubmissionRatingRow[]>;
  findRatingsForSubmissions(submissionIds: readonly string[]): Promise<ScorecardSubmissionRatingRow[]>;
  insertRatings(rows: readonly NewScorecardSubmissionRating[]): Promise<void>;
  upsertRating(input: NewScorecardSubmissionRating): Promise<void>;
  /** Multi-row upsert on (submission_id, attribute_id) — one statement. */
  upsertRatings(rows: readonly NewScorecardSubmissionRating[]): Promise<void>;
}

/** Hiring decisions. */
export interface IHiringDecisionsRepository {
  findDecisionsForApplication(
    applicationId: string,
    companyIds: readonly string[],
  ): Promise<HiringDecisionRow[]>;
  insertDecision(input: NewHiringDecision): Promise<HiringDecisionRow>;
}

/** Reusable competency library (migration 0132 / gap #1382). */
export interface ICompetenciesRepository {
  findCompetencyById(id: string): Promise<CompetencyRow | null>;
  findCompetenciesByIds(ids: readonly string[]): Promise<CompetencyRow[]>;
  findActiveCompetenciesForCompanies(
    companyIds: readonly string[],
  ): Promise<CompetencyRow[]>;
  insertCompetency(input: NewCompetency): Promise<CompetencyRow>;
  updateCompetency(id: string, patch: UpdateCompetencyPatch): Promise<CompetencyRow>;
  findLevelsForCompetencies(
    competencyIds: readonly string[],
  ): Promise<CompetencyLevelRow[]>;
  insertCompetencyLevels(rows: readonly NewCompetencyLevel[]): Promise<CompetencyLevelRow[]>;
  deleteLevelsForCompetency(competencyId: string): Promise<void>;
}

/** SLA scan + interviewer reliability (migration 0132 / gaps #1383, #1434). */
export interface IScorecardSlaRepository {
  findOverdueDraftSubmissions(opts: {
    now: Date;
    remindWithinMs: number;
  }): Promise<OverdueSubmission[]>;
  /** submission → kit-stage → kit `escalateToUserId` for many submissions
   *  in ONE joined read. Submissions without a stage/kit/escalation user
   *  are absent from the map (callers fall back to the evaluator). */
  findEscalationRecipients(submissionIds: readonly string[]): Promise<Map<string, string>>;
  /** Aggregate reliability per interviewer (#1434). */
  findReliabilityForUser(
    evaluatorUserId: string,
    now: Date,
  ): Promise<InterviewerReliability>;
}

/** Evaluator certification gate (#1384). */
export interface IEvaluatorCertificationRepository {
  /** True iff the user holds an active, non-revoked certificate for the
   *  given course AND it has not expired. */
  hasActiveCertification(userId: string, courseId: string, now: Date): Promise<boolean>;
}

/** Take-home assignments + candidate submissions (#1386 + #1438). */
export interface ITakeHomeRepository {
  findTakeHomeForStage(kitStageId: string): Promise<TakeHomeAssignmentRow | null>;
  findTakeHomeById(id: string): Promise<TakeHomeAssignmentRow | null>;
  upsertTakeHomeAssignment(
    input: NewTakeHomeAssignment,
  ): Promise<TakeHomeAssignmentRow>;
  insertTakeHomeSubmission(input: NewTakeHomeSubmission): Promise<TakeHomeSubmissionRow>;
  findTakeHomeSubmissionByToken(token: string): Promise<TakeHomeSubmissionRow | null>;
  findTakeHomeSubmissionById(id: string): Promise<TakeHomeSubmissionRow | null>;
  findTakeHomeSubmissionsForAssignment(
    assignmentId: string,
  ): Promise<TakeHomeSubmissionRow[]>;
  updateTakeHomeSubmission(
    id: string,
    patch: UpdateTakeHomeSubmissionPatch,
  ): Promise<TakeHomeSubmissionRow>;
}
