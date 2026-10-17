/**
 * ScorecardsRepository — persistence for the structured-hiring bounded
 * context. Composition root over the per-aggregate repositories in
 * `./scorecards/`; each aggregate has its own role interface so use cases
 * depend only on what they touch. `IScorecardsRepository` is their union
 * and `ScorecardsRepository` keeps the historical `new ScorecardsRepository(db)`
 * entry point working for every caller.
 *
 * Tables owned:
 *   • scorecard_templates / scorecard_attributes      → templatesRepository
 *   • interview_kits / interview_kit_stages           → kitsRepository
 *   • interview_stage_questions                       → stageQuestionsRepository
 *   • scorecard_submissions / _ratings                → submissionsRepository
 *   • hiring_decisions                                → decisionsRepository
 *   • competencies / competency_levels                → competenciesRepository
 *   • take_home_assignments / take_home_submissions   → takeHomeRepository
 *   (SLA scan + reliability → slaRepository; cert gate → certificationRepository)
 */

import type {
  ICompetenciesRepository,
  IEvaluatorCertificationRepository,
  IHiringDecisionsRepository,
  IInterviewKitsRepository,
  IScorecardSlaRepository,
  IScorecardSubmissionsRepository,
  IScorecardTemplatesRepository,
  IStageQuestionsRepository,
  ITakeHomeRepository,
} from "./scorecards/interfaces.js";
import type {
  DbLike,
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
  UpdateAttributePatch,
  UpdateCompetencyPatch,
  UpdateKitPatch,
  UpdateStagePatch,
  UpdateSubmissionPatch,
  UpdateTakeHomeSubmissionPatch,
  UpdateTemplatePatch,
} from "./scorecards/types.js";
import { ScorecardTemplatesRepository } from "./scorecards/templatesRepository.js";
import { InterviewKitsRepository } from "./scorecards/kitsRepository.js";
import { StageQuestionsRepository } from "./scorecards/stageQuestionsRepository.js";
import { ScorecardSubmissionsRepository } from "./scorecards/submissionsRepository.js";
import { HiringDecisionsRepository } from "./scorecards/decisionsRepository.js";
import { CompetenciesRepository } from "./scorecards/competenciesRepository.js";
import { ScorecardSlaRepository } from "./scorecards/slaRepository.js";
import { EvaluatorCertificationRepository } from "./scorecards/certificationRepository.js";
import { TakeHomeRepository } from "./scorecards/takeHomeRepository.js";

export * from "./scorecards/types.js";
export type {
  ICompetenciesRepository,
  IEvaluatorCertificationRepository,
  IHiringDecisionsRepository,
  IInterviewKitsRepository,
  IScorecardSlaRepository,
  IScorecardSubmissionsRepository,
  IScorecardTemplatesRepository,
  IStageQuestionsRepository,
  ITakeHomeRepository,
} from "./scorecards/interfaces.js";

export interface IScorecardsRepository
  extends IScorecardTemplatesRepository,
    IInterviewKitsRepository,
    IStageQuestionsRepository,
    IScorecardSubmissionsRepository,
    IHiringDecisionsRepository,
    ICompetenciesRepository,
    IScorecardSlaRepository,
    IEvaluatorCertificationRepository,
    ITakeHomeRepository {}

export class ScorecardsRepository implements IScorecardsRepository {
  private readonly templates: ScorecardTemplatesRepository;
  private readonly kits: InterviewKitsRepository;
  private readonly questions: StageQuestionsRepository;
  private readonly submissions: ScorecardSubmissionsRepository;
  private readonly decisions: HiringDecisionsRepository;
  private readonly competencies: CompetenciesRepository;
  private readonly sla: ScorecardSlaRepository;
  private readonly certifications: EvaluatorCertificationRepository;
  private readonly takeHome: TakeHomeRepository;

