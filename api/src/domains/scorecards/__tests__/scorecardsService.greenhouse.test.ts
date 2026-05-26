/**
 * Coverage tests for the Greenhouse-parity additions to ScorecardsService:
 *
 *   • #1382 — competency CRUD + leveled-anchor replace-all semantics
 *   • #1383 — recruiter assignSubmission idempotency + dueAt plumbing
 *   • #1384 — cert gate blocks submitSubmission without an active cert
 *   • #1386 — take-home upsert idempotency
 *   • #1390 — stage-question CRUD + kit-coverage computation
 *   • #1434 — reliability aggregation math (on-time / late / overdue / 30d)
 *
 * Run: node --import tsx --test src/domains/scorecards/__tests__/scorecardsService.greenhouse.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ScorecardsService, ServiceError } from "../scorecardsService.js";
import type {
  IScorecardsRepository,
  ScorecardTemplateRow,
  InterviewKitRow,
  InterviewKitStageRow,
  ScorecardSubmissionRow,
  CompetencyRow,
  CompetencyLevelRow,
  StageQuestionRow,
  TakeHomeAssignmentRow,
  TakeHomeSubmissionRow,
  NewCompetency,
  NewCompetencyLevel,
  NewStageQuestion,
  NewTakeHomeAssignment,
  NewTakeHomeSubmission,
  NewScorecardSubmission,
  ScorecardAttributeRow,
  InterviewerReliability,
} from "../../../repositories/scorecardsRepository.js";

let _id = 0;
const uid = () => `id-${++_id}`;

class FakeRepo implements Partial<IScorecardsRepository> {
  templates: ScorecardTemplateRow[] = [];
  attributes: ScorecardAttributeRow[] = [];
  kits: InterviewKitRow[] = [];
  stages: InterviewKitStageRow[] = [];
  submissions: ScorecardSubmissionRow[] = [];
  competencies: CompetencyRow[] = [];
  competencyLevels: CompetencyLevelRow[] = [];
  stageQuestions: StageQuestionRow[] = [];
  takeHomes: TakeHomeAssignmentRow[] = [];
  takeHomeSubmissions: TakeHomeSubmissionRow[] = [];
  certs: { userId: string; courseId: string; revokedAt: Date | null; expiresAt: Date | null }[] = [];

  async findTemplateById(id: string) {
    return this.templates.find((t) => t.id === id) ?? null;
  }
  async findAttributesForTemplate(templateId: string) {
    return this.attributes.filter((a) => a.templateId === templateId);
  }
  async findAttributesForTemplates(templateIds: readonly string[]) {
    return this.attributes.filter((a) => templateIds.includes(a.templateId));
  }
  async findKitById(id: string) {
    return this.kits.find((k) => k.id === id) ?? null;
  }
  async findStageById(id: string) {
    return this.stages.find((s) => s.id === id) ?? null;
  }
  async findStagesForKit(kitId: string) {
    return this.stages.filter((s) => s.kitId === kitId);
  }

  // Submissions
  async findSubmissionById(id: string) {
    return this.submissions.find((s) => s.id === id) ?? null;
  }
  async findSubmissionsForApplication(applicationId: string) {
    return this.submissions.filter((s) => s.applicationId === applicationId);
  }
  async findRatingsForSubmission(_: string) {
    return [];
  }
  async insertSubmission(input: NewScorecardSubmission): Promise<ScorecardSubmissionRow> {
    const row = {
      id: uid(),
      templateId: input.templateId,
      interviewId: input.interviewId ?? null,
      kitStageId: input.kitStageId ?? null,
      applicationId: input.applicationId,
      candidateUserId: input.candidateUserId ?? null,
      evaluatorUserId: input.evaluatorUserId,
      overallRecommendation: input.overallRecommendation ?? null,
      overallScore: input.overallScore ?? null,
      summary: input.summary ?? null,
      strengths: input.strengths ?? null,
      concerns: input.concerns ?? null,
      status: input.status ?? "draft",
      submittedAt: input.submittedAt ?? null,
      dueAt: input.dueAt ?? null,
      remindedAt: null,
      escalatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ScorecardSubmissionRow;
    this.submissions.push(row);
    return row;
  }
  async updateSubmission(id: string, patch: Record<string, unknown>) {
    const idx = this.submissions.findIndex((s) => s.id === id);
    const merged = {
      ...this.submissions[idx],
      ...patch,
      updatedAt: new Date(),
    } as ScorecardSubmissionRow;
    this.submissions[idx] = merged;
    return merged;
  }

  // Competencies
  async findCompetencyById(id: string) {
    return this.competencies.find((c) => c.id === id) ?? null;
  }
  async findActiveCompetenciesForCompanies(companyIds: readonly string[]) {
    return this.competencies.filter(
      (c) => companyIds.includes(c.companyId) && !c.isArchived,
    );
  }
  async insertCompetency(input: NewCompetency): Promise<CompetencyRow> {
    const row = {
      id: uid(),
      companyId: input.companyId,
      name: input.name,
      description: input.description ?? null,
      taxonomy: input.taxonomy ?? "other",
      isArchived: false,
      createdByUserId: input.createdByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as CompetencyRow;
    this.competencies.push(row);
    return row;
  }
  async updateCompetency(id: string, patch: Record<string, unknown>) {
    const idx = this.competencies.findIndex((c) => c.id === id);
    const merged = { ...this.competencies[idx], ...patch } as CompetencyRow;
    this.competencies[idx] = merged;
    return merged;
  }
  async findLevelsForCompetencies(ids: readonly string[]) {
    return this.competencyLevels.filter((l) => ids.includes(l.competencyId));
  }
  async insertCompetencyLevels(
    rows: readonly NewCompetencyLevel[],
  ): Promise<CompetencyLevelRow[]> {
    const out = rows.map(
      (r) =>
        ({
          id: uid(),
          competencyId: r.competencyId,
          level: r.level,
          label: r.label,
          anchor: r.anchor,
          createdAt: new Date(),
        }) as unknown as CompetencyLevelRow,
    );
    this.competencyLevels.push(...out);
    return out;
  }
  async deleteLevelsForCompetency(competencyId: string) {
    this.competencyLevels = this.competencyLevels.filter(
      (l) => l.competencyId !== competencyId,
    );
  }

  // Stage questions
  async findQuestionsForStage(kitStageId: string) {
    return this.stageQuestions.filter((q) => q.kitStageId === kitStageId);
  }
  async findStageQuestionById(id: string) {
    return this.stageQuestions.find((q) => q.id === id) ?? null;
  }
  async insertStageQuestion(input: NewStageQuestion): Promise<StageQuestionRow> {
    const row = {
      id: uid(),
      kitStageId: input.kitStageId,
      competencyId: input.competencyId ?? null,
      prompt: input.prompt,
      difficulty: input.difficulty ?? null,
      expectedAnswer: input.expectedAnswer ?? "open",
      displayOrder: input.displayOrder ?? 0,
      createdAt: new Date(),
    } as unknown as StageQuestionRow;
    this.stageQuestions.push(row);
    return row;
  }
  async deleteStageQuestion(id: string) {
    this.stageQuestions = this.stageQuestions.filter((q) => q.id !== id);
  }

  // Take-home
  async findTakeHomeForStage(kitStageId: string) {
    return this.takeHomes.find((t) => t.kitStageId === kitStageId) ?? null;
  }
  async upsertTakeHomeAssignment(input: NewTakeHomeAssignment) {
    const existing = this.takeHomes.find((t) => t.kitStageId === input.kitStageId);
    if (existing) {
      const updated = {
        ...existing,
        prompt: input.prompt,
        deliveryFormat: input.deliveryFormat ?? existing.deliveryFormat,
        dueInHours: input.dueInHours ?? existing.dueInHours,
        updatedAt: new Date(),
      } as TakeHomeAssignmentRow;
      const idx = this.takeHomes.findIndex((t) => t.id === existing.id);
      this.takeHomes[idx] = updated;
      return updated;
    }
    const row = {
      id: uid(),
      kitStageId: input.kitStageId,
      prompt: input.prompt,
      deliveryFormat: input.deliveryFormat ?? "github_url",
      dueInHours: input.dueInHours ?? 72,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as TakeHomeAssignmentRow;
    this.takeHomes.push(row);
    return row;
  }

  // Take-home submissions (#1438)
  async findTakeHomeById(id: string) {
    return this.takeHomes.find((t) => t.id === id) ?? null;
  }
  async insertTakeHomeSubmission(input: NewTakeHomeSubmission) {
    const row = {
      id: uid(),
      assignmentId: input.assignmentId,
      applicationId: input.applicationId,
      candidateUserId: input.candidateUserId ?? null,
      deliveryUrl: null,
      fileRefs: [],
      textResponse: null,
      inviteToken: input.inviteToken,
      tokenExpiresAt: input.tokenExpiresAt,
      submittedAt: null,
      evaluatorScorecardSubmissionId: null,
      createdAt: new Date(),
    } as unknown as TakeHomeSubmissionRow;
    this.takeHomeSubmissions.push(row);
    return row;
  }
  async findTakeHomeSubmissionByToken(token: string) {
    return this.takeHomeSubmissions.find((s) => s.inviteToken === token) ?? null;
  }
  async findTakeHomeSubmissionById(id: string) {
    return this.takeHomeSubmissions.find((s) => s.id === id) ?? null;
  }
  async findTakeHomeSubmissionsForAssignment(assignmentId: string) {
    return this.takeHomeSubmissions.filter((s) => s.assignmentId === assignmentId);
  }
  async updateTakeHomeSubmission(id: string, patch: Record<string, unknown>) {
    const idx = this.takeHomeSubmissions.findIndex((s) => s.id === id);
    const merged = { ...this.takeHomeSubmissions[idx], ...patch } as TakeHomeSubmissionRow;
    this.takeHomeSubmissions[idx] = merged;
    return merged;
  }

  // Cert gate
  async hasActiveCertification(userId: string, courseId: string, now: Date) {
    return this.certs.some(
      (c) =>
        c.userId === userId &&
        c.courseId === courseId &&
        c.revokedAt == null &&
        (c.expiresAt == null || c.expiresAt > now),
    );
  }

  // Reliability
  async findReliabilityForUser(
    evaluatorUserId: string,
    now: Date,
  ): Promise<InterviewerReliability> {
    const rows = this.submissions.filter(
      (s) => s.evaluatorUserId === evaluatorUserId,
    );
    let totalWithSla = 0;
    let onTimeCount = 0;
    let lateCount = 0;
    let overdueDraftCount = 0;
    let last30dCount = 0;
    let lagSumMs = 0;
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    for (const r of rows) {
      if (new Date(r.createdAt) >= thirtyDaysAgo) last30dCount++;
      if (
        r.status === "draft" &&
        (r as any).dueAt &&
        new Date((r as any).dueAt) < now
      ) {
        overdueDraftCount++;
        continue;
      }
      if (r.status !== "submitted") continue;
      if (!(r as any).dueAt || !r.submittedAt) continue;
      const lag =
        new Date(r.submittedAt).getTime() - new Date((r as any).dueAt).getTime();
      totalWithSla++;
      lagSumMs += lag;
      if (lag <= 0) onTimeCount++;
      else lateCount++;
    }
    return {
      evaluatorUserId,
      totalWithSla,
      onTimeCount,
      lateCount,
      overdueDraftCount,
      avgLagMs: totalWithSla > 0 ? Math.round(lagSumMs / totalWithSla) : null,
      last30dCount,
    };
  }
}

function buildService(opts?: { canAccess?: boolean; companyIds?: string[] }) {
  const repo = new FakeRepo();
  const service = new ScorecardsService({
    repo: repo as unknown as IScorecardsRepository,
    canAccessCompany: async () => opts?.canAccess ?? true,
    getCompanyIdsForUser: async () => opts?.companyIds ?? ["company-1"],
    now: () => new Date("2026-05-25T12:00:00Z"),
  });
  return { service, repo };
}

function seedTemplate(repo: FakeRepo, extras: Partial<ScorecardTemplateRow> = {}) {
  const tpl = {
    id: uid(),
    companyId: "company-1",
    createdByUserId: "u1",
    name: "T",
    description: null,
    ratingScale: "1-4",
    roleFamily: null,
    requiredCertificationCourseId: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extras,
  } as unknown as ScorecardTemplateRow;
  repo.templates.push(tpl);
  return tpl;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("ScorecardsService #1384 cert gate", () => {
  it("submitSubmission throws FORBIDDEN when template requires cert + evaluator has none", async () => {
    const { service, repo } = buildService();
    const tpl = seedTemplate(repo, {
      requiredCertificationCourseId: "course-1",
    } as any);
    const sub = await repo.insertSubmission({
      templateId: tpl.id,
      applicationId: "app-1",
      evaluatorUserId: "u1",
    });
    await assert.rejects(
      () => service.submitSubmission("u1", sub.id),
      (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });

  it("submitSubmission passes when evaluator holds an active, non-expired cert", async () => {
    const { service, repo } = buildService();
    const tpl = seedTemplate(repo, {
      requiredCertificationCourseId: "course-1",
    } as any);
    const sub = await repo.insertSubmission({
      templateId: tpl.id,
      applicationId: "app-1",
      evaluatorUserId: "u1",
    });
    repo.certs.push({
      userId: "u1",
      courseId: "course-1",
      revokedAt: null,
      expiresAt: null,
    });
    const updated = await service.submitSubmission("u1", sub.id);
    assert.equal(updated.status, "submitted");
  });

  it("submitSubmission still passes when template requires NO cert (back-compat)", async () => {
    const { service, repo } = buildService();
    const tpl = seedTemplate(repo);
    const sub = await repo.insertSubmission({
      templateId: tpl.id,
      applicationId: "app-1",
      evaluatorUserId: "u1",
    });
    const updated = await service.submitSubmission("u1", sub.id);
    assert.equal(updated.status, "submitted");
  });
});

describe("ScorecardsService #1383 + #1435 assignSubmission", () => {
  it("creates a draft when none exists for (template, application, evaluator)", async () => {
    const { service, repo } = buildService();
    const tpl = seedTemplate(repo);
    const due = new Date("2026-06-01T00:00:00Z");
    const sub = await service.assignSubmission("u-assigner", {
      templateId: tpl.id,
      applicationId: "app-1",
      evaluatorUserId: "evaluator-1",
      dueAt: due,
    });
    assert.equal(sub.status, "draft");
    assert.equal((sub as any).dueAt?.toISOString?.() ?? sub.dueAt, due.toISOString());
    assert.equal(repo.submissions.length, 1);
  });

  it("updates dueAt on the existing draft instead of creating a duplicate (idempotent)", async () => {
    const { service, repo } = buildService();
    const tpl = seedTemplate(repo);
    const firstDue = new Date("2026-06-01T00:00:00Z");
    const secondDue = new Date("2026-06-05T00:00:00Z");
    const a = await service.assignSubmission("u-assigner", {
      templateId: tpl.id,
      applicationId: "app-1",
      evaluatorUserId: "evaluator-1",
      dueAt: firstDue,
    });
    const b = await service.assignSubmission("u-assigner", {
      templateId: tpl.id,
      applicationId: "app-1",
      evaluatorUserId: "evaluator-1",
      dueAt: secondDue,
    });
    assert.equal(a.id, b.id);
    assert.equal(repo.submissions.length, 1);
    const stored = repo.submissions[0] as any;
    assert.equal(stored.dueAt.toISOString(), secondDue.toISOString());
  });

  it("creates a new draft for a different evaluator (per-evaluator uniqueness)", async () => {
    const { service, repo } = buildService();
    const tpl = seedTemplate(repo);
    await service.assignSubmission("u-assigner", {
      templateId: tpl.id,
      applicationId: "app-1",
      evaluatorUserId: "evaluator-1",
      dueAt: new Date("2026-06-01T00:00:00Z"),
    });
    await service.assignSubmission("u-assigner", {
      templateId: tpl.id,
      applicationId: "app-1",
      evaluatorUserId: "evaluator-2",
      dueAt: new Date("2026-06-01T00:00:00Z"),
    });
    assert.equal(repo.submissions.length, 2);
  });
});

describe("ScorecardsService #1382 competencies", () => {
  it("createCompetency persists meta + levels via replace-all on update", async () => {
    const { service, repo } = buildService();
    const c = await service.createCompetency("u1", {
      companyId: "company-1",
      name: "Tech Depth",
      taxonomy: "technical",
      levels: [
        { level: 1, label: "L1", anchor: "below" },
        { level: 2, label: "L2", anchor: "meets" },
      ],
    });
    assert.equal(c.levels.length, 2);

    const updated = await service.updateCompetency("u1", c.id, {
      name: "Tech Depth v2",
      levels: [{ level: 3, label: "L3", anchor: "exceeds" }],
    });
    assert.equal(updated.levels.length, 1);
    assert.equal(updated.levels[0].label, "L3");
    // Old levels should be gone.
    assert.equal(
      repo.competencyLevels.filter((l) => l.competencyId === c.id).length,
      1,
    );
  });

  it("updateCompetency without `levels` preserves existing levels", async () => {
    const { service, repo } = buildService();
    const c = await service.createCompetency("u1", {
      companyId: "company-1",
      name: "Tech",
      levels: [{ level: 1, label: "L1", anchor: "x" }],
    });
    const updated = await service.updateCompetency("u1", c.id, {
      name: "Tech 2",
    });
    assert.equal(updated.levels.length, 1);
    assert.equal(updated.name, "Tech 2");
  });

  it("listCompetencies returns only the caller's company set", async () => {
    const { service, repo } = buildService({ companyIds: ["company-1"] });
    await service.createCompetency("u1", {
      companyId: "company-1",
      name: "Inside",
      levels: [],
    });
    // Stranger row from another company.
    repo.competencies.push({
      id: uid(),
      companyId: "company-2",
      name: "Outside",
      description: null,
      taxonomy: "other",
      isArchived: false,
      createdByUserId: "u-other",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as CompetencyRow);
    const list = await service.listCompetencies("u1");
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "Inside");
  });
});

describe("ScorecardsService #1438 take-home invite + delivery flow", () => {
  function seedTakeHomeStage(repo: FakeRepo) {
    const kit = {
      id: uid(),
      companyId: "company-1",
      jobId: null,
      createdByUserId: "u1",
      name: "K",
      description: null,
      blindReviewMode: "off",
      escalateToUserId: null,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as InterviewKitRow;
    const stage = {
      id: uid(),
      kitId: kit.id,
      name: "Take-home",
      description: null,
      stageKind: "take_home",
      displayOrder: 0,
      durationMinutes: 60,
      suggestedQuestions: null,
      scorecardTemplateId: null,
      createdAt: new Date(),
    } as unknown as InterviewKitStageRow;
    repo.kits.push(kit);
    repo.stages.push(stage);
    return { kit, stage };
  }

  it("createTakeHomeInvite rejects when no assignment configured for the stage", async () => {
    const { service, repo } = buildService();
    const { stage } = seedTakeHomeStage(repo);
    await assert.rejects(
      () =>
        service.createTakeHomeInvite("u1", stage.id, {
          applicationId: "app-1",
        }),
      (e: unknown) =>
        e instanceof ServiceError && e.code === "VALIDATION_ERROR",
    );
  });

  it("createTakeHomeInvite mints a token + future expiry", async () => {
    const { service, repo } = buildService();
    const { stage } = seedTakeHomeStage(repo);
    await service.upsertTakeHome("u1", stage.id, {
      prompt: "Build a thing",
      dueInHours: 24,
    });
    const sub = await service.createTakeHomeInvite("u1", stage.id, {
      applicationId: "app-1",
    });
    assert.ok(sub.inviteToken);
    assert.ok(sub.tokenExpiresAt);
    assert.equal(sub.applicationId, "app-1");
  });

  it("createTakeHomeInvite is idempotent over (assignment, applicationId)", async () => {
    const { service, repo } = buildService();
    const { stage } = seedTakeHomeStage(repo);
    await service.upsertTakeHome("u1", stage.id, { prompt: "P" });
    const a = await service.createTakeHomeInvite("u1", stage.id, {
      applicationId: "app-1",
    });
    const b = await service.createTakeHomeInvite("u1", stage.id, {
      applicationId: "app-1",
    });
    assert.equal(a.id, b.id);
    assert.equal(repo.takeHomeSubmissions.length, 1);
  });

  it("getTakeHomeByToken returns expired=true when token is past expiry + no delivery", async () => {
    const { service, repo } = buildService();
    const { stage } = seedTakeHomeStage(repo);
    await service.upsertTakeHome("u1", stage.id, { prompt: "P", dueInHours: 1 });
    const sub = await service.createTakeHomeInvite("u1", stage.id, {
      applicationId: "app-1",
    });
    // Force expiry into the past.
    sub.tokenExpiresAt = new Date("2026-05-25T11:00:00Z");
    const view = await service.getTakeHomeByToken(sub.inviteToken!);
    assert.equal(view.expired, true);
    assert.equal(view.alreadySubmitted, false);
  });

  it("submitTakeHomeByToken records the delivery + stamps submittedAt", async () => {
    const { service, repo } = buildService();
    const { stage } = seedTakeHomeStage(repo);
    await service.upsertTakeHome("u1", stage.id, { prompt: "P" });
    const sub = await service.createTakeHomeInvite("u1", stage.id, {
      applicationId: "app-1",
    });
    const submitted = await service.submitTakeHomeByToken(sub.inviteToken!, {
      deliveryUrl: "https://github.com/user/repo",
    });
    assert.equal(submitted.deliveryUrl, "https://github.com/user/repo");
    assert.ok(submitted.submittedAt);
  });

  it("submitTakeHomeByToken rejects CONFLICT on second submit", async () => {
    const { service, repo } = buildService();
    const { stage } = seedTakeHomeStage(repo);
    await service.upsertTakeHome("u1", stage.id, { prompt: "P" });
    const sub = await service.createTakeHomeInvite("u1", stage.id, {
      applicationId: "app-1",
    });
    await service.submitTakeHomeByToken(sub.inviteToken!, {
      deliveryUrl: "https://example.com/1",
    });
    await assert.rejects(
      () =>
        service.submitTakeHomeByToken(sub.inviteToken!, {
          deliveryUrl: "https://example.com/2",
        }),
      (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
    );
  });

  it("submitTakeHomeByToken requires at least one delivery payload", async () => {
    const { service, repo } = buildService();
    const { stage } = seedTakeHomeStage(repo);
    await service.upsertTakeHome("u1", stage.id, { prompt: "P" });
    const sub = await service.createTakeHomeInvite("u1", stage.id, {
      applicationId: "app-1",
    });
    await assert.rejects(
      () => service.submitTakeHomeByToken(sub.inviteToken!, {}),
      (e: unknown) =>
        e instanceof ServiceError && e.code === "VALIDATION_ERROR",
    );
  });

  it("startTakeHomeReview lazy-creates a scorecard + links it back, idempotent", async () => {
    const { service, repo } = buildService();
    const { stage } = seedTakeHomeStage(repo);
    const tpl = seedTemplate(repo);
    await service.upsertTakeHome("u1", stage.id, { prompt: "P" });
    const sub = await service.createTakeHomeInvite("u1", stage.id, {
      applicationId: "app-1",
    });
    await service.submitTakeHomeByToken(sub.inviteToken!, {
      deliveryUrl: "https://example.com",
    });

    const a = await service.startTakeHomeReview("u1", sub.id, tpl.id);
    const b = await service.startTakeHomeReview("u1", sub.id, tpl.id);
    assert.equal(a.scorecardSubmissionId, b.scorecardSubmissionId);
    // Only one scorecard created across both calls.
    assert.equal(repo.submissions.length, 1);
    // Take-home submission carries the link.
    const linked = repo.takeHomeSubmissions[0];
    assert.equal(
      linked.evaluatorScorecardSubmissionId,
      a.scorecardSubmissionId,
    );
  });
});

describe("ScorecardsService #1386 take-home upsert", () => {
  it("upsertTakeHome creates one row and then updates in place (idempotent per stage)", async () => {
    const { service, repo } = buildService();
    const kit = {
      id: uid(),
      companyId: "company-1",
      jobId: null,
      createdByUserId: "u1",
      name: "Kit",
      description: null,
      blindReviewMode: "off",
      escalateToUserId: null,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as InterviewKitRow;
    const stage = {
      id: uid(),
      kitId: kit.id,
      name: "Take-home",
      description: null,
      stageKind: "take_home",
      displayOrder: 0,
      durationMinutes: 60,
      suggestedQuestions: null,
      scorecardTemplateId: null,
      createdAt: new Date(),
    } as unknown as InterviewKitStageRow;
    repo.kits.push(kit);
    repo.stages.push(stage);

    const a = await service.upsertTakeHome("u1", stage.id, {
      prompt: "Build a thing",
      deliveryFormat: "github_url",
      dueInHours: 72,
    });
    const b = await service.upsertTakeHome("u1", stage.id, {
      prompt: "Build a different thing",
      dueInHours: 48,
    });
    assert.equal(a.id, b.id);
    assert.equal(repo.takeHomes.length, 1);
    assert.equal(repo.takeHomes[0].prompt, "Build a different thing");
    assert.equal(repo.takeHomes[0].dueInHours, 48);
  });
});

describe("ScorecardsService #1390 stage questions + coverage", () => {
  function seedKitWithCoveredAndUncoveredCompetency(repo: FakeRepo) {
    const kit = {
      id: uid(),
      companyId: "company-1",
      createdByUserId: "u1",
      name: "K",
      description: null,
      blindReviewMode: "off",
      escalateToUserId: null,
      jobId: null,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as InterviewKitRow;
    repo.kits.push(kit);

    const tpl = seedTemplate(repo);
    const stage = {
      id: uid(),
      kitId: kit.id,
      name: "Onsite",
      description: null,
      stageKind: "interview",
      displayOrder: 0,
      durationMinutes: 60,
      suggestedQuestions: null,
      scorecardTemplateId: tpl.id,
      createdAt: new Date(),
    } as unknown as InterviewKitStageRow;
    repo.stages.push(stage);

    const techComp = {
      id: uid(),
      companyId: "company-1",
      name: "Tech Depth",
      description: null,
      taxonomy: "technical",
      isArchived: false,
      createdByUserId: "u1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as CompetencyRow;
    const leadComp = {
      id: uid(),
      companyId: "company-1",
      name: "Leadership",
      description: null,
      taxonomy: "leadership",
      isArchived: false,
      createdByUserId: "u1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as CompetencyRow;
    repo.competencies.push(techComp, leadComp);

    repo.attributes.push(
      {
        id: uid(),
        templateId: tpl.id,
        competencyId: techComp.id,
        name: "Tech",
        description: null,
        displayOrder: 0,
        weight: 1,
        anchors: null,
        createdAt: new Date(),
      } as unknown as ScorecardAttributeRow,
      {
        id: uid(),
        templateId: tpl.id,
        competencyId: leadComp.id,
        name: "Lead",
        description: null,
        displayOrder: 1,
        weight: 1,
        anchors: null,
        createdAt: new Date(),
      } as unknown as ScorecardAttributeRow,
    );

    return { kit, stage, techComp, leadComp };
  }

  it("addStageQuestion persists the question with competency + difficulty + expectedAnswer", async () => {
    const { service, repo } = buildService();
    const { stage, techComp } = seedKitWithCoveredAndUncoveredCompetency(repo);
    const q = await service.addStageQuestion("u1", stage.id, {
      prompt: "Walk me through a system you designed",
      competencyId: techComp.id,
      difficulty: "L4",
      expectedAnswer: "star",
    });
    assert.equal(q.competencyId, techComp.id);
    assert.equal(q.expectedAnswer, "star");
    assert.equal(repo.stageQuestions.length, 1);
  });

  it("getKitCoverage flags competencies that have NO tagged questions", async () => {
    const { service, repo } = buildService();
    const { kit, stage, techComp, leadComp } =
      seedKitWithCoveredAndUncoveredCompetency(repo);
    await service.addStageQuestion("u1", stage.id, {
      prompt: "Tech question",
      competencyId: techComp.id,
    });
    const coverage = await service.getKitCoverage("u1", kit.id);
    const tech = coverage.find((c) => c.competencyId === techComp.id);
    const lead = coverage.find((c) => c.competencyId === leadComp.id);
    assert.equal(tech?.hasQuestions, true);
    assert.equal(lead?.hasQuestions, false);
  });

  it("deleteStageQuestion rejects when caller doesn't have access to the kit's company", async () => {
    const { service, repo } = buildService();
    const { stage, techComp } = seedKitWithCoveredAndUncoveredCompetency(repo);
    const q = await service.addStageQuestion("u1", stage.id, {
      prompt: "Q",
      competencyId: techComp.id,
    });
    // Build a second service whose caller can't access company-1.
    const lockedService = new ScorecardsService({
      repo: repo as unknown as IScorecardsRepository,
      canAccessCompany: async () => false,
      getCompanyIdsForUser: async () => [],
      now: () => new Date(),
    });
    await assert.rejects(
      () => lockedService.deleteStageQuestion("u-stranger", q.id),
      (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
    // Question still exists.
    assert.equal(repo.stageQuestions.length, 1);
  });

  it("getKitCoverage returns empty when no stage templates reference a competency", async () => {
    const { service, repo } = buildService();
    const kit = {
      id: uid(),
      companyId: "company-1",
      createdByUserId: "u1",
      name: "K",
      description: null,
      blindReviewMode: "off",
      escalateToUserId: null,
      jobId: null,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as InterviewKitRow;
    repo.kits.push(kit);
    const coverage = await service.getKitCoverage("u1", kit.id);
    assert.deepEqual(coverage, []);
  });
});

describe("ScorecardsService #1434 reliability aggregation", () => {
  it("counts on-time vs late submissions and computes avg lag", async () => {
    const { service, repo } = buildService();
    const tpl = seedTemplate(repo);
    const HOUR = 60 * 60 * 1000;
    const now = new Date("2026-05-25T12:00:00Z");
    // On time (1h early) — completed yesterday.
    repo.submissions.push({
      id: uid(),
      templateId: tpl.id,
      applicationId: "app-1",
      evaluatorUserId: "u-eval",
      status: "submitted",
      dueAt: new Date(now.getTime() - 24 * HOUR),
      submittedAt: new Date(now.getTime() - 25 * HOUR),
      createdAt: new Date(now.getTime() - 26 * HOUR),
      updatedAt: now,
    } as unknown as ScorecardSubmissionRow);
    // Late by 2h.
    repo.submissions.push({
      id: uid(),
      templateId: tpl.id,
      applicationId: "app-2",
      evaluatorUserId: "u-eval",
      status: "submitted",
      dueAt: new Date(now.getTime() - 24 * HOUR),
      submittedAt: new Date(now.getTime() - 22 * HOUR),
      createdAt: new Date(now.getTime() - 26 * HOUR),
      updatedAt: now,
    } as unknown as ScorecardSubmissionRow);
    // Overdue draft.
    repo.submissions.push({
      id: uid(),
      templateId: tpl.id,
      applicationId: "app-3",
      evaluatorUserId: "u-eval",
      status: "draft",
      dueAt: new Date(now.getTime() - HOUR),
      submittedAt: null,
      createdAt: new Date(now.getTime() - 2 * HOUR),
      updatedAt: now,
    } as unknown as ScorecardSubmissionRow);

    const r = await service.getReliability("u-eval", "u-eval", now);
    assert.equal(r.totalWithSla, 2);
    assert.equal(r.onTimeCount, 1);
    assert.equal(r.lateCount, 1);
    assert.equal(r.overdueDraftCount, 1);
    assert.equal(r.last30dCount, 3);
    // avg lag = (-1h + 2h) / 2 = 0.5h = 1_800_000ms
    assert.equal(r.avgLagMs, Math.round(((-HOUR) + 2 * HOUR) / 2));
  });

  it("rejects reading another user's stats without shared workspace", async () => {
    const { service } = buildService({ companyIds: ["company-a"] });
    // Build a service where the target has a different scope.
    const repo = new FakeRepo();
    const otherService = new ScorecardsService({
      repo: repo as unknown as IScorecardsRepository,
      canAccessCompany: async () => true,
      getCompanyIdsForUser: async (uid: string) =>
        uid === "caller" ? ["company-a"] : ["company-z"],
      now: () => new Date(),
    });
    await assert.rejects(
      () => otherService.getReliability("caller", "stranger"),
      (err: unknown) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });
});
