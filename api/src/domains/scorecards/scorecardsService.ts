/**
 * ScorecardsService — application-layer facade for the structured-hiring
 * bounded context. Route handlers construct it once per request and call
 * its methods; each method delegates to a per-aggregate use-case module
 * that depends only on the narrow repository role(s) it needs:
 *
 *   templateUseCases        — templates + rubric attributes
 *   kitUseCases             — interview kits + stages
 *   stageQuestionUseCases   — stage question bank + kit coverage (#1390)
 *   submissionUseCases      — submission lifecycle, blind review, HM gating
 *   debriefDecisionUseCases — debrief aggregation + hiring decisions
 *   competencyUseCases      — competency library (#1382)
 *   takeHomeUseCases        — take-home assignments + candidate flow
 *   slaUseCases             — interviewer reliability + SLA assignments
 *
 * Errors are thrown as `ServiceError` with a stable `code` so the route
 * layer can map them to HTTP status codes one place.
 */

import type { IScorecardsRepository } from "../../repositories/scorecardsRepository.js";
import type { ScorecardsCtx } from "./context.js";
import type { ScorecardsServiceDeps } from "./deps.js";
import * as templates from "./templateUseCases.js";
import * as kits from "./kitUseCases.js";
import * as stageQuestions from "./stageQuestionUseCases.js";
import * as submissions from "./submissionUseCases.js";
import * as debrief from "./debriefDecisionUseCases.js";
import * as competencies from "./competencyUseCases.js";
import * as takeHome from "./takeHomeUseCases.js";
import * as sla from "./slaUseCases.js";

export { ServiceError, type ServiceErrorCode } from "./errors.js";
export type {
  TemplateWithAttributes,
  KitWithStages,
  SubmissionWithRatings,
  Debrief,
  CompetencyWithLevels,
} from "./results.js";
export { defaultScorecardsServiceDeps, type ScorecardsServiceDeps } from "./deps.js";
export type { ScorecardsCtx, CompanyAccessCtx } from "./context.js";

/** A use case's arguments after its leading `ctx` parameter. */
type UseCaseArgs<F> = F extends (ctx: never, ...rest: infer R) => unknown ? R : never;

export class ScorecardsService {
  private readonly ctx: ScorecardsCtx<IScorecardsRepository>;

  constructor(deps: ScorecardsServiceDeps) {
    this.ctx = { ...deps, now: deps.now ?? (() => new Date()) };
  }

  // ─── Templates ────────────────────────────────────────────────────────────
  listTemplates(...a: UseCaseArgs<typeof templates.listTemplates>) { return templates.listTemplates(this.ctx, ...a); }
  getTemplate(...a: UseCaseArgs<typeof templates.getTemplate>) { return templates.getTemplate(this.ctx, ...a); }
  createTemplate(...a: UseCaseArgs<typeof templates.createTemplate>) { return templates.createTemplate(this.ctx, ...a); }
  updateTemplate(...a: UseCaseArgs<typeof templates.updateTemplate>) { return templates.updateTemplate(this.ctx, ...a); }
  addAttribute(...a: UseCaseArgs<typeof templates.addAttribute>) { return templates.addAttribute(this.ctx, ...a); }
  updateAttribute(...a: UseCaseArgs<typeof templates.updateAttribute>) { return templates.updateAttribute(this.ctx, ...a); }
  deleteAttribute(...a: UseCaseArgs<typeof templates.deleteAttribute>) { return templates.deleteAttribute(this.ctx, ...a); }

  // ─── Kits + stages ────────────────────────────────────────────────────────
  listKits(...a: UseCaseArgs<typeof kits.listKits>) { return kits.listKits(this.ctx, ...a); }
  getKit(...a: UseCaseArgs<typeof kits.getKit>) { return kits.getKit(this.ctx, ...a); }
  createKit(...a: UseCaseArgs<typeof kits.createKit>) { return kits.createKit(this.ctx, ...a); }
  updateKit(...a: UseCaseArgs<typeof kits.updateKit>) { return kits.updateKit(this.ctx, ...a); }
  addStage(...a: UseCaseArgs<typeof kits.addStage>) { return kits.addStage(this.ctx, ...a); }
  updateStage(...a: UseCaseArgs<typeof kits.updateStage>) { return kits.updateStage(this.ctx, ...a); }
  deleteStage(...a: UseCaseArgs<typeof kits.deleteStage>) { return kits.deleteStage(this.ctx, ...a); }

