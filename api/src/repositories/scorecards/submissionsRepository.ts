/** Scorecard submissions + per-attribute ratings persistence. */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { IScorecardSubmissionsRepository } from "./interfaces.js";
import type {
  DbLike,
  NewScorecardSubmission,
  NewScorecardSubmissionRating,
  ScorecardSubmissionRatingRow,
  ScorecardSubmissionRow,
  UpdateSubmissionPatch,
} from "./types.js";

const { scorecardSubmissions, scorecardSubmissionRatings } = schema;

export class ScorecardSubmissionsRepository implements IScorecardSubmissionsRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

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

  async findSubmittedForApplications(
    applicationIds: readonly string[],
  ): Promise<ScorecardSubmissionRow[]> {
    if (applicationIds.length === 0) return [];
    return (await this.db
      .select()
      .from(scorecardSubmissions)
      .where(
        and(
          inArray(scorecardSubmissions.applicationId, applicationIds as string[]),
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

  async updateSubmissions(ids: readonly string[], patch: UpdateSubmissionPatch): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(scorecardSubmissions)
      .set({ ...patch, updatedAt: this.now() })
      .where(inArray(scorecardSubmissions.id, [...ids]));
  }

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

  async upsertRatings(rows: readonly NewScorecardSubmissionRating[]): Promise<void> {
    if (rows.length === 0) return;
    // Last write wins for a duplicated (submission, attribute) pair in one
    // call — Postgres rejects ON CONFLICT DO UPDATE touching a row twice.
    const byKey = new Map<string, NewScorecardSubmissionRating>();
    for (const r of rows) byKey.set(`${r.submissionId}|${r.attributeId}`, r);
    await this.db
      .insert(scorecardSubmissionRatings)
      .values(
        Array.from(byKey.values()).map((r) => ({
          submissionId: r.submissionId,
          attributeId: r.attributeId,
          rating: r.rating ?? null,
          notes: r.notes ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [scorecardSubmissionRatings.submissionId, scorecardSubmissionRatings.attributeId],
        set: { rating: sql`excluded.rating`, notes: sql`excluded.notes` },
      });
  }
}
