/**
 * Service-layer tests for ScorecardsService against an in-memory fake
 * repository. These cover the orchestration that lives in the service
 * — auth checks, draft → submitted lifecycle, score computation at
 * submit time, evaluator-only edit guard, debrief authorisation.
 *
 * The fake repo implements only the methods the service actually calls
 * for the scenarios under test; anything unused throws so we'd catch a
 * regression that started touching new persistence paths.
 *
 * Run: node --import tsx --test src/domains/scorecards/__tests__/scorecardsService.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ScorecardsService,
  ServiceError,
} from "../scorecardsService.js";
import type {
  IScorecardsRepository,
  ScorecardTemplateRow,
  ScorecardAttributeRow,
  ScorecardSubmissionRow,
  ScorecardSubmissionRatingRow,
  HiringDecisionRow,
  NewScorecardTemplate,
  NewScorecardAttribute,
  NewScorecardSubmission,
  NewScorecardSubmissionRating,
  NewHiringDecision,
} from "../../../repositories/scorecardsRepository.js";

// ─── In-memory fake repo ────────────────────────────────────────────────────

class FakeRepo implements Partial<IScorecardsRepository> {
  templates: ScorecardTemplateRow[] = [];
  attributes: ScorecardAttributeRow[] = [];
  submissions: ScorecardSubmissionRow[] = [];
  ratings: ScorecardSubmissionRatingRow[] = [];
  decisions: HiringDecisionRow[] = [];

  private id = 0;
  private uid() {
    this.id += 1;
    return `id-${this.id}`;
  }

  async findTemplateById(id: string) {
    return this.templates.find((t) => t.id === id) ?? null;
  }

  async insertTemplate(input: NewScorecardTemplate): Promise<ScorecardTemplateRow> {
    const row = {
      id: this.uid(),
      companyId: input.companyId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      description: input.description ?? null,
      ratingScale: input.ratingScale ?? "1-4",
      roleFamily: input.roleFamily ?? null,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ScorecardTemplateRow;
    this.templates.push(row);
    return row;
  }

  async insertAttributes(rows: readonly NewScorecardAttribute[]): Promise<ScorecardAttributeRow[]> {
    const out = rows.map((r) => ({
      id: this.uid(),
      templateId: r.templateId,
      name: r.name,
      description: r.description ?? null,
      displayOrder: r.displayOrder ?? 0,
      weight: r.weight ?? 1,
      anchors: r.anchors ?? null,
      createdAt: new Date(),
    } as unknown as ScorecardAttributeRow));
    this.attributes.push(...out);
    return out;
  }

  async findAttributesForTemplate(templateId: string): Promise<ScorecardAttributeRow[]> {
    return this.attributes.filter((a) => a.templateId === templateId);
  }

  async findSubmissionById(id: string) {
    return this.submissions.find((s) => s.id === id) ?? null;
  }

  async findSubmittedForApplication(applicationId: string): Promise<ScorecardSubmissionRow[]> {
    return this.submissions.filter(
      (s) => s.applicationId === applicationId && s.status === "submitted",
    );
  }

  async findRatingsForSubmission(submissionId: string): Promise<ScorecardSubmissionRatingRow[]> {
    return this.ratings.filter((r) => r.submissionId === submissionId);
  }

  async insertSubmission(input: NewScorecardSubmission): Promise<ScorecardSubmissionRow> {
    const row = {
      id: this.uid(),
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
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ScorecardSubmissionRow;
    this.submissions.push(row);
    return row;
  }

  async updateSubmission(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<ScorecardSubmissionRow> {
    const idx = this.submissions.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("not found");
    const merged = { ...this.submissions[idx], ...patch, updatedAt: new Date() } as ScorecardSubmissionRow;
    this.submissions[idx] = merged;
    return merged;
  }

  async insertRatings(rows: readonly NewScorecardSubmissionRating[]): Promise<void> {
    for (const r of rows) {
      this.ratings.push({
        id: this.uid(),
        submissionId: r.submissionId,
        attributeId: r.attributeId,
        rating: r.rating ?? null,
        notes: r.notes ?? null,
        createdAt: new Date(),
      } as unknown as ScorecardSubmissionRatingRow);
    }
  }

  async insertDecision(input: NewHiringDecision): Promise<HiringDecisionRow> {
    const row = {
      id: this.uid(),
      companyId: input.companyId,
      jobId: input.jobId ?? null,
      applicationId: input.applicationId,
      candidateUserId: input.candidateUserId ?? null,
      decidedByUserId: input.decidedByUserId,
      decision: input.decision,
      reason: input.reason ?? null,
      aggregateSnapshot: input.aggregateSnapshot ?? null,
      decidedAt: new Date(),
      createdAt: new Date(),
    } as unknown as HiringDecisionRow;
    this.decisions.push(row);
    return row;
  }
}

function buildService(opts?: {
  repo?: FakeRepo;
  canAccess?: (userId: string, companyId: string) => boolean;
  companyIdsForUser?: (userId: string) => string[];
}) {
  const repo = opts?.repo ?? new FakeRepo();
  const canAccess = opts?.canAccess ?? (() => true);
  const companyIdsForUser = opts?.companyIdsForUser ?? (() => ["company-1"]);
  const service = new ScorecardsService({
    repo: repo as unknown as IScorecardsRepository,
    canAccessCompany: async (u, c) => canAccess(u, c),
    getCompanyIdsForUser: async (u) => companyIdsForUser(u),
    now: () => new Date("2026-04-26T00:00:00Z"),
  });
  return { service, repo };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("ScorecardsService.createTemplate", () => {
  it("inserts the template and its attributes; stamps creator", async () => {
    const { service, repo } = buildService();
    const tpl = await service.createTemplate("user-1", {
      companyId: "company-1",
      name: "Senior Engineer",
      ratingScale: "1-4",
      attributes: [
        { name: "Communication" },
        { name: "Technical depth" },
      ],
    });
    assert.equal(tpl.name, "Senior Engineer");
    assert.equal(tpl.createdByUserId, "user-1");
    assert.equal(repo.templates.length, 1);
    assert.equal(repo.attributes.length, 2);
    assert.equal(tpl.attributes.length, 2);
  });

  it("rejects when the user can't access the target company", async () => {
    const { service } = buildService({ canAccess: () => false });
    await assert.rejects(
      service.createTemplate("user-1", {
        companyId: "company-1",
        name: "x",
        ratingScale: "1-4",
        attributes: [{ name: "a" }],
      }),
      (err: any) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });
});

describe("ScorecardsService.submitSubmission", () => {
  it("computes weighted overall score from ratings + locks status", async () => {
    const { service, repo } = buildService();
    const tpl = await service.createTemplate("user-1", {
      companyId: "company-1",
      name: "x",
      ratingScale: "1-4",
      attributes: [
        { name: "a", weight: 1 },
        { name: "b", weight: 1 },
      ],
    });
    const draft = await service.createSubmission("user-1", {
      templateId: tpl.id,
      applicationId: "app-1",
      ratings: [
        { attributeId: tpl.attributes[0].id, rating: 4 },
        { attributeId: tpl.attributes[1].id, rating: 2 },
      ],
    });
    assert.equal(draft.status, "draft");

    const submitted = await service.submitSubmission("user-1", draft.id);
    assert.equal(submitted.status, "submitted");
    // (4/4 + 2/4) / 2 = 0.75 → 75
    assert.equal(submitted.overallScore, 75);
    assert.ok(submitted.submittedAt instanceof Date);

    // Persisted state matches
    const stored = repo.submissions.find((s) => s.id === draft.id)!;
    assert.equal(stored.status, "submitted");
    assert.equal(stored.overallScore, 75);
  });

  it("rejects edits to a submitted scorecard", async () => {
    const { service } = buildService();
    const tpl = await service.createTemplate("user-1", {
      companyId: "company-1",
      name: "x",
      ratingScale: "1-4",
      attributes: [{ name: "a" }],
    });
    const draft = await service.createSubmission("user-1", {
      templateId: tpl.id,
      applicationId: "app-1",
      ratings: [{ attributeId: tpl.attributes[0].id, rating: 4 }],
    });
    await service.submitSubmission("user-1", draft.id);

    await assert.rejects(
      service.updateSubmission("user-1", draft.id, { summary: "late edit" }),
      (err: any) => err instanceof ServiceError && err.code === "CONFLICT",
    );
  });

  it("rejects when a different user tries to edit the submission", async () => {
    const { service } = buildService();
    const tpl = await service.createTemplate("user-1", {
      companyId: "company-1",
      name: "x",
      ratingScale: "1-4",
      attributes: [{ name: "a" }],
    });
    const draft = await service.createSubmission("user-1", {
      templateId: tpl.id,
      applicationId: "app-1",
    });

    await assert.rejects(
      service.updateSubmission("user-2", draft.id, { summary: "hijack" }),
      (err: any) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });

  it("returns NOT_FOUND when submission id is unknown", async () => {
    const { service } = buildService();
    await assert.rejects(
      service.submitSubmission("user-1", "missing"),
      (err: any) => err instanceof ServiceError && err.code === "NOT_FOUND",
    );
  });
});

describe("ScorecardsService.createDecision", () => {
  it("snapshots the aggregate state at decision time", async () => {
    const { service, repo } = buildService();
    const tpl = await service.createTemplate("user-1", {
      companyId: "company-1",
      name: "x",
      ratingScale: "1-4",
      attributes: [{ name: "a" }],
    });
    const a = tpl.attributes[0].id;
    const subA = await service.createSubmission("user-1", {
      templateId: tpl.id,
      applicationId: "app-1",
      overallRecommendation: "strong_yes",
      ratings: [{ attributeId: a, rating: 4 }],
    });
    await service.submitSubmission("user-1", subA.id);
    const subB = await service.createSubmission("user-1", {
      templateId: tpl.id,
      applicationId: "app-1",
      overallRecommendation: "yes",
      ratings: [{ attributeId: a, rating: 3 }],
    });
    await service.submitSubmission("user-1", subB.id);

    const decision = await service.createDecision("user-1", {
      companyId: "company-1",
      applicationId: "app-1",
      decision: "approve",
      reason: "Strong loop",
    });

    assert.equal(decision.decision, "approve");
    assert.equal(repo.decisions.length, 1);
    const snap = decision.aggregateSnapshot as any;
    assert.equal(snap.submissionCount, 2);
    assert.equal(snap.recommendations.strong_yes, 1);
    assert.equal(snap.recommendations.yes, 1);
    // (100 + 75)/2 = 87.5 → 88 after rounding
    assert.equal(snap.avgScore, 88);
  });
});

describe("ScorecardsService.getDebrief", () => {
  it("returns zero-state when no submitted scorecards exist", async () => {
    const { service } = buildService();
    const debrief = await service.getDebrief("user-1", "app-empty");
    assert.equal(debrief.submissions.length, 0);
    assert.equal(debrief.avgScore, null);
    assert.deepEqual(debrief.recommendations, {});
    assert.deepEqual(debrief.attributes, []);
  });

  it("rejects FORBIDDEN when user can't access ANY of the templates' companies", async () => {
    const { service } = buildService({ canAccess: () => false });
    // Insert a submission whose template the caller can't access. We need
    // a separate service instance with canAccess=true to seed data, then
    // a fresh one with canAccess=false to assert the gate.
    const seed = buildService();
    const tpl = await seed.service.createTemplate("user-1", {
      companyId: "company-1",
      name: "x",
      ratingScale: "1-4",
      attributes: [{ name: "a" }],
    });
    const sub = await seed.service.createSubmission("user-1", {
      templateId: tpl.id,
      applicationId: "app-1",
    });
    await seed.service.submitSubmission("user-1", sub.id);

    const blocked = new ScorecardsService({
      repo: seed.repo as unknown as IScorecardsRepository,
      canAccessCompany: async () => false,
      getCompanyIdsForUser: async () => [],
    });
    await assert.rejects(
      blocked.getDebrief("intruder", "app-1"),
      (err: any) => err instanceof ServiceError && err.code === "FORBIDDEN",
    );
  });
});
