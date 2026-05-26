/**
 * CalibrationService (#1381) — application layer for calibration
 * sessions. Composes the calibration repository with the existing
 * scorecards repository (to read the template + the original hiring
 * submissions whose deltas the session compares against).
 *
 * Key flows:
 *   • createSession — organizer picks a template + a set of past
 *     applicationIds, session opens in `status='open'`.
 *   • submitCalibration — evaluator scores one candidate inside the
 *     session; replace-on-resubmit semantics.
 *   • closeSession — flips to `closed`, computes per-attribute deltas
 *     from real submissions vs. calibration submissions for each
 *     candidate.
 *   • getSessionView — returns the session + computed deltas (only
 *     populated once the session has been closed by the organizer).
 *
 * Computes use pure helpers in `./scoring.ts` so the logic is
 * testable in isolation from the DB.
 */

import {
  CalibrationRepository,
  type ICalibrationRepository,
  type CalibrationSessionRow,
  type CalibrationSubmissionRow,
} from "../../repositories/calibrationRepository.js";
import {
  ScorecardsRepository,
  type IScorecardsRepository,
} from "../../repositories/scorecardsRepository.js";
import { getDb } from "../../db/index.js";
import {
  resolveCompanyScope,
  userCanAccessCompany,
} from "../../services/company/scope.js";
import {
  computeCalibrationDeltas,
  type AttributeDelta,
} from "./scoring.js";

export type ServiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_ERROR";

export class CalibrationServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface CalibrationServiceDeps {
  calibrationRepo: ICalibrationRepository;
  scorecardsRepo: IScorecardsRepository;
  canAccessCompany: (userId: string, companyId: string) => Promise<boolean>;
  getCompanyIdsForUser: (userId: string) => Promise<string[]>;
  now?: () => Date;
}

export function defaultCalibrationServiceDeps(): CalibrationServiceDeps {
  const db = getDb();
  return {
    calibrationRepo: new CalibrationRepository(db),
    scorecardsRepo: new ScorecardsRepository(db),
    canAccessCompany: userCanAccessCompany,
    getCompanyIdsForUser: async (userId: string) =>
      (await resolveCompanyScope(userId)).companyIds,
    now: () => new Date(),
  };
}

export interface SessionView {
  session: CalibrationSessionRow;
  submissions: CalibrationSubmissionRow[];
  /** Per-candidate per-attribute deltas, populated when session is closed. */
  deltas: Record<string, AttributeDelta[]> | null;
}

export class CalibrationService {
  private readonly now: () => Date;

  constructor(private readonly deps: CalibrationServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async assertCompanyAccess(userId: string, companyId: string) {
    if (!(await this.deps.canAccessCompany(userId, companyId))) {
      throw new CalibrationServiceError("FORBIDDEN", "No access to this company");
    }
  }

  async listSessions(userId: string): Promise<CalibrationSessionRow[]> {
    const companyIds = await this.deps.getCompanyIdsForUser(userId);
    if (companyIds.length === 0) return [];
    return this.deps.calibrationRepo.findSessionsForCompanies(companyIds);
  }

  async getSessionView(userId: string, id: string): Promise<SessionView> {
    const session = await this.deps.calibrationRepo.findSessionById(id);
    if (!session) throw new CalibrationServiceError("NOT_FOUND", "Session not found");
    await this.assertCompanyAccess(userId, session.companyId);
    const submissions =
      await this.deps.calibrationRepo.findSubmissionsForSession(session.id);

    let deltas: Record<string, AttributeDelta[]> | null = null;
    if (session.status === "closed" || session.status === "archived") {
      const realByApplication: Record<
        string,
        { attributeId: string; rating: number | null }[]
      > = {};
      const candidates = (session.candidateApplicationIds ?? []) as string[];
      for (const appId of candidates) {
        const realSubs =
          await this.deps.scorecardsRepo.findSubmittedForApplication(appId);
        const realSubIds = realSubs.map((s) => s.id);
        const realRatings =
          await this.deps.scorecardsRepo.findRatingsForSubmissions(realSubIds);
        realByApplication[appId] = realRatings.map((r) => ({
          attributeId: r.attributeId,
          rating: r.rating,
        }));
      }
      deltas = computeCalibrationDeltas({
        candidates,
        calibrationSubmissions: submissions,
        realRatingsByApplication: realByApplication,
      });
    }

    return { session, submissions, deltas };
  }

  async createSession(
    userId: string,
    input: {
      companyId: string;
      templateId: string;
      name: string;
      description?: string;
      candidateApplicationIds: string[];
    },
  ): Promise<CalibrationSessionRow> {
    await this.assertCompanyAccess(userId, input.companyId);
    if (input.candidateApplicationIds.length === 0) {
      throw new CalibrationServiceError(
        "VALIDATION_ERROR",
        "Pick at least one candidate to calibrate against",
      );
    }
    const tpl = await this.deps.scorecardsRepo.findTemplateById(input.templateId);
    if (!tpl) {
      throw new CalibrationServiceError("NOT_FOUND", "Template not found");
    }
    if (tpl.companyId !== input.companyId) {
      throw new CalibrationServiceError(
        "VALIDATION_ERROR",
        "Template doesn't belong to this company",
      );
    }
    return this.deps.calibrationRepo.insertSession({
      companyId: input.companyId,
      organizerId: userId,
      templateId: input.templateId,
      name: input.name,
      description: input.description ?? null,
      candidateApplicationIds: input.candidateApplicationIds,
    });
  }

  async submitCalibration(
    userId: string,
    sessionId: string,
    input: {
      applicationId: string;
      ratings: Record<string, number | null>;
      overallRecommendation?: string;
      overallScore?: number | null;
      notes?: string;
    },
  ): Promise<CalibrationSubmissionRow> {
    const session = await this.deps.calibrationRepo.findSessionById(sessionId);
    if (!session) throw new CalibrationServiceError("NOT_FOUND", "Session not found");
    if (session.status !== "open") {
      throw new CalibrationServiceError(
        "CONFLICT",
        "Session no longer accepts submissions",
      );
    }
    await this.assertCompanyAccess(userId, session.companyId);
    const candidates = (session.candidateApplicationIds ?? []) as string[];
    if (!candidates.includes(input.applicationId)) {
      throw new CalibrationServiceError(
        "VALIDATION_ERROR",
        "applicationId is not in this session",
      );
    }
    return this.deps.calibrationRepo.upsertSubmission({
      sessionId: session.id,
      evaluatorUserId: userId,
      applicationId: input.applicationId,
      ratings: input.ratings,
      overallRecommendation: input.overallRecommendation,
      overallScore: input.overallScore ?? null,
      notes: input.notes,
    });
  }

  async closeSession(
    userId: string,
    id: string,
  ): Promise<CalibrationSessionRow> {
    const session = await this.deps.calibrationRepo.findSessionById(id);
    if (!session) throw new CalibrationServiceError("NOT_FOUND", "Session not found");
    if (session.organizerId !== userId) {
      throw new CalibrationServiceError(
        "FORBIDDEN",
        "Only the organizer can close this session",
      );
    }
    if (session.status === "archived") {
      throw new CalibrationServiceError("CONFLICT", "Session is archived");
    }
    return this.deps.calibrationRepo.updateSessionStatus(id, "closed");
  }
}