  constructor(db: DbLike, now: () => Date = () => new Date()) {
    this.templates = new ScorecardTemplatesRepository(db, now);
    this.kits = new InterviewKitsRepository(db, now);
    this.questions = new StageQuestionsRepository(db);
    this.submissions = new ScorecardSubmissionsRepository(db, now);
    this.decisions = new HiringDecisionsRepository(db);
    this.competencies = new CompetenciesRepository(db, now);
    this.sla = new ScorecardSlaRepository(db);
    this.certifications = new EvaluatorCertificationRepository(db);
    this.takeHome = new TakeHomeRepository(db, now);
  }

  // ─── Templates + attributes ───────────────────────────────────────────────
  findTemplateById(id: string) { return this.templates.findTemplateById(id); }
  findTemplatesByIds(ids: readonly string[]) { return this.templates.findTemplatesByIds(ids); }
  findActiveTemplatesForCompanies(companyIds: readonly string[]) { return this.templates.findActiveTemplatesForCompanies(companyIds); }
  insertTemplate(input: NewScorecardTemplate) { return this.templates.insertTemplate(input); }
  updateTemplate(id: string, patch: UpdateTemplatePatch) { return this.templates.updateTemplate(id, patch); }
  findAttributesForTemplate(templateId: string) { return this.templates.findAttributesForTemplate(templateId); }
  findAttributesForTemplates(templateIds: readonly string[]) { return this.templates.findAttributesForTemplates(templateIds); }
  findAttributeById(id: string) { return this.templates.findAttributeById(id); }
  insertAttribute(input: NewScorecardAttribute) { return this.templates.insertAttribute(input); }
  insertAttributes(rows: readonly NewScorecardAttribute[]) { return this.templates.insertAttributes(rows); }
  updateAttribute(id: string, patch: UpdateAttributePatch) { return this.templates.updateAttribute(id, patch); }
  deleteAttribute(id: string) { return this.templates.deleteAttribute(id); }

  // ─── Kits + stages ────────────────────────────────────────────────────────
  findKitById(id: string) { return this.kits.findKitById(id); }
  findKitsByIds(ids: readonly string[]) { return this.kits.findKitsByIds(ids); }
  findActiveKits(filter: { companyIds: readonly string[]; jobId?: string; onlyCompanyId?: string }) { return this.kits.findActiveKits(filter); }
  insertKit(input: NewInterviewKit) { return this.kits.insertKit(input); }
  updateKit(id: string, patch: UpdateKitPatch) { return this.kits.updateKit(id, patch); }
  findStagesForKit(kitId: string) { return this.kits.findStagesForKit(kitId); }
  findStageById(id: string) { return this.kits.findStageById(id); }
  findStagesByIds(ids: readonly string[]) { return this.kits.findStagesByIds(ids); }
  insertStage(input: NewInterviewKitStage) { return this.kits.insertStage(input); }
  insertStages(rows: readonly NewInterviewKitStage[]) { return this.kits.insertStages(rows); }
  updateStage(id: string, patch: UpdateStagePatch) { return this.kits.updateStage(id, patch); }
  deleteStage(id: string) { return this.kits.deleteStage(id); }

  // ─── Stage questions (#1390) ──────────────────────────────────────────────
  findQuestionsForStage(kitStageId: string) { return this.questions.findQuestionsForStage(kitStageId); }
  findQuestionsForStages(kitStageIds: readonly string[]) { return this.questions.findQuestionsForStages(kitStageIds); }
  findStageQuestionById(id: string) { return this.questions.findStageQuestionById(id); }
  insertStageQuestion(input: NewStageQuestion) { return this.questions.insertStageQuestion(input); }
  deleteStageQuestion(id: string) { return this.questions.deleteStageQuestion(id); }

