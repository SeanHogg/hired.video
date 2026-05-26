/**
 * CalibrationRepository — persistence for the calibration-session
 * bounded context (#1381). Lives separately from ScorecardsRepository
 * because the rows are deliberately isolated from real hiring data.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../db/index.js";

const { calibrationSessions, calibrationSubmissions } = schema;

export type DbLike = any;

export type CalibrationSessionRow = typeof calibrationSessions.$inferSelect;
export type CalibrationSubmissionRow = typeof calibrationSubmissions.$inferSelect;

export interface NewCalibrationSession {
  companyId: string;
  organizerId: string;
  templateId: string;
  name: string;
  description?: string | null;
  candidateApplicationIds: string[];
}

export interface NewCalibrationSubmission {
  sessionId: string;
  evaluatorUserId: string;
  applicationId: string;
  overallRecommendation?: string | null;
  overallScore?: number | null;
  ratings: Record<string, number | null>;
  notes?: string | null;
}

export interface ICalibrationRepository {
  findSessionById(id: string): Promise<CalibrationSessionRow | null>;
  findSessionsForCompanies(
    companyIds: readonly string[],
  ): Promise<CalibrationSessionRow[]>;
  insertSession(input: NewCalibrationSession): Promise<CalibrationSessionRow>;
  updateSessionStatus(
    id: string,
    status: "open" | "closed" | "archived",
  ): Promise<CalibrationSessionRow>;

  findSubmissionsForSession(sessionId: string): Promise<CalibrationSubmissionRow[]>;
  upsertSubmission(input: NewCalibrationSubmission): Promise<CalibrationSubmissionRow>;
}

export class CalibrationRepository implements ICalibrationRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findSessionById(id: string): Promise<CalibrationSessionRow | null> {
    const [row] = await this.db
      .select()
      .from(calibrationSessions)
      .where(eq(calibrationSessions.id, id))
      .limit(1);
    return (row as CalibrationSessionRow) ?? null;
  }

  async findSessionsForCompanies(
    companyIds: readonly string[],
  ): Promise<CalibrationSessionRow[]> {
    if (companyIds.length === 0) return [];
    return (await this.db
      .select()
      .from(calibrationSessions)
      .where(inArray(calibrationSessions.companyId, companyIds as string[]))
      .orderBy(desc(calibrationSessions.createdAt))) as CalibrationSessionRow[];
  }

  async insertSession(input: NewCalibrationSession): Promise<CalibrationSessionRow> {
    const [row] = await this.db
      .insert(calibrationSessions)
      .values({
        ...input,
        candidateApplicationIds: input.candidateApplicationIds as any,
      } as any)
      .returning();
    return row as CalibrationSessionRow;
  }

  async updateSessionStatus(
    id: string,
    status: "open" | "closed" | "archived",
  ): Promise<CalibrationSessionRow> {
    const patch: any = { status, updatedAt: this.now() };
    if (status === "closed") patch.closedAt = this.now();
    const [row] = await this.db
      .update(calibrationSessions)
      .set(patch)
      .where(eq(calibrationSessions.id, id))
      .returning();
    return row as CalibrationSessionRow;
  }

  async findSubmissionsForSession(
    sessionId: string,
  ): Promise<CalibrationSubmissionRow[]> {
    return (await this.db
      .select()
      .from(calibrationSubmissions)
      .where(eq(calibrationSubmissions.sessionId, sessionId))
      .orderBy(asc(calibrationSubmissions.submittedAt))) as CalibrationSubmissionRow[];
  }

  async upsertSubmission(
    input: NewCalibrationSubmission,
  ): Promise<CalibrationSubmissionRow> {
    const existing = (await this.db
      .select()
      .from(calibrationSubmissions)
      .where(
        and(
          eq(calibrationSubmissions.sessionId, input.sessionId),
          eq(calibrationSubmissions.evaluatorUserId, input.evaluatorUserId),
          eq(calibrationSubmissions.applicationId, input.applicationId),
        ),
      )
      .limit(1)) as CalibrationSubmissionRow[];
    if (existing[0]) {
      const [row] = await this.db
        .update(calibrationSubmissions)
        .set({
          overallRecommendation: input.overallRecommendation ?? null,
          overallScore: input.overallScore ?? null,
          ratings: input.ratings as any,
          notes: input.notes ?? null,
          submittedAt: this.now(),
        } as any)
        .where(eq(calibrationSubmissions.id, existing[0].id))
        .returning();
      return row as CalibrationSubmissionRow;
    }
    const [row] = await this.db
      .insert(calibrationSubmissions)
      .values({
        sessionId: input.sessionId,
        evaluatorUserId: input.evaluatorUserId,
        applicationId: input.applicationId,
        overallRecommendation: input.overallRecommendation ?? null,
        overallScore: input.overallScore ?? null,
        ratings: input.ratings as any,
        notes: input.notes ?? null,
      } as any)
      .returning();
    return row as CalibrationSubmissionRow;
  }
}
