/**
 * ScorecardsRepository — persistence for the structured-hiring bounded
 * context. Mirrors the existing pattern (CompaniesRepository,
 * HiringPipelineRepository) — typed methods returning domain rows,
 * dependency-injected DB handle for testing.
 *
 * Tables owned:
 *   • scorecard_templates
 *   • scorecard_attributes
 *   • interview_kits
 *   • interview_kit_stages
 *   • scorecard_submissions
 *   • scorecard_submission_ratings
 *   • hiring_decisions
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../db/index.js";

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

export interface NewScorecardTemplate {
  companyId: string;
  createdByUserId: string;
  name: string;
  description?: string | null;
  ratingScale?: string;
  roleFamily?: string | null;
  isArchived?: boolean;
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

export interface IScorecardsRepository {
  // Templates
  findTemplateById(id: string): Promise<ScorecardTemplateRow | null>;
  findActiveTemplatesForCompanies(companyIds: readonly string[]): Promise<ScorecardTemplateRow[]>;
  insertTemplate(input: NewScorecardTemplate): Promise<ScorecardTemplateRow>;
  updateTemplate(id: string, patch: UpdateTemplatePatch): Promise<ScorecardTemplateRow>;

  // Attributes
  findAttributesForTemplate(templateId: string): Promise<ScorecardAttributeRow[]>;
  findAttributesForTemplates(templateIds: readonly string[]): Promise<ScorecardAttributeRow[]>;
  findAttributeById(id: string): Promise<ScorecardAttributeRow | null>;
  insertAttribute(input: NewScorecardAttribute): Promise<ScorecardAttributeRow>;
  insertAttributes(rows: readonly NewScorecardAttribute[]): Promise<ScorecardAttributeRow[]>;
  updateAttribute(id: string, patch: UpdateAttributePatch): Promise<ScorecardAttributeRow>;
  deleteAttribute(id: string): Promise<void>;

  // Kits + stages
  findKitById(id: string): Promise<InterviewKitRow | null>;
  findActiveKits(filter: {
    companyIds: readonly string[];
    jobId?: string;
    onlyCompanyId?: string;
  }): Promise<InterviewKitRow[]>;
  insertKit(input: NewInterviewKit): Promise<InterviewKitRow>;
  updateKit(id: string, patch: UpdateKitPatch): Promise<InterviewKitRow>;

  findStagesForKit(kitId: string): Promise<InterviewKitStageRow[]>;
  findStageById(id: string): Promise<InterviewKitStageRow | null>;
  insertStage(input: NewInterviewKitStage): Promise<InterviewKitStageRow>;
  insertStages(rows: readonly NewInterviewKitStage[]): Promise<InterviewKitStageRow[]>;
  updateStage(id: string, patch: UpdateStagePatch): Promise<InterviewKitStageRow>;
  deleteStage(id: string): Promise<void>;

  // Submissions
  findSubmissionById(id: string): Promise<ScorecardSubmissionRow | null>;
  findSubmissionsForApplication(applicationId: string): Promise<ScorecardSubmissionRow[]>;
  findSubmissionsForInterview(interviewId: string): Promise<ScorecardSubmissionRow[]>;
  findSubmittedForApplication(applicationId: string): Promise<ScorecardSubmissionRow[]>;
  insertSubmission(input: NewScorecardSubmission): Promise<ScorecardSubmissionRow>;
  updateSubmission(id: string, patch: UpdateSubmissionPatch): Promise<ScorecardSubmissionRow>;

  // Ratings
  findRatingsForSubmission(submissionId: string): Promise<ScorecardSubmissionRatingRow[]>;
  findRatingsForSubmissions(submissionIds: readonly string[]): Promise<ScorecardSubmissionRatingRow[]>;
  insertRatings(rows: readonly NewScorecardSubmissionRating[]): Promise<void>;
  upsertRating(input: NewScorecardSubmissionRating): Promise<void>;

  // Decisions
  findDecisionsForApplication(
    applicationId: string,
    companyIds: readonly string[],
  ): Promise<HiringDecisionRow[]>;
  insertDecision(input: NewHiringDecision): Promise<HiringDecisionRow>;

  // Competencies (migration 0132 / gap #1382)
  findCompetencyById(id: string): Promise<CompetencyRow | null>;
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

  // SLA scan (migration 0132 / gap #1383)
  findOverdueDraftSubmissions(opts: {
    now: Date;
    remindWithinMs: number;
  }): Promise<OverdueSubmission[]>;
}

export class ScorecardsRepository implements IScorecardsRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ─── Templates ────────────────────────────────────────────────────────────

  async findTemplateById(id: string): Promise<ScorecardTemplateRow | null> {
    const [row] = await this.db
      .select()
      .from(scorecardTemplates)
      .where(eq(scorecardTemplates.id, id))
      .limit(1);
    return (row as ScorecardTemplateRow) ?? null;
  }

  async findActiveTemplatesForCompanies(
    companyIds: readonly string[],
  ): Promise<ScorecardTemplateRow[]> {
    if (companyIds.length === 0) return [];
    return (await this.db
      .select()
      .from(scorecardTemplates)
      .where(
        and(
          inArray(scorecardTemplates.companyId, companyIds as string[]),
          eq(scorecardTemplates.isArchived, false),
        ),
      )
      .orderBy(desc(scorecardTemplates.updatedAt))) as ScorecardTemplateRow[];
  }

  async insertTemplate(input: NewScorecardTemplate): Promise<ScorecardTemplateRow> {
    const [row] = await this.db.insert(scorecardTemplates).values(input as any).returning();
    return row as ScorecardTemplateRow;
  }

  async updateTemplate(id: string, patch: UpdateTemplatePatch): Promise<ScorecardTemplateRow> {
    const [row] = await this.db
      .update(scorecardTemplates)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(scorecardTemplates.id, id))
      .returning();
    return row as ScorecardTemplateRow;
  }

  // ─── Attributes ───────────────────────────────────────────────────────────

  async findAttributesForTemplate(templateId: string): Promise<ScorecardAttributeRow[]> {
    return (await this.db
      .select()
      .from(scorecardAttributes)
      .where(eq(scorecardAttributes.templateId, templateId))
      .orderBy(asc(scorecardAttributes.displayOrder))) as ScorecardAttributeRow[];
  }

  async findAttributesForTemplates(
    templateIds: readonly string[],
  ): Promise<ScorecardAttributeRow[]> {
    if (templateIds.length === 0) return [];
    return (await this.db
      .select()
      .from(scorecardAttributes)
      .where(inArray(scorecardAttributes.templateId, templateIds as string[]))) as ScorecardAttributeRow[];
  }

  async findAttributeById(id: string): Promise<ScorecardAttributeRow | null> {
    const [row] = await this.db
      .select()
      .from(scorecardAttributes)
      .where(eq(scorecardAttributes.id, id))
      .limit(1);
    return (row as ScorecardAttributeRow) ?? null;
  }

  async insertAttribute(input: NewScorecardAttribute): Promise<ScorecardAttributeRow> {
    const [row] = await this.db.insert(scorecardAttributes).values(input as any).returning();
    return row as ScorecardAttributeRow;
  }

  async insertAttributes(
    rows: readonly NewScorecardAttribute[],
  ): Promise<ScorecardAttributeRow[]> {
    if (rows.length === 0) return [];
    return (await this.db
      .insert(scorecardAttributes)
      .values(rows as any)
      .returning()) as ScorecardAttributeRow[];
  }

  async updateAttribute(id: string, patch: UpdateAttributePatch): Promise<ScorecardAttributeRow> {
    const [row] = await this.db
      .update(scorecardAttributes)
      .set(patch as any)
      .where(eq(scorecardAttributes.id, id))
      .returning();
    return row as ScorecardAttributeRow;
  }

  async deleteAttribute(id: string): Promise<void> {
    await this.db.delete(scorecardAttributes).where(eq(scorecardAttributes.id, id));
  }

  // ─── Kits + stages ────────────────────────────────────────────────────────

  async findKitById(id: string): Promise<InterviewKitRow | null> {
    const [row] = await this.db
      .select()
      .from(interviewKits)
      .where(eq(interviewKits.id, id))
      .limit(1);
    return (row as InterviewKitRow) ?? null;
  }

  async findActiveKits(filter: {
    companyIds: readonly string[];
    jobId?: string;
    onlyCompanyId?: string;
  }): Promise<InterviewKitRow[]> {
    if (filter.companyIds.length === 0) return [];
    const companyClause = filter.onlyCompanyId
      ? eq(interviewKits.companyId, filter.onlyCompanyId)
      : inArray(interviewKits.companyId, filter.companyIds as string[]);
    const where = and(
      companyClause,
      eq(interviewKits.isArchived, false),
      filter.jobId ? eq(interviewKits.jobId, filter.jobId) : undefined,
    );
    return (await this.db
      .select()
      .from(interviewKits)
      .where(where)
      .orderBy(desc(interviewKits.updatedAt))) as InterviewKitRow[];
  }

  async insertKit(input: NewInterviewKit): Promise<InterviewKitRow> {
    const [row] = await this.db.insert(interviewKits).values(input as any).returning();
    return row as InterviewKitRow;
  }

  async updateKit(id: string, patch: UpdateKitPatch): Promise<InterviewKitRow> {
    const [row] = await this.db
      .update(interviewKits)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(interviewKits.id, id))
      .returning();
    return row as InterviewKitRow;
  }

  async findStagesForKit(kitId: string): Promise<InterviewKitStageRow[]> {
    return (await this.db
      .select()
      .from(interviewKitStages)
      .where(eq(interviewKitStages.kitId, kitId))
      .orderBy(asc(interviewKitStages.displayOrder))) as InterviewKitStageRow[];
  }

  async findStageById(id: string): Promise<InterviewKitStageRow | null> {
    const [row] = await this.db
      .select()
      .from(interviewKitStages)
      .where(eq(interviewKitStages.id, id))
      .limit(1);
    return (row as InterviewKitStageRow) ?? null;
  }

  async insertStage(input: NewInterviewKitStage): Promise<InterviewKitStageRow> {
    const [row] = await this.db.insert(interviewKitStages).values(input as any).returning();
    return row as InterviewKitStageRow;
  }

  async insertStages(
    rows: readonly NewInterviewKitStage[],
  ): Promise<InterviewKitStageRow[]> {
    if (rows.length === 0) return [];
    return (await this.db
      .insert(interviewKitStages)
      .values(rows as any)
      .returning()) as InterviewKitStageRow[];
  }

  async updateStage(id: string, patch: UpdateStagePatch): Promise<InterviewKitStageRow> {
    const [row] = await this.db
      .update(interviewKitStages)
      .set(patch as any)
      .where(eq(interviewKitStages.id, id))
      .returning();
    return row as InterviewKitStageRow;
  }

  async deleteStage(id: string): Promise<void> {
    await this.db.delete(interviewKitStages).where(eq(interviewKitStages.id, id));
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  async findSubmissionById(id: string): Promise<ScorecardSubmissionRow | null> {
    const [row] = await this.db
      .select()
      .from(scorecardSubmissions)
      .where(eq(scorecardSubmissions.id, id))
      .limit(1);
    return (row as ScorecardSubmissionRow) ?? null;
  }

  async findSubmissionsForApplication(
    applicationId: string,
  ): Promise<ScorecardSubmissionRow[]> {
    return (await this.db
      .select()
      .from(scorecardSubmissions)
      .where(eq(scorecardSubmissions.applicationId, applicationId))
      .orderBy(desc(scorecardSubmissions.updatedAt))) as ScorecardSubmissionRow[];
  }

  async findSubmissionsForInterview(
    interviewId: string,
  ): Promise<ScorecardSubmissionRow[]> {
    return (await this.db
      .select()
      .from(scorecardSubmissions)
      .where(eq(scorecardSubmissions.interviewId, interviewId))
      .orderBy(desc(scorecardSubmissions.updatedAt))) as ScorecardSubmissionRow[];
  }

  async findSubmittedForApplication(
    applicationId: string,
  ): Promise<ScorecardSubmissionRow[]> {
    return (await this.db
      .select()
      .from(scorecardSubmissions)
      .where(
        and(
          eq(scorecardSubmissions.applicationId, applicationId),
          eq(scorecardSubmissions.status, "submitted"),
        ),
      )) as ScorecardSubmissionRow[];
  }

  async insertSubmission(input: NewScorecardSubmission): Promise<ScorecardSubmissionRow> {
    const [row] = await this.db.insert(scorecardSubmissions).values(input as any).returning();
    return row as ScorecardSubmissionRow;
  }

  async updateSubmission(
    id: string,
    patch: UpdateSubmissionPatch,
  ): Promise<ScorecardSubmissionRow> {
    const [row] = await this.db
      .update(scorecardSubmissions)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(scorecardSubmissions.id, id))
      .returning();
    return row as ScorecardSubmissionRow;
  }

  // ─── Ratings ──────────────────────────────────────────────────────────────

  async findRatingsForSubmission(
    submissionId: string,
  ): Promise<ScorecardSubmissionRatingRow[]> {
    return (await this.db
      .select()
      .from(scorecardSubmissionRatings)
      .where(
        eq(scorecardSubmissionRatings.submissionId, submissionId),
      )) as ScorecardSubmissionRatingRow[];
  }

  async findRatingsForSubmissions(
    submissionIds: readonly string[],
  ): Promise<ScorecardSubmissionRatingRow[]> {
    if (submissionIds.length === 0) return [];
    return (await this.db
      .select()
      .from(scorecardSubmissionRatings)
      .where(
        inArray(scorecardSubmissionRatings.submissionId, submissionIds as string[]),
      )) as ScorecardSubmissionRatingRow[];
  }

  async insertRatings(
    rows: readonly NewScorecardSubmissionRating[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(scorecardSubmissionRatings).values(rows as any);
  }

  async upsertRating(input: NewScorecardSubmissionRating): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(scorecardSubmissionRatings)
      .where(
        and(
          eq(scorecardSubmissionRatings.submissionId, input.submissionId),
          eq(scorecardSubmissionRatings.attributeId, input.attributeId),
        ),
      )
      .limit(1);
    if (existing) {
      await this.db
        .update(scorecardSubmissionRatings)
        .set({ rating: input.rating ?? null, notes: input.notes ?? null } as any)
        .where(eq(scorecardSubmissionRatings.id, (existing as ScorecardSubmissionRatingRow).id));
    } else {
      await this.db.insert(scorecardSubmissionRatings).values(input as any);
    }
  }

  // ─── Decisions ────────────────────────────────────────────────────────────

  async findDecisionsForApplication(
    applicationId: string,
    companyIds: readonly string[],
  ): Promise<HiringDecisionRow[]> {
    if (companyIds.length === 0) return [];
    return (await this.db
      .select()
      .from(hiringDecisions)
      .where(
        and(
          eq(hiringDecisions.applicationId, applicationId),
          inArray(hiringDecisions.companyId, companyIds as string[]),
        ),
      )
      .orderBy(desc(hiringDecisions.decidedAt))) as HiringDecisionRow[];
  }

  async insertDecision(input: NewHiringDecision): Promise<HiringDecisionRow> {
    const [row] = await this.db.insert(hiringDecisions).values(input as any).returning();
    return row as HiringDecisionRow;
  }

  // ─── Competencies (#1382) ─────────────────────────────────────────────────

  async findCompetencyById(id: string): Promise<CompetencyRow | null> {
    const [row] = await this.db
      .select()
      .from(competencies)
      .where(eq(competencies.id, id))
      .limit(1);
    return (row as CompetencyRow) ?? null;
  }

  async findActiveCompetenciesForCompanies(
    companyIds: readonly string[],
  ): Promise<CompetencyRow[]> {
    if (companyIds.length === 0) return [];
    return (await this.db
      .select()
      .from(competencies)
      .where(
        and(
          inArray(competencies.companyId, companyIds as string[]),
          eq(competencies.isArchived, false),
        ),
      )
      .orderBy(asc(competencies.name))) as CompetencyRow[];
  }

  async insertCompetency(input: NewCompetency): Promise<CompetencyRow> {
    const [row] = await this.db.insert(competencies).values(input as any).returning();
    return row as CompetencyRow;
  }

  async updateCompetency(
    id: string,
    patch: UpdateCompetencyPatch,
  ): Promise<CompetencyRow> {
    const [row] = await this.db
      .update(competencies)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(competencies.id, id))
      .returning();
    return row as CompetencyRow;
  }

  async findLevelsForCompetencies(
    competencyIds: readonly string[],
  ): Promise<CompetencyLevelRow[]> {
    if (competencyIds.length === 0) return [];
    return (await this.db
      .select()
      .from(competencyLevels)
      .where(inArray(competencyLevels.competencyId, competencyIds as string[]))
      .orderBy(asc(competencyLevels.level))) as CompetencyLevelRow[];
  }

  async insertCompetencyLevels(
    rows: readonly NewCompetencyLevel[],
  ): Promise<CompetencyLevelRow[]> {
    if (rows.length === 0) return [];
    return (await this.db
      .insert(competencyLevels)
      .values(rows as any[])
      .returning()) as CompetencyLevelRow[];
  }

  async deleteLevelsForCompetency(competencyId: string): Promise<void> {
    await this.db
      .delete(competencyLevels)
      .where(eq(competencyLevels.competencyId, competencyId));
  }

  // ─── SLA scan (#1383) ─────────────────────────────────────────────────────

  async findOverdueDraftSubmissions(opts: {
    now: Date;
    remindWithinMs: number;
  }): Promise<OverdueSubmission[]> {
    const horizon = new Date(opts.now.getTime() + opts.remindWithinMs);
    const rows = (await this.db
      .select()
      .from(scorecardSubmissions)
      .where(
        and(
          eq(scorecardSubmissions.status, "draft"),
          // dueAt IS NOT NULL is implicit because dueAt < horizon excludes nulls
          // in Drizzle's translation; we re-assert via the partial-index path.
        ),
      )) as ScorecardSubmissionRow[];
    return rows
      .filter((r) => r.dueAt != null && r.dueAt < horizon)
      .map((r) => ({
        id: r.id,
        templateId: r.templateId,
        evaluatorUserId: r.evaluatorUserId,
        applicationId: r.applicationId,
        candidateUserId: r.candidateUserId,
        kitStageId: r.kitStageId,
        dueAt: r.dueAt!,
        remindedAt: r.remindedAt,
        escalatedAt: r.escalatedAt,
      }));
  }
}