  // ─── Submissions ──────────────────────────────────────────────────────────
  listSubmissions(...a: UseCaseArgs<typeof submissions.listSubmissions>) { return submissions.listSubmissions(this.ctx, ...a); }
  getSubmission(...a: UseCaseArgs<typeof submissions.getSubmission>) { return submissions.getSubmission(this.ctx, ...a); }
  createSubmission(...a: UseCaseArgs<typeof submissions.createSubmission>) { return submissions.createSubmission(this.ctx, ...a); }
  updateSubmission(...a: UseCaseArgs<typeof submissions.updateSubmission>) { return submissions.updateSubmission(this.ctx, ...a); }
  submitSubmission(...a: UseCaseArgs<typeof submissions.submitSubmission>) { return submissions.submitSubmission(this.ctx, ...a); }

  // ─── Debrief + decisions ──────────────────────────────────────────────────
  getDebrief(...a: UseCaseArgs<typeof debrief.getDebrief>) { return debrief.getDebrief(this.ctx, ...a); }
  listDecisions(...a: UseCaseArgs<typeof debrief.listDecisions>) { return debrief.listDecisions(this.ctx, ...a); }
  createDecision(...a: UseCaseArgs<typeof debrief.createDecision>) { return debrief.createDecision(this.ctx, ...a); }

  // ─── Competencies (#1382) ─────────────────────────────────────────────────
  listCompetencies(...a: UseCaseArgs<typeof competencies.listCompetencies>) { return competencies.listCompetencies(this.ctx, ...a); }
  getCompetency(...a: UseCaseArgs<typeof competencies.getCompetency>) { return competencies.getCompetency(this.ctx, ...a); }
  createCompetency(...a: UseCaseArgs<typeof competencies.createCompetency>) { return competencies.createCompetency(this.ctx, ...a); }
  updateCompetency(...a: UseCaseArgs<typeof competencies.updateCompetency>) { return competencies.updateCompetency(this.ctx, ...a); }

  // ─── Stage questions + coverage (#1390) ───────────────────────────────────
  listStageQuestions(...a: UseCaseArgs<typeof stageQuestions.listStageQuestions>) { return stageQuestions.listStageQuestions(this.ctx, ...a); }
  addStageQuestion(...a: UseCaseArgs<typeof stageQuestions.addStageQuestion>) { return stageQuestions.addStageQuestion(this.ctx, ...a); }
  deleteStageQuestion(...a: UseCaseArgs<typeof stageQuestions.deleteStageQuestion>) { return stageQuestions.deleteStageQuestion(this.ctx, ...a); }
  getKitCoverage(...a: UseCaseArgs<typeof stageQuestions.getKitCoverage>) { return stageQuestions.getKitCoverage(this.ctx, ...a); }

  // ─── Take-home (#1386, #1438) ─────────────────────────────────────────────
  getTakeHomeForStage(...a: UseCaseArgs<typeof takeHome.getTakeHomeForStage>) { return takeHome.getTakeHomeForStage(this.ctx, ...a); }
  upsertTakeHome(...a: UseCaseArgs<typeof takeHome.upsertTakeHome>) { return takeHome.upsertTakeHome(this.ctx, ...a); }
  createTakeHomeInvite(...a: UseCaseArgs<typeof takeHome.createTakeHomeInvite>) { return takeHome.createTakeHomeInvite(this.ctx, ...a); }
  getTakeHomeByToken(...a: UseCaseArgs<typeof takeHome.getTakeHomeByToken>) { return takeHome.getTakeHomeByToken(this.ctx, ...a); }
  submitTakeHomeByToken(...a: UseCaseArgs<typeof takeHome.submitTakeHomeByToken>) { return takeHome.submitTakeHomeByToken(this.ctx, ...a); }
  listTakeHomeSubmissions(...a: UseCaseArgs<typeof takeHome.listTakeHomeSubmissions>) { return takeHome.listTakeHomeSubmissions(this.ctx, ...a); }
  startTakeHomeReview(...a: UseCaseArgs<typeof takeHome.startTakeHomeReview>) { return takeHome.startTakeHomeReview(this.ctx, ...a); }

  // ─── Reliability (#1434) + assignments (#1435) ────────────────────────────
  getReliability(...a: UseCaseArgs<typeof sla.getReliability>) { return sla.getReliability(this.ctx, ...a); }
  assignSubmission(...a: UseCaseArgs<typeof sla.assignSubmission>) { return sla.assignSubmission(this.ctx, ...a); }
}
