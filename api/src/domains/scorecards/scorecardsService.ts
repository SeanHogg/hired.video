/**
 * ScorecardsService — application-layer orchestration for the
 * structured-hiring bounded context.
 *
 * Coordinates the repository, the company-scope service, and the pure
 * scoring rules in `./scoring.ts`. Use cases (templates CRUD, kit CRUD,
 * submission lifecycle, debrief, decision) live here so route handlers
 * stay thin HTTP adapters and tests can drive logic without Hono.
 *
 * Errors are thrown as `ServiceError` with a stable `code` so the route
 * layer can map them to HTTP status codes one place.
 */

import {
  IScorecardsRepository,
  ScorecardsRepository,
  type ScorecardTemplateRow,
  type ScorecardAttributeRow,
  type InterviewKitRow,
  type InterviewKitStageRow,
  type ScorecardSubmissionRow,
  type ScorecardSubmissionRatingRow,
  type HiringDecisionRow,
  type CompetencyRow,
  type CompetencyLevelRow,
  type InterviewerReliability,
  type UpdateAttributePatch,
  type UpdateStagePatch,
} from "../../repositories/scorecardsRepository.js";
import { getDb } from "../../db/index.js";
import {
  resolveCompanyScope,
  userCanAccessCompany,
} from "../../services/company/scope.js";
import {
  buildAggregateSnapshot,
  buildAttributeAverages,
  computeOverallScore,
  type AggregateSnapshot,
  type AttributeAverage,
} from "./scoring.js";
import {
  filterSubmissionsForRequester,
  maskCandidateIdentity,
} from "./blindReview.js";
import type {
  CreateDecisionInput,
  CreateKitInput,
  CreateSubmissionInput,
  CreateTemplateInput,
  AttributeInput,
  StageInput,
  RatingInput,
  UpdateKitInput,
  UpdateSubmissionInput,
  UpdateTemplateInput,
  CreateCompetencyInput,
  UpdateCompetencyInput,
} from "./schemas.js";

// ─── Errors ────────────────────────────────────────────────────────────────

export type ServiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_ERROR";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

// ─── Result types ──────────────────────────────────────────────────────────

export interface TemplateWithAttributes extends ScorecardTemplateRow {
  attributes: ScorecardAttributeRow[];
}

export interface KitWithStages extends InterviewKitRow {
  stages: InterviewKitStageRow[];
}

export interface SubmissionWithRatings extends ScorecardSubmissionRow {
  ratings: ScorecardSubmissionRatingRow[];
}

export interface Debrief {
  submissions: ScorecardSubmissionRow[];
  avgScore: AggregateSnapshot["avgScore"];
  recommendations: AggregateSnapshot["recommendations"];
  attributes: AttributeAverage[];
}

export interface CompetencyWithLevels extends CompetencyRow {
  levels: CompetencyLevelRow[];
}

// ─── Service ───────────────────────────────────────────────────────────────

/** Lightweight DI surface — keeps tests off real DB / scope helpers. */
export interface ScorecardsServiceDeps {
  repo: IScorecardsRepository;
  canAccessCompany: (userId: string, companyId: string) => Promise<boolean>;
  getCompanyIdsForUser: (userId: string) => Promise<string[]>;
  now?: () => Date;
}

export function defaultScorecardsServiceDeps(): ScorecardsServiceDeps {
  return {
    repo: new ScorecardsRepository(getDb()),
    canAccessCompany: userCanAccessCompany,
    getCompanyIdsForUser: async (userId: string) =>
      (await resolveCompanyScope(userId)).companyIds,
    now: () => new Date(),
  };
}

export class ScorecardsService {
  private readonly now: () => Date;

