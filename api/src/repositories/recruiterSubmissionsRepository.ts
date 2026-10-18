/**
 * RecruiterSubmissionsRepository — recruiter → job candidate submissions
 * (`candidate_submissions`). Owner-scoped on `recruiter_id` unless
 * documented otherwise. The pipeline kanban's bounded read lives in
 * recruiterPipelineRepository.ts.
 */
import { and, count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { candidateSubmissions } = schema;

export type SubmissionRow = typeof candidateSubmissions.$inferSelect;
export type SubmissionInsert = typeof candidateSubmissions.$inferInsert;

/** Unscoped read by id (placement create resolves names from it, as before). */
export async function findSubmissionById(id: string): Promise<SubmissionRow | null> {
  const [row] = await getDb()
    .select()
    .from(candidateSubmissions)
    .where(eq(candidateSubmissions.id, id))
    .limit(1);
  return row ?? null;
}

export async function listSubmissionsForJob(recruiterId: string, jobId: string): Promise<SubmissionRow[]> {
  return getDb()
    .select()
    .from(candidateSubmissions)
    .where(and(eq(candidateSubmissions.recruiterId, recruiterId), eq(candidateSubmissions.jobId, jobId)))
    .orderBy(desc(candidateSubmissions.submittedAt));
}

export async function listSubmissionsForRecruiter(recruiterId: string): Promise<SubmissionRow[]> {
  return getDb()
    .select()
    .from(candidateSubmissions)
    .where(eq(candidateSubmissions.recruiterId, recruiterId))
    .orderBy(desc(candidateSubmissions.submittedAt));
}

/** The recruiter's submissions grouped by status (dashboard tiles). */
export async function countSubmissionsByStatusForRecruiter(
  recruiterId: string,
): Promise<Array<{ status: string; total: number }>> {
  const rows = await getDb()
    .select({ status: candidateSubmissions.status, total: count() })
    .from(candidateSubmissions)
    .where(eq(candidateSubmissions.recruiterId, recruiterId))
    .groupBy(candidateSubmissions.status);
  return rows.map((r) => ({ status: r.status, total: Number(r.total) }));
}

export async function insertSubmission(values: Record<string, unknown>): Promise<SubmissionRow> {
  const [row] = await getDb().insert(candidateSubmissions).values(values as SubmissionInsert).returning();
  return row;
}

export async function findOwnedSubmission(recruiterId: string, id: string): Promise<SubmissionRow | null> {
  const [row] = await getDb()
    .select()
    .from(candidateSubmissions)
    .where(and(eq(candidateSubmissions.id, id), eq(candidateSubmissions.recruiterId, recruiterId)))
    .limit(1);
  return row ?? null;
}

export async function updateOwnedSubmission(
  recruiterId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<SubmissionRow | null> {
  const [updated] = await getDb()
    .update(candidateSubmissions)
    .set(patch as Partial<SubmissionInsert>)
    .where(and(eq(candidateSubmissions.id, id), eq(candidateSubmissions.recruiterId, recruiterId)))
    .returning();
  return updated ?? null;
}
