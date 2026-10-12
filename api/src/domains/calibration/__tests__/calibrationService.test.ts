/**
 * Tests for CalibrationService (#1381) — lifecycle + auth gates.
 *
 * Run: node --import tsx --test src/domains/calibration/__tests__/calibrationService.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CalibrationService,
  CalibrationServiceError,
} from "../calibrationService.js";
import type {
  ICalibrationRepository,
  CalibrationSessionRow,
  CalibrationSubmissionRow,
  NewCalibrationSession,
  NewCalibrationSubmission,
} from "../../../repositories/calibrationRepository.js";
import type {
  IScorecardsRepository,
  ScorecardTemplateRow,
  ScorecardSubmissionRow,
  ScorecardSubmissionRatingRow,
} from "../../../repositories/scorecardsRepository.js";

let _id = 0;
const uid = () => `id-${++_id}`;

class FakeCalibrationRepo implements ICalibrationRepository {
  sessions: CalibrationSessionRow[] = [];
  submissions: CalibrationSubmissionRow[] = [];

  async findSessionById(id: string) {
    return this.sessions.find((s) => s.id === id) ?? null;
  }
  async findSessionsForCompanies(companyIds: readonly string[]) {
    return this.sessions.filter((s) => companyIds.includes(s.companyId));
  }
  async insertSession(input: NewCalibrationSession) {
    const row = {
      id: uid(),
      companyId: input.companyId,
      organizerId: input.organizerId,
      templateId: input.templateId,
      name: input.name,
      description: input.description ?? null,
      status: "open",
      candidateApplicationIds: input.candidateApplicationIds,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as CalibrationSessionRow;
    this.sessions.push(row);
    return row;
  }
  async updateSessionStatus(id: string, status: "open" | "closed" | "archived") {
    const idx = this.sessions.findIndex((s) => s.id === id);
    const merged = {
      ...this.sessions[idx],
      status,
      closedAt: status === "closed" ? new Date() : this.sessions[idx].closedAt,
    } as CalibrationSessionRow;
    this.sessions[idx] = merged;
    return merged;
  }
  async findSubmissionsForSession(sessionId: string) {
    return this.submissions.filter((s) => s.sessionId === sessionId);
  }
  async upsertSubmission(input: NewCalibrationSubmission) {
    const existing = this.submissions.find(
      (s) =>
        s.sessionId === input.sessionId &&
        s.evaluatorUserId === input.evaluatorUserId &&
        s.applicationId === input.applicationId,
    );
    if (existing) {
      const idx = this.submissions.findIndex((s) => s.id === existing.id);
      const merged = {
        ...existing,
        ratings: input.ratings,
        notes: input.notes ?? null,
        overallRecommendation: input.overallRecommendation ?? null,
        overallScore: input.overallScore ?? null,
        submittedAt: new Date(),
      } as CalibrationSubmissionRow;
      this.submissions[idx] = merged;
      return merged;
    }
    const row = {
      id: uid(),
      sessionId: input.sessionId,
      evaluatorUserId: input.evaluatorUserId,
      applicationId: input.applicationId,
      overallRecommendation: input.overallRecommendation ?? null,
      overallScore: input.overallScore ?? null,
      ratings: input.ratings,
      notes: input.notes ?? null,
      submittedAt: new Date(),
    } as unknown as CalibrationSubmissionRow;
    this.submissions.push(row);
    return row;
  }
}

class FakeScorecardsRepo implements Partial<IScorecardsRepository> {
  templates: ScorecardTemplateRow[] = [];
  submitted: ScorecardSubmissionRow[] = [];
  ratings: ScorecardSubmissionRatingRow[] = [];
  async findTemplateById(id: string) {
    return this.templates.find((t) => t.id === id) ?? null;
  }
  async findSubmittedForApplication(applicationId: string) {
    return this.submitted.filter(
      (s) => s.applicationId === applicationId && s.status === "submitted",
    );
  }
  async findSubmittedForApplications(applicationIds: readonly string[]) {
    return this.submitted.filter(
      (s) => applicationIds.includes(s.applicationId) && s.status === "submitted",
    );
  }
  async findRatingsForSubmissions(submissionIds: readonly string[]) {
    return this.ratings.filter((r) => submissionIds.includes(r.submissionId));
  }
}

function buildService(opts?: {
  canAccess?: boolean;
  companyIds?: string[];
}) {
  const calibrationRepo = new FakeCalibrationRepo();
  const scorecardsRepo = new FakeScorecardsRepo();
  const service = new CalibrationService({
    calibrationRepo,
    scorecardsRepo: scorecardsRepo as unknown as IScorecardsRepository,
    canAccessCompany: async () => opts?.canAccess ?? true,
    getCompanyIdsForUser: async () => opts?.companyIds ?? ["company-1"],
    now: () => new Date("2026-05-25T12:00:00Z"),
  });
  scorecardsRepo.templates.push({
    id: "tpl-1",
    companyId: "company-1",
    createdByUserId: "u-org",
    name: "T",
    description: null,
    ratingScale: "1-4",
    roleFamily: null,
    requiredCertificationCourseId: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ScorecardTemplateRow);
  return { service, calibrationRepo, scorecardsRepo };
}

describe("CalibrationService.createSession", () => {
  it("creates a session with status 'open' when caller has access", async () => {
    const { service, calibrationRepo } = buildService();
    const s = await service.createSession("u-org", {
      companyId: "company-1",
      templateId: "tpl-1",
      name: "Q2 Engineering",
      candidateApplicationIds: ["app-1", "app-2"],
    });
    assert.equal(s.status, "open");
    assert.equal(s.organizerId, "u-org");
    assert.equal(calibrationRepo.sessions.length, 1);
  });

  it("rejects VALIDATION_ERROR with no candidates", async () => {
    const { service } = buildService();
    await assert.rejects(
      () =>
        service.createSession("u-org", {
          companyId: "company-1",
          templateId: "tpl-1",
          name: "Empty",
          candidateApplicationIds: [],
        }),
      (e: unknown) =>
        e instanceof CalibrationServiceError && e.code === "VALIDATION_ERROR",
    );
  });

  it("rejects FORBIDDEN when caller can't access the company", async () => {
    const { service } = buildService({ canAccess: false });
    await assert.rejects(
      () =>
        service.createSession("u-org", {
          companyId: "company-1",
          templateId: "tpl-1",
          name: "X",
          candidateApplicationIds: ["app-1"],
        }),
      (e: unknown) =>
        e instanceof CalibrationServiceError && e.code === "FORBIDDEN",
    );
  });

  it("rejects VALIDATION_ERROR when template belongs to a different company", async () => {
    const { service, scorecardsRepo } = buildService();
    scorecardsRepo.templates[0] = {
      ...scorecardsRepo.templates[0],
      companyId: "company-other",
    };
    await assert.rejects(
      () =>
        service.createSession("u-org", {
          companyId: "company-1",
          templateId: "tpl-1",
          name: "X",
          candidateApplicationIds: ["app-1"],
        }),
      (e: unknown) =>
        e instanceof CalibrationServiceError && e.code === "VALIDATION_ERROR",
    );
  });
});

describe("CalibrationService.submitCalibration", () => {
  it("accepts a submission for a candidate listed in the session", async () => {
    const { service } = buildService();
    const session = await service.createSession("u-org", {
      companyId: "company-1",
      templateId: "tpl-1",
      name: "Q2",
      candidateApplicationIds: ["app-1"],
    });
    const sub = await service.submitCalibration("u-eval", session.id, {
      applicationId: "app-1",
      ratings: { "attr-tech": 4 },
    });
    assert.equal(sub.applicationId, "app-1");
    assert.equal(sub.evaluatorUserId, "u-eval");
  });

  it("upserts (no duplicate) when same evaluator re-submits the same candidate", async () => {
    const { service, calibrationRepo } = buildService();
    const session = await service.createSession("u-org", {
      companyId: "company-1",
      templateId: "tpl-1",
      name: "Q2",
      candidateApplicationIds: ["app-1"],
    });
    await service.submitCalibration("u-eval", session.id, {
      applicationId: "app-1",
      ratings: { "attr-tech": 3 },
    });
    await service.submitCalibration("u-eval", session.id, {
      applicationId: "app-1",
      ratings: { "attr-tech": 5 },
    });
    assert.equal(calibrationRepo.submissions.length, 1);
    assert.equal(
      (calibrationRepo.submissions[0].ratings as any)["attr-tech"],
      5,
    );
  });

  it("rejects VALIDATION_ERROR when applicationId is not part of the session", async () => {
    const { service } = buildService();
    const session = await service.createSession("u-org", {
      companyId: "company-1",
      templateId: "tpl-1",
      name: "Q2",
      candidateApplicationIds: ["app-1"],
    });
    await assert.rejects(
      () =>
        service.submitCalibration("u-eval", session.id, {
          applicationId: "app-not-listed",
          ratings: {},
        }),
      (e: unknown) =>
        e instanceof CalibrationServiceError && e.code === "VALIDATION_ERROR",
    );
  });

  it("rejects CONFLICT when session is already closed", async () => {
    const { service } = buildService();
    const session = await service.createSession("u-org", {
      companyId: "company-1",
      templateId: "tpl-1",
      name: "Q2",
      candidateApplicationIds: ["app-1"],
    });
    await service.closeSession("u-org", session.id);
    await assert.rejects(
      () =>
        service.submitCalibration("u-eval", session.id, {
          applicationId: "app-1",
          ratings: {},
        }),
      (e: unknown) =>
        e instanceof CalibrationServiceError && e.code === "CONFLICT",
    );
  });
});

describe("CalibrationService.closeSession", () => {
  it("only the organizer can close the session", async () => {
    const { service } = buildService();
    const session = await service.createSession("u-org", {
      companyId: "company-1",
      templateId: "tpl-1",
      name: "Q2",
      candidateApplicationIds: ["app-1"],
    });
    await assert.rejects(
      () => service.closeSession("u-other", session.id),
      (e: unknown) =>
        e instanceof CalibrationServiceError && e.code === "FORBIDDEN",
    );
  });

  it("close flips status to 'closed' and stamps closedAt", async () => {
    const { service, calibrationRepo } = buildService();
    const session = await service.createSession("u-org", {
      companyId: "company-1",
      templateId: "tpl-1",
      name: "Q2",
      candidateApplicationIds: ["app-1"],
    });
    const closed = await service.closeSession("u-org", session.id);
    assert.equal(closed.status, "closed");
    assert.ok(calibrationRepo.sessions[0].closedAt);
  });
});

describe("CalibrationService.getSessionView", () => {
  it("returns deltas=null while open, populates after close", async () => {
    const { service, scorecardsRepo } = buildService();
    const session = await service.createSession("u-org", {
      companyId: "company-1",
      templateId: "tpl-1",
      name: "Q2",
      candidateApplicationIds: ["app-1"],
    });
    await service.submitCalibration("u-eval", session.id, {
      applicationId: "app-1",
      ratings: { "attr-tech": 4 },
    });
    const openView = await service.getSessionView("u-org", session.id);
    assert.equal(openView.deltas, null);

    // Seed a real submitted scorecard for the candidate.
    scorecardsRepo.submitted.push({
      id: "real-sub",
      templateId: "tpl-1",
      applicationId: "app-1",
      evaluatorUserId: "u-real",
      status: "submitted",
      submittedAt: new Date(),
      candidateUserId: null,
      kitStageId: null,
      interviewId: null,
      overallRecommendation: "yes",
      overallScore: 75,
      summary: null,
      strengths: null,
      concerns: null,
      dueAt: null,
      remindedAt: null,
      escalatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ScorecardSubmissionRow);
    scorecardsRepo.ratings.push({
      id: "r1",
      submissionId: "real-sub",
      attributeId: "attr-tech",
      rating: 3,
      notes: null,
      createdAt: new Date(),
    } as unknown as ScorecardSubmissionRatingRow);

    await service.closeSession("u-org", session.id);
    const closedView = await service.getSessionView("u-org", session.id);
    assert.ok(closedView.deltas);
    const delta = closedView.deltas!["app-1"][0];
    assert.equal(delta.calibrationMean, 4);
    assert.equal(delta.realMean, 3);
    assert.equal(delta.delta, 1);
  });
});