  constructor(private readonly deps: ScorecardsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  // ─── Auth helpers ─────────────────────────────────────────────────────────

  private async assertCompanyAccess(userId: string, companyId: string): Promise<void> {
    if (!(await this.deps.canAccessCompany(userId, companyId))) {
      throw new ServiceError("FORBIDDEN", "No access to this company");
    }
  }

  /** Load a template + check the caller can access its company. */
  private async loadTemplate(
    userId: string,
    templateId: string,
  ): Promise<ScorecardTemplateRow> {
    const tpl = await this.deps.repo.findTemplateById(templateId);
    if (!tpl) throw new ServiceError("NOT_FOUND", "Template not found");
    await this.assertCompanyAccess(userId, tpl.companyId);
    return tpl;
  }

  /** Load a kit + check the caller can access its company. */
  private async loadKit(userId: string, kitId: string): Promise<InterviewKitRow> {
    const kit = await this.deps.repo.findKitById(kitId);
    if (!kit) throw new ServiceError("NOT_FOUND", "Kit not found");
    await this.assertCompanyAccess(userId, kit.companyId);
    return kit;
  }

  /**
   * Resolve the kit that governs a submission's review policy. Submissions
   * link to a kit indirectly via `kitStageId` (optional) — submissions
   * created outside a kit return null and behave as "no blind-review
   * policy" (legacy ad-hoc scorecards keep working unchanged).
   */
  private async resolveKitForSubmission(
    sub: Pick<ScorecardSubmissionRow, "kitStageId">,
  ): Promise<InterviewKitRow | null> {
    if (!sub.kitStageId) return null;
    const stage = await this.deps.repo.findStageById(sub.kitStageId);
    if (!stage) return null;
    return this.deps.repo.findKitById(stage.kitId);
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  async listTemplates(
    userId: string,
    onlyCompanyId?: string,
  ): Promise<ScorecardTemplateRow[]> {
    const companyIds = await this.deps.getCompanyIdsForUser(userId);
    if (companyIds.length === 0) return [];
    if (onlyCompanyId && !companyIds.includes(onlyCompanyId)) return [];
    const target = onlyCompanyId ? [onlyCompanyId] : companyIds;
    return this.deps.repo.findActiveTemplatesForCompanies(target);
  }

  async getTemplate(userId: string, id: string): Promise<TemplateWithAttributes> {
    const tpl = await this.loadTemplate(userId, id);
    const attributes = await this.deps.repo.findAttributesForTemplate(tpl.id);
    return { ...tpl, attributes };
  }

  async createTemplate(
    userId: string,
    input: CreateTemplateInput,
  ): Promise<TemplateWithAttributes> {
    await this.assertCompanyAccess(userId, input.companyId);
    const tpl = await this.deps.repo.insertTemplate({
      companyId: input.companyId,
      createdByUserId: userId,
      name: input.name,
      description: input.description,
      ratingScale: input.ratingScale,
      roleFamily: input.roleFamily,
      requiredCertificationCourseId: input.requiredCertificationCourseId ?? null,
    });
    const attributes = await this.deps.repo.insertAttributes(
      input.attributes.map((a, i) => ({
        templateId: tpl.id,
        name: a.name,
        description: a.description,
        displayOrder: a.displayOrder ?? i,
        weight: a.weight ?? 1,
        anchors: a.anchors as Record<string, string> | undefined,
        competencyId: a.competencyId ?? null,
      })),
    );
    return { ...tpl, attributes };
  }

  async updateTemplate(
    userId: string,
    id: string,
    patch: UpdateTemplateInput,
  ): Promise<ScorecardTemplateRow> {
    await this.loadTemplate(userId, id);
    return this.deps.repo.updateTemplate(id, patch);
  }

  async addAttribute(
    userId: string,
    templateId: string,
    input: AttributeInput,
  ): Promise<ScorecardAttributeRow> {
    await this.loadTemplate(userId, templateId);
    return this.deps.repo.insertAttribute({
      templateId,
      name: input.name,
      description: input.description,
      displayOrder: input.displayOrder ?? 0,
      weight: input.weight ?? 1,
      anchors: input.anchors as Record<string, string> | undefined,
      competencyId: input.competencyId ?? null,
    });
  }

  async updateAttribute(
    userId: string,
    id: string,
    patch: Partial<AttributeInput>,
  ): Promise<ScorecardAttributeRow> {
    const attr = await this.deps.repo.findAttributeById(id);
    if (!attr) throw new ServiceError("NOT_FOUND", "Attribute not found");
    await this.loadTemplate(userId, attr.templateId);
    const repoPatch: UpdateAttributePatch = {
      name: patch.name,
      description: patch.description,
      displayOrder: patch.displayOrder,
      weight: patch.weight,
      anchors: patch.anchors,
      competencyId: patch.competencyId,
    };
    return this.deps.repo.updateAttribute(id, repoPatch);
  }

  async deleteAttribute(userId: string, id: string): Promise<void> {
    const attr = await this.deps.repo.findAttributeById(id);
    if (!attr) throw new ServiceError("NOT_FOUND", "Attribute not found");
    await this.loadTemplate(userId, attr.templateId);
    await this.deps.repo.deleteAttribute(id);
  }

  // ─── Kits + stages ────────────────────────────────────────────────────────

  async listKits(
    userId: string,
    filter: { onlyCompanyId?: string; jobId?: string },
  ): Promise<InterviewKitRow[]> {
    const companyIds = await this.deps.getCompanyIdsForUser(userId);
    if (companyIds.length === 0) return [];
    if (filter.onlyCompanyId && !companyIds.includes(filter.onlyCompanyId)) return [];
    return this.deps.repo.findActiveKits({
      companyIds,
      jobId: filter.jobId,
      onlyCompanyId: filter.onlyCompanyId,
    });
  }

  async getKit(userId: string, id: string): Promise<KitWithStages> {
    const kit = await this.loadKit(userId, id);
    const stages = await this.deps.repo.findStagesForKit(kit.id);
    return { ...kit, stages };
  }

  async createKit(userId: string, input: CreateKitInput): Promise<KitWithStages> {
    await this.assertCompanyAccess(userId, input.companyId);
    const kit = await this.deps.repo.insertKit({
      companyId: input.companyId,
      jobId: input.jobId,
      createdByUserId: userId,
      name: input.name,
      description: input.description,
      blindReviewMode: input.blindReviewMode ?? "off",
      escalateToUserId: input.escalateToUserId ?? null,
    });
    const stages = await this.deps.repo.insertStages(
      input.stages.map((s, i) => ({
        kitId: kit.id,
        name: s.name,
        description: s.description,
        displayOrder: s.displayOrder ?? i,
        durationMinutes: s.durationMinutes ?? 60,
        suggestedQuestions: s.suggestedQuestions,
        scorecardTemplateId: s.scorecardTemplateId,
        stageKind: s.stageKind ?? "interview",
      })),
    );
    return { ...kit, stages };
  }

  async updateKit(
    userId: string,
    id: string,
    patch: UpdateKitInput,
  ): Promise<InterviewKitRow> {
    await this.loadKit(userId, id);
    return this.deps.repo.updateKit(id, patch);
  }

  async addStage(
    userId: string,
    kitId: string,
    input: StageInput,
  ): Promise<InterviewKitStageRow> {
    await this.loadKit(userId, kitId);
    return this.deps.repo.insertStage({
      kitId,
      name: input.name,
      description: input.description,
      displayOrder: input.displayOrder ?? 0,
      durationMinutes: input.durationMinutes ?? 60,
      suggestedQuestions: input.suggestedQuestions,
      scorecardTemplateId: input.scorecardTemplateId,
      stageKind: input.stageKind ?? "interview",
    });
  }

  async updateStage(
    userId: string,
    id: string,
    patch: Partial<StageInput>,
  ): Promise<InterviewKitStageRow> {
    const stage = await this.deps.repo.findStageById(id);
    if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
    await this.loadKit(userId, stage.kitId);
    const repoPatch: UpdateStagePatch = {
      name: patch.name,
      description: patch.description,
      displayOrder: patch.displayOrder,
      durationMinutes: patch.durationMinutes,
      suggestedQuestions: patch.suggestedQuestions,
      scorecardTemplateId: patch.scorecardTemplateId,
      stageKind: patch.stageKind,
    };
    return this.deps.repo.updateStage(id, repoPatch);
  }

  async deleteStage(userId: string, id: string): Promise<void> {
    const stage = await this.deps.repo.findStageById(id);
    if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
    await this.loadKit(userId, stage.kitId);
    await this.deps.repo.deleteStage(id);
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  /**
   * List submissions for an application or interview, filtered to those
   * whose template the caller can access. We resolve via templates because
   * submissions are polymorphic in `applicationId`, but every submission
   * carries a template that's owned by a known company.
   */
  async listSubmissions(
    userId: string,
    filter: { applicationId?: string; interviewId?: string },
  ): Promise<ScorecardSubmissionRow[]> {
    if (!filter.applicationId && !filter.interviewId) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "applicationId or interviewId required",
      );
    }
    const subs = filter.applicationId
      ? await this.deps.repo.findSubmissionsForApplication(filter.applicationId)
      : await this.deps.repo.findSubmissionsForInterview(filter.interviewId!);
    if (subs.length === 0) return [];

    // Resolve which templates the caller can read; keep submissions whose
    // template is in that set. We deliberately compute by template-id, not
    // company-id — the variable name now matches the values it holds.
    const templateIds = Array.from(new Set(subs.map((s) => s.templateId)));
    const templates = await Promise.all(
      templateIds.map((id) => this.deps.repo.findTemplateById(id)),
    );
    const visibleTemplateIds = new Set<string>();
    for (const t of templates) {
      if (!t) continue;
      if (await this.deps.canAccessCompany(userId, t.companyId)) {
        visibleTemplateIds.add(t.id);
      }
    }
    const visible = subs.filter((s) => visibleTemplateIds.has(s.templateId));

    // Blind-review peer-hiding (#1380). Group by governing kit because
    // each kit defines its own policy; ungoverned submissions are
    // unaffected. We deliberately do the kit lookup inside the loop
    // (small N, cached by the repo) rather than join in SQL.
    const grouped = new Map<string | "_none", ScorecardSubmissionRow[]>();
    const kitCache = new Map<string, InterviewKitRow | null>();
    for (const sub of visible) {
      const kit = await this.resolveKitForSubmission(sub);
      const key = kit?.id ?? "_none";
      if (kit && !kitCache.has(kit.id)) kitCache.set(kit.id, kit);
      const bucket = grouped.get(key) ?? [];
      bucket.push(sub);
      grouped.set(key, bucket);
    }
    const out: ScorecardSubmissionRow[] = [];
    for (const [key, bucket] of grouped) {
      const kit = key === "_none" ? null : kitCache.get(key) ?? null;
      const filtered = filterSubmissionsForRequester(bucket, kit, userId);
      out.push(
        ...filtered.map((s) => maskCandidateIdentity(s, kit, s.evaluatorUserId === userId)),
      );
    }
    return out;
  }

  async getSubmission(userId: string, id: string): Promise<SubmissionWithRatings> {
    const sub = await this.deps.repo.findSubmissionById(id);
    if (!sub) throw new ServiceError("NOT_FOUND", "Submission not found");
    await this.loadTemplate(userId, sub.templateId);
    const ratings = await this.deps.repo.findRatingsForSubmission(sub.id);
    const kit = await this.resolveKitForSubmission(sub);
    const view = maskCandidateIdentity(sub, kit, sub.evaluatorUserId === userId);
    return { ...view, ratings };
  }

  async createSubmission(
    userId: string,
    input: CreateSubmissionInput,
  ): Promise<ScorecardSubmissionRow> {
    await this.loadTemplate(userId, input.templateId);
    const sub = await this.deps.repo.insertSubmission({
      templateId: input.templateId,
      interviewId: input.interviewId,
      kitStageId: input.kitStageId,
      applicationId: input.applicationId,
      candidateUserId: input.candidateUserId,
      evaluatorUserId: userId,
      overallRecommendation: input.overallRecommendation,
      summary: input.summary,
      strengths: input.strengths,
      concerns: input.concerns,
      status: "draft",
      dueAt: input.dueAt ?? null,
    });
    if (input.ratings && input.ratings.length > 0) {
      await this.deps.repo.insertRatings(
        input.ratings.map((rt) => ({
          submissionId: sub.id,
          attributeId: rt.attributeId,
          rating: rt.rating ?? null,
          notes: rt.notes,
        })),
      );
    }
    return sub;
  }

  async updateSubmission(
    userId: string,
    id: string,
    patch: UpdateSubmissionInput,
  ): Promise<ScorecardSubmissionRow> {
    const sub = await this.deps.repo.findSubmissionById(id);
    if (!sub) throw new ServiceError("NOT_FOUND", "Submission not found");
    if (sub.evaluatorUserId !== userId) {
      throw new ServiceError(
        "FORBIDDEN",
        "Only the evaluator can edit this submission",
      );
    }
    if (sub.status === "submitted") {
      throw new ServiceError(
        "CONFLICT",
        "Submitted scorecards cannot be edited",
      );
    }
    const updated = await this.deps.repo.updateSubmission(id, {
      overallRecommendation: patch.overallRecommendation,
      summary: patch.summary ?? null,
      strengths: patch.strengths ?? null,
      concerns: patch.concerns ?? null,
    });
    if (patch.ratings) {
      for (const rt of patch.ratings) {
        await this.deps.repo.upsertRating({
          submissionId: id,
          attributeId: rt.attributeId,
          rating: rt.rating ?? null,
          notes: rt.notes ?? null,
        });
      }
    }
    return updated;
  }

  /**
   * Finalise a draft submission. Computes the weighted overall score
   * from current ratings and locks the row by setting status=submitted.
   * #1384 cert gate: if the template requires a certification course,
   * the evaluator must hold an active, non-expired, non-revoked cert.
   */
  async submitSubmission(
    userId: string,
    id: string,
  ): Promise<ScorecardSubmissionRow> {
    const sub = await this.deps.repo.findSubmissionById(id);
    if (!sub) throw new ServiceError("NOT_FOUND", "Submission not found");
    if (sub.evaluatorUserId !== userId) {
      throw new ServiceError("FORBIDDEN", "Only the evaluator can submit");
    }
    if (sub.status === "submitted") {
      throw new ServiceError("CONFLICT", "Already submitted");
    }
    const tpl = await this.deps.repo.findTemplateById(sub.templateId);
    if (tpl?.requiredCertificationCourseId) {
      const ok = await this.deps.repo.hasActiveCertification(
        userId,
        tpl.requiredCertificationCourseId,
        this.now(),
      );
      if (!ok) {
        throw new ServiceError(
          "FORBIDDEN",
          "Complete the required training certification before submitting",
        );
      }
    }
    const attrs = await this.deps.repo.findAttributesForTemplate(sub.templateId);
    const ratings = await this.deps.repo.findRatingsForSubmission(sub.id);
    const overallScore = computeOverallScore(
      attrs.map((a) => ({ id: a.id, weight: a.weight })),
      ratings.map((r) => ({ attributeId: r.attributeId, rating: r.rating })),
      tpl?.ratingScale ?? "1-4",
    );
    return this.deps.repo.updateSubmission(id, {
      status: "submitted",
      overallScore,
      submittedAt: this.now(),
    });
  }

  // ─── Debrief ──────────────────────────────────────────────────────────────

  async getDebrief(userId: string, applicationId: string): Promise<Debrief> {
    const subs = await this.deps.repo.findSubmittedForApplication(applicationId);
    if (subs.length === 0) {
      return {
        submissions: [],
        avgScore: null,
        recommendations: {},
        attributes: [],
      };
    }
    const templateIds = Array.from(new Set(subs.map((s) => s.templateId)));
    const templates = await Promise.all(
      templateIds.map((id) => this.deps.repo.findTemplateById(id)),
    );
    let authorised = false;
    for (const t of templates) {
      if (t && (await this.deps.canAccessCompany(userId, t.companyId))) {
        authorised = true;
        break;
      }
    }
    if (!authorised) {
      throw new ServiceError("FORBIDDEN", "No access to this debrief");
    }

    const subIds = subs.map((s) => s.id);
    const ratings = await this.deps.repo.findRatingsForSubmissions(subIds);
    const attrs = await this.deps.repo.findAttributesForTemplates(templateIds);
    const snapshot = buildAggregateSnapshot(subs);
    const attrAvgs = buildAttributeAverages(
      attrs.map((a) => ({ id: a.id, name: a.name })),
      ratings.map((r) => ({ attributeId: r.attributeId, rating: r.rating })),
    );
    return {
      submissions: subs,
      avgScore: snapshot.avgScore,
      recommendations: snapshot.recommendations,
      attributes: attrAvgs,
    };
  }

  // ─── Decisions ────────────────────────────────────────────────────────────

  async listDecisions(
    userId: string,
    applicationId: string,
  ): Promise<HiringDecisionRow[]> {
    const companyIds = await this.deps.getCompanyIdsForUser(userId);
    return this.deps.repo.findDecisionsForApplication(applicationId, companyIds);
  }

  async createDecision(
    userId: string,
    input: CreateDecisionInput,
  ): Promise<HiringDecisionRow> {
    await this.assertCompanyAccess(userId, input.companyId);
    const submitted = await this.deps.repo.findSubmittedForApplication(
      input.applicationId,
    );
    const aggregateSnapshot = buildAggregateSnapshot(submitted);
    return this.deps.repo.insertDecision({
      companyId: input.companyId,
      jobId: input.jobId,
      applicationId: input.applicationId,
      candidateUserId: input.candidateUserId,
      decidedByUserId: userId,
      decision: input.decision,
      reason: input.reason,
      aggregateSnapshot,
    });
  }

  // ─── Competencies (#1382) ─────────────────────────────────────────────────

  async listCompetencies(
    userId: string,
    onlyCompanyId?: string,
  ): Promise<CompetencyWithLevels[]> {
    const companyIds = await this.deps.getCompanyIdsForUser(userId);
    if (companyIds.length === 0) return [];
    if (onlyCompanyId && !companyIds.includes(onlyCompanyId)) return [];
    const target = onlyCompanyId ? [onlyCompanyId] : companyIds;
    const comps = await this.deps.repo.findActiveCompetenciesForCompanies(target);
    if (comps.length === 0) return [];
    const levels = await this.deps.repo.findLevelsForCompetencies(
      comps.map((c) => c.id),
    );
    const byCompetency = new Map<string, CompetencyLevelRow[]>();
    for (const lv of levels) {
      const bucket = byCompetency.get(lv.competencyId) ?? [];
      bucket.push(lv);
      byCompetency.set(lv.competencyId, bucket);
    }
    return comps.map((c) => ({ ...c, levels: byCompetency.get(c.id) ?? [] }));
  }

  async getCompetency(userId: string, id: string): Promise<CompetencyWithLevels> {
    const comp = await this.deps.repo.findCompetencyById(id);
    if (!comp) throw new ServiceError("NOT_FOUND", "Competency not found");
    await this.assertCompanyAccess(userId, comp.companyId);
    const levels = await this.deps.repo.findLevelsForCompetencies([comp.id]);
    return { ...comp, levels };
  }

  async createCompetency(
    userId: string,
    input: CreateCompetencyInput,
  ): Promise<CompetencyWithLevels> {
    await this.assertCompanyAccess(userId, input.companyId);
    const comp = await this.deps.repo.insertCompetency({
      companyId: input.companyId,
      createdByUserId: userId,
      name: input.name,
      description: input.description,
      taxonomy: input.taxonomy,
    });
    const levels =
      input.levels && input.levels.length > 0
        ? await this.deps.repo.insertCompetencyLevels(
            input.levels.map((lv) => ({
              competencyId: comp.id,
              level: lv.level,
              label: lv.label,
              anchor: lv.anchor,
            })),
          )
        : [];
    return { ...comp, levels };
  }

  // ─── Stage questions + coverage (#1390) ───────────────────────────────────

  async listStageQuestions(userId: string, kitStageId: string) {
    const stage = await this.deps.repo.findStageById(kitStageId);
    if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
    await this.loadKit(userId, stage.kitId);
    return this.deps.repo.findQuestionsForStage(kitStageId);
  }

  async addStageQuestion(
    userId: string,
    kitStageId: string,
    input: {
      prompt: string;
      competencyId?: string | null;
      difficulty?: string | null;
      expectedAnswer?: string;
    },
  ) {
    const stage = await this.deps.repo.findStageById(kitStageId);
    if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
    await this.loadKit(userId, stage.kitId);
    return this.deps.repo.insertStageQuestion({
      kitStageId,
      prompt: input.prompt,
      competencyId: input.competencyId ?? null,
      difficulty: input.difficulty ?? null,
      expectedAnswer: input.expectedAnswer ?? "open",
    });
  }

  async deleteStageQuestion(userId: string, id: string) {
    const q = await this.deps.repo.findStageQuestionById(id);
    if (!q) throw new ServiceError("NOT_FOUND", "Question not found");
    const stage = await this.deps.repo.findStageById(q.kitStageId);
    if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
    await this.loadKit(userId, stage.kitId);
    await this.deps.repo.deleteStageQuestion(id);
  }

  /**
   * Coverage warning for a kit — surface attributes (or competencies)
   * the rubric assesses that have NO questions tagged against them.
   * Used by the kit editor to nudge recruiters into closing gaps before
   * sending the loop.
   */
  async getKitCoverage(
    userId: string,
    kitId: string,
  ): Promise<{
    competencyId: string;
    competencyName: string;
    hasQuestions: boolean;
  }[]> {
    const kit = await this.loadKit(userId, kitId);
    const stages = await this.deps.repo.findStagesForKit(kit.id);
    const templateIds = Array.from(
      new Set(
        stages
          .map((s) => s.scorecardTemplateId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (templateIds.length === 0) return [];
    const attrs = await this.deps.repo.findAttributesForTemplates(templateIds);
    const competencyIds = Array.from(
      new Set(
        attrs.map((a) => a.competencyId).filter((id): id is string => Boolean(id)),
      ),
    );
    if (competencyIds.length === 0) return [];
    const allQuestions = (
      await Promise.all(stages.map((s) => this.deps.repo.findQuestionsForStage(s.id)))
    ).flat();
    const competenciesWithQuestions = new Set(
      allQuestions.map((q) => q.competencyId).filter(Boolean) as string[],
    );
    const competencyRows = await Promise.all(
      competencyIds.map((id) => this.deps.repo.findCompetencyById(id)),
    );
    return competencyRows
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => ({
        competencyId: c.id,
        competencyName: c.name,
        hasQuestions: competenciesWithQuestions.has(c.id),
      }));
  }

  // ─── Take-home assignments (#1386) ────────────────────────────────────────

  async getTakeHomeForStage(userId: string, kitStageId: string) {
    const stage = await this.deps.repo.findStageById(kitStageId);
    if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
    await this.loadKit(userId, stage.kitId);
    return this.deps.repo.findTakeHomeForStage(kitStageId);
  }

  async upsertTakeHome(
    userId: string,
    kitStageId: string,
    input: {
      prompt: string;
      deliveryFormat?: string;
      dueInHours?: number;
    },
  ) {
    const stage = await this.deps.repo.findStageById(kitStageId);
    if (!stage) throw new ServiceError("NOT_FOUND", "Stage not found");
    await this.loadKit(userId, stage.kitId);
    return this.deps.repo.upsertTakeHomeAssignment({
      kitStageId,
      prompt: input.prompt,
      deliveryFormat: input.deliveryFormat,
      dueInHours: input.dueInHours,
    });
  }

  // ─── Reliability (#1434) ──────────────────────────────────────────────────

  /**
   * Caller may read their OWN reliability without extra checks (every
   * interviewer can see their own stats). To read someone else's stats,
   * the caller must share at least one company scope with the target —
   * we already trust company-scope as the visibility boundary for the
   * rest of the scorecards aggregate.
   */
  async getReliability(
    userId: string,
    targetUserId: string,
    now: Date = this.now(),
  ): Promise<InterviewerReliability> {
    if (userId !== targetUserId) {
      const callerScopes = await this.deps.getCompanyIdsForUser(userId);
      const targetScopes = await this.deps.getCompanyIdsForUser(targetUserId);
      const shared = callerScopes.some((c) => targetScopes.includes(c));
      if (!shared) {
        throw new ServiceError(
          "FORBIDDEN",
          "No shared workspace with this user",
        );
      }
    }
    return this.deps.repo.findReliabilityForUser(targetUserId, now);
  }

  // ─── Scorecard assignments (#1435) ────────────────────────────────────────

  /**
   * Recruiter-initiated assignment: pre-creates a draft submission keyed
   * to (templateId, applicationId, evaluatorUserId) with the SLA `dueAt`.
   * The evaluator's later `ScorecardSubmissionForm.ensureSubmission` then
   * matches this draft by querying `listSubmissions({ applicationId })`
   * and resuming it instead of creating a new row.
   *
   * Idempotent against (applicationId, evaluatorUserId, templateId): if a
   * draft already exists, the dueAt is updated and the existing row is
   * returned (no duplicate drafts).
   */
  async assignSubmission(
    userId: string,
    input: {
      templateId: string;
      applicationId: string;
      evaluatorUserId: string;
      kitStageId?: string;
      candidateUserId?: string;
      dueAt: Date;
    },
  ): Promise<ScorecardSubmissionRow> {
    const tpl = await this.loadTemplate(userId, input.templateId);
    const existing = await this.deps.repo.findSubmissionsForApplication(
      input.applicationId,
    );
    const match = existing.find(
      (s) =>
        s.templateId === input.templateId &&
        s.evaluatorUserId === input.evaluatorUserId &&
        s.status === "draft",
    );
    if (match) {
      return this.deps.repo.updateSubmission(match.id, { dueAt: input.dueAt });
    }
    return this.deps.repo.insertSubmission({
      templateId: input.templateId,
      applicationId: input.applicationId,
      evaluatorUserId: input.evaluatorUserId,
      kitStageId: input.kitStageId,
      candidateUserId: input.candidateUserId,
      status: "draft",
      dueAt: input.dueAt,
    });
  }

  async updateCompetency(
    userId: string,
    id: string,
    patch: UpdateCompetencyInput & { levels?: CreateCompetencyInput["levels"] },
  ): Promise<CompetencyWithLevels> {
    const existing = await this.deps.repo.findCompetencyById(id);
    if (!existing) throw new ServiceError("NOT_FOUND", "Competency not found");
    await this.assertCompanyAccess(userId, existing.companyId);
    const { levels, ...metaPatch } = patch;
    const updated = await this.deps.repo.updateCompetency(id, metaPatch);
    // Replace-all semantics on levels when provided — keeps the editor
    // simple (the UI sends the full leveled rubric every save).
    if (levels) {
      await this.deps.repo.deleteLevelsForCompetency(id);
      const inserted =
        levels.length > 0
          ? await this.deps.repo.insertCompetencyLevels(
              levels.map((lv) => ({
                competencyId: id,
                level: lv.level,
                label: lv.label,
                anchor: lv.anchor,
              })),
            )
          : [];
      return { ...updated, levels: inserted };
    }
    const existingLevels = await this.deps.repo.findLevelsForCompetencies([id]);
    return { ...updated, levels: existingLevels };
  }
}
