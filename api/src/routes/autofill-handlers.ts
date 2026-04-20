/**
 * Pure autofill handlers — extracted for the write endpoints that had
 * ad-hoc inline DB logic. The AI-backed endpoints (/analyze, /generate)
 * stay in autofill.ts because they need request context to resolve the
 * AI provider; those still delegate to the pure service functions.
 *
 * Covers:
 *   • handleSaveSubmission          — writes a form submission, updates
 *                                      pipeline status when marked
 *                                      "submitted" and a savedJob is linked.
 *   • handleUpdateCacheEntry        — edit a cached answer (owner-gated).
 *   • handleDeleteCacheEntry        — delete a cached answer.
 *   • handleHistoryList             — paginated form submissions with
 *                                      batched job enrichment (no N+1).
 *   • handleHistoryDetail           — single submission + job info.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { schema } from "../db/index.js";

const { applicationFormAnswers, savedJobs, answerCache, jobItems } = schema;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type DbPort = any;
export interface AutofillDeps {
  db: DbPort;
  now: () => Date;
}

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

export interface HandlerResult<T = unknown> {
  status: number;
  body: T;
}

function ok<T>(data: T, status = 200): HandlerResult<{ success: true; data: T; timestamp: string }> {
  return { status, body: { success: true as const, data, timestamp: new Date().toISOString() } };
}

function fail(status: number, code: string, message: string, details?: unknown) {
  return {
    status,
    body: {
      success: false as const,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const SaveSubmissionSchema = z.object({
  fields: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
  answers: z.record(z.string(), z.unknown()),
  sourceUrl: z.string().url().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  savedJobId: z.string().uuid().optional().nullable(),
  resumeId: z.string().uuid().optional().nullable(),
  atsProvider: z.string().max(50).optional().nullable(),
  jobDescription: z.string().max(50000).optional().nullable(),
  status: z.enum(["draft", "submitted", "reviewed"]).optional(),
});

export const UpdateCacheEntrySchema = z.object({
  answer: z.string().max(5000),
});

// ═══════════════════════════════════════════════════════════════════════════
// handleSaveSubmission
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSaveSubmission(
  deps: AutofillDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const parsed = SaveSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const now = deps.now();
  const d = parsed.data;

  const [inserted] = await deps.db
    .insert(applicationFormAnswers)
    .values({
      userId: viewerId,
      jobId: d.jobId ?? null,
      savedJobId: d.savedJobId ?? null,
      resumeId: d.resumeId ?? null,
      sourceUrl: d.sourceUrl ?? null,
      atsProvider: d.atsProvider ?? null,
      formFields: d.fields,
      answers: d.answers,
      jobDescription: d.jobDescription ?? null,
      status: d.status ?? "draft",
      submittedAt: d.status === "submitted" ? now : null,
    } as any)
    .returning({ id: applicationFormAnswers.id });

  // When submission is finalised and linked to a saved job, advance the
  // pipeline state. Failure here is non-critical — we still return the
  // submission id.
  if (d.status === "submitted" && d.savedJobId) {
    try {
      await deps.db
        .update(savedJobs)
        .set({
          status: "applied",
          appliedAt: now,
          statusChangedAt: now,
          updatedAt: now,
        } as any)
        .where(and(eq(savedJobs.id, d.savedJobId), eq(savedJobs.userId, viewerId)));
    } catch {
      // Non-critical — the submission is saved; pipeline promotion is
      // a nice-to-have that callers can retry manually.
    }
  }

  return ok({ id: inserted?.id }, 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleUpdateCacheEntry / handleDeleteCacheEntry
// ═══════════════════════════════════════════════════════════════════════════

export async function handleUpdateCacheEntry(
  deps: AutofillDeps,
  viewerId: string | null,
  cacheId: string,
  body: unknown,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  const parsed = UpdateCacheEntrySchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const [updated] = await deps.db
    .update(answerCache)
    .set({ answer: parsed.data.answer, updatedAt: deps.now() } as any)
    .where(and(eq(answerCache.id, cacheId), eq(answerCache.userId, viewerId)))
    .returning();

  if (!updated) return fail(404, "NOT_FOUND", "Cache entry not found");
  return ok(updated);
}

export async function handleDeleteCacheEntry(
  deps: AutofillDeps,
  viewerId: string | null,
  cacheId: string,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");
  await deps.db
    .delete(answerCache)
    .where(and(eq(answerCache.id, cacheId), eq(answerCache.userId, viewerId)));
  return ok(null);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleHistoryList / handleHistoryDetail
// ═══════════════════════════════════════════════════════════════════════════

export async function handleHistoryList(
  deps: AutofillDeps,
  viewerId: string | null,
  opts: { page?: number; limit?: number; jobId?: string },
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");

  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const conditions = [eq(applicationFormAnswers.userId, viewerId)];
  if (opts.jobId) conditions.push(eq(applicationFormAnswers.jobId, opts.jobId));

  const rows = await deps.db
    .select({
      id: applicationFormAnswers.id,
      sourceUrl: applicationFormAnswers.sourceUrl,
      atsProvider: applicationFormAnswers.atsProvider,
      status: applicationFormAnswers.status,
      jobId: applicationFormAnswers.jobId,
      createdAt: applicationFormAnswers.createdAt,
      submittedAt: applicationFormAnswers.submittedAt,
    })
    .from(applicationFormAnswers)
    .where(and(...conditions))
    .orderBy(desc(applicationFormAnswers.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  // Batch-load job titles to avoid N+1
  const jobIds = [...new Set((rows as any[]).map((r) => r.jobId).filter(Boolean))] as string[];
  const jobMap = new Map<string, { title: string; company?: string | null }>();
  if (jobIds.length > 0) {
    const jobs = await deps.db
      .select({ id: jobItems.id, title: jobItems.title, company: jobItems.company })
      .from(jobItems)
      .where(inArray(jobItems.id, jobIds));
    for (const j of jobs as any[]) jobMap.set(j.id, { title: j.title, company: j.company });
  }

  const enriched = (rows as any[]).map((r) => {
    const job = r.jobId ? jobMap.get(r.jobId) : undefined;
    return { ...r, jobTitle: job?.title, company: job?.company ?? undefined };
  });

  return ok(enriched);
}

export async function handleHistoryDetail(
  deps: AutofillDeps,
  viewerId: string | null,
  submissionId: string,
): Promise<HandlerResult> {
  if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");

  const [row] = await deps.db
    .select()
    .from(applicationFormAnswers)
    .where(and(
      eq(applicationFormAnswers.id, submissionId),
      eq(applicationFormAnswers.userId, viewerId),
    ))
    .limit(1);

  if (!row) return fail(404, "NOT_FOUND", "Submission not found");

  let jobTitle: string | undefined;
  let company: string | undefined;
  if (row.jobId) {
    const [job] = await deps.db
      .select({ title: jobItems.title, company: jobItems.company })
      .from(jobItems)
      .where(eq(jobItems.id, row.jobId))
      .limit(1);
    jobTitle = job?.title;
    company = job?.company ?? undefined;
  }

  return ok({ ...row, jobTitle, company });
}