  // ─── Submissions + ratings ────────────────────────────────────────────────
  findSubmissionById(id: string) { return this.submissions.findSubmissionById(id); }
  findSubmissionsForApplication(applicationId: string) { return this.submissions.findSubmissionsForApplication(applicationId); }
  findSubmissionsForInterview(interviewId: string) { return this.submissions.findSubmissionsForInterview(interviewId); }
  findSubmittedForApplication(applicationId: string) { return this.submissions.findSubmittedForApplication(applicationId); }
  findSubmittedForApplications(applicationIds: readonly string[]) { return this.submissions.findSubmittedForApplications(applicationIds); }
  insertSubmission(input: NewScorecardSubmission) { return this.submissions.insertSubmission(input); }
  updateSubmission(id: string, patch: UpdateSubmissionPatch) { return this.submissions.updateSubmission(id, patch); }
  updateSubmissions(ids: readonly string[], patch: UpdateSubmissionPatch) { return this.submissions.updateSubmissions(ids, patch); }
  findRatingsForSubmission(submissionId: string) { return this.submissions.findRatingsForSubmission(submissionId); }
  findRatingsForSubmissions(submissionIds: readonly string[]) { return this.submissions.findRatingsForSubmissions(submissionIds); }
  insertRatings(rows: readonly NewScorecardSubmissionRating[]) { return this.submissions.insertRatings(rows); }
  upsertRating(input: NewScorecardSubmissionRating) { return this.submissions.upsertRating(input); }
  upsertRatings(rows: readonly NewScorecardSubmissionRating[]) { return this.submissions.upsertRatings(rows); }

  // ─── Decisions ────────────────────────────────────────────────────────────
  findDecisionsForApplication(applicationId: string, companyIds: readonly string[]) { return this.decisions.findDecisionsForApplication(applicationId, companyIds); }
  insertDecision(input: NewHiringDecision) { return this.decisions.insertDecision(input); }

  // ─── Competencies (#1382) ─────────────────────────────────────────────────
  findCompetencyById(id: string) { return this.competencies.findCompetencyById(id); }
  findCompetenciesByIds(ids: readonly string[]) { return this.competencies.findCompetenciesByIds(ids); }
  findActiveCompetenciesForCompanies(companyIds: readonly string[]) { return this.competencies.findActiveCompetenciesForCompanies(companyIds); }
  insertCompetency(input: NewCompetency) { return this.competencies.insertCompetency(input); }
  updateCompetency(id: string, patch: UpdateCompetencyPatch) { return this.competencies.updateCompetency(id, patch); }
  findLevelsForCompetencies(competencyIds: readonly string[]) { return this.competencies.findLevelsForCompetencies(competencyIds); }
  insertCompetencyLevels(rows: readonly NewCompetencyLevel[]) { return this.competencies.insertCompetencyLevels(rows); }
  deleteLevelsForCompetency(competencyId: string) { return this.competencies.deleteLevelsForCompetency(competencyId); }

  // ─── SLA + reliability (#1383, #1434) + cert gate (#1384) ─────────────────
  findOverdueDraftSubmissions(opts: { now: Date; remindWithinMs: number }) { return this.sla.findOverdueDraftSubmissions(opts); }
  findEscalationRecipients(submissionIds: readonly string[]) { return this.sla.findEscalationRecipients(submissionIds); }
  findReliabilityForUser(evaluatorUserId: string, now: Date) { return this.sla.findReliabilityForUser(evaluatorUserId, now); }
  hasActiveCertification(userId: string, courseId: string, now: Date) { return this.certifications.hasActiveCertification(userId, courseId, now); }

  // ─── Take-home (#1386, #1438) ─────────────────────────────────────────────
  findTakeHomeForStage(kitStageId: string) { return this.takeHome.findTakeHomeForStage(kitStageId); }
  findTakeHomeById(id: string) { return this.takeHome.findTakeHomeById(id); }
  upsertTakeHomeAssignment(input: NewTakeHomeAssignment) { return this.takeHome.upsertTakeHomeAssignment(input); }
  insertTakeHomeSubmission(input: NewTakeHomeSubmission) { return this.takeHome.insertTakeHomeSubmission(input); }
  findTakeHomeSubmissionByToken(token: string) { return this.takeHome.findTakeHomeSubmissionByToken(token); }
  findTakeHomeSubmissionById(id: string) { return this.takeHome.findTakeHomeSubmissionById(id); }
  findTakeHomeSubmissionsForAssignment(assignmentId: string) { return this.takeHome.findTakeHomeSubmissionsForAssignment(assignmentId); }
  updateTakeHomeSubmission(id: string, patch: UpdateTakeHomeSubmissionPatch) { return this.takeHome.updateTakeHomeSubmission(id, patch); }
}
