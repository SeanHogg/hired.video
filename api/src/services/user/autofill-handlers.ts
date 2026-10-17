/**
 * Pure autofill handlers — extracted for the write endpoints that had
 * ad-hoc inline DB logic. The AI-backed endpoints (/analyze, /generate)
 * stay in autofill.ts because they need request context to resolve the
 * AI provider; those still delegate to the pure service functions.
 *
 * Covers:
 *   • saveSubmission                — writes a form submission, updates
 *                                      pipeline status when marked
 *                                      "submitted" and a savedJob is linked.
 *   • updateCacheEntry              — edit a cached answer (owner-gated).
 *   • deleteCacheEntry              — delete a cached answer.
 *   • listHistory                   — paginated form submissions with
 *                                      batched job enrichment (no N+1).
 *   • getHistoryDetail              — single submission + job info.
 *
 * Each use case returns plain data / throws DomainError; the `handle*`
 * exports at the bottom are their asHandler envelope adapters.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { recordApply } from "../../repositories/jobApplicationTrackerRepository.js";

const { applicationFormAnswers, savedJobs, answerCache, jobItems } = schema;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type DbPort = any;
export interface AutofillDeps {
  db: DbPort;
  now: () => Date;
}

// Use cases return plain data and throw DomainError; the exported
// `handle*` wrappers (asHandler) map that onto the HTTP envelope.
import { asHandler } from "../../handlers/shared.js";
import { DomainError, requireUserId } from "../../domains/errors.js";

// ---------------------------------------------------------------------------
// Schemas — canonical source is shared/autofill.ts.
// ---------------------------------------------------------------------------

import { SaveSubmissionSchema, UpdateCacheEntrySchema } from "../../../../shared/autofill.js";
export { SaveSubmissionSchema, UpdateCacheEntrySchema };

// ═══════════════════════════════════════════════════════════════════════════
// handleSaveSubmission
// ═══════════════════════════════════════════════════════════════════════════

export async function saveSubmission(
  deps: AutofillDeps,
  viewerId: string | null,
  body: unknown,
) {
  const auth = { userId: requireUserId(viewerId) };
  const parsed = SaveSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const now = deps.now();
  const d = parsed.data;

  const [inserted] = await deps.db
    .insert(applicationFormAnswers)
    .values({
      userId: auth.userId,
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

  // When submission is finalised and linked to a saved job, record the
  // application (job_applications owns the tracker lifecycle, W3-D2).
  // Failure here is non-critical — we still return the submission id.
  if (d.status === "submitted" && d.savedJobId) {
    try {
      const [saved] = await deps.db
        .select({ jobId: savedJobs.jobId })
        .from(savedJobs)
        .where(and(eq(savedJobs.id, d.savedJobId), eq(savedJobs.userId, auth.userId)))
        .limit(1);
      if (saved?.jobId) {
        await recordApply(deps.db, { userId: auth.userId, jobId: saved.jobId, resumeId: d.resumeId ?? null, coverLetter: null }, now);
      }
    } catch {
      // Non-critical — the submission is saved; pipeline promotion is
      // a nice-to-have that callers can retry manually.
    }
  }

  return { id: inserted?.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// handleUpdateCacheEntry / handleDeleteCacheEntry
// ═══════════════════════════════════════════════════════════════════════════

export async function updateCacheEntry(
  deps: AutofillDeps,
  viewerId: string | null,
  cacheId: string,
  body: unknown,
) {
  const auth = { userId: requireUserId(viewerId) };
  const parsed = UpdateCacheEntrySchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const [updated] = await deps.db
    .update(answerCache)
    .set({ answer: parsed.data.answer, updatedAt: deps.now() } as any)
    .where(and(eq(answerCache.id, cacheId), eq(answerCache.userId, auth.userId)))
    .returning({ id: answerCache.id });

  if (!updated) throw new DomainError(404, "NOT_FOUND", "Cached answer not found");
  return { id: updated.id };
}

export async function deleteCacheEntry(
  deps: AutofillDeps,
  viewerId: string | null,
  cacheId: string,
) {
  const auth = { userId: requireUserId(viewerId) };
  const [deleted] = await deps.db
    .delete(answerCache)
    .where(and(eq(answerCache.id, cacheId), eq(answerCache.userId, auth.userId)))
    .returning({ id: answerCache.id });
  if (!deleted) throw new DomainError(404, "NOT_FOUND", "Cached answer not found");
  return { id: deleted.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// handleHistoryList / handleHistoryDetail
// ═══════════════════════════════════════════════════════════════════════════

export async function listHistory(
  deps: AutofillDeps,
  viewerId: string | null,
  opts: { page?: number; limit?: number; jobId?: string },
) {
  const auth = { userId: requireUserId(viewerId) };

  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const conditions = [eq(applicationFormAnswers.userId, auth.userId)];
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

  // Batch-load job titles to avoid N+1. Enrichment is best-effort: a failed
  // lookup returns the list without job info rather than failing it.
  const jobIds = [...new Set((rows as any[]).map((r) => r.jobId).filter(Boolean))] as string[];
  const jobMap = new Map<string, { title: string; company?: string | null }>();
  if (jobIds.length > 0) {
    try {
      const jobs = await deps.db
        .select({ id: jobItems.id, title: jobItems.title, company: jobItems.company })
        .from(jobItems)
        .where(inArray(jobItems.id, jobIds));
      for (const j of jobs as any[]) jobMap.set(j.id, { title: j.title, company: j.company });
    } catch {
      // Best-effort enrichment.
    }
  }

  const enriched = (rows as any[]).map((r) => {
    const job = r.jobId ? jobMap.get(r.jobId) : undefined;
    return { ...r, jobTitle: job?.title, company: job?.company ?? undefined };
  });

  return enriched;
}

export async function getHistoryDetail(
  deps: AutofillDeps,
  viewerId: string | null,
  submissionId: string,
) {
  const auth = { userId: requireUserId(viewerId) };

  const [row] = await deps.db
    .select()
    .from(applicationFormAnswers)
    .where(and(
      eq(applicationFormAnswers.id, submissionId),
      eq(applicationFormAnswers.userId, auth.userId),
    ))
    .limit(1);

  if (!row) throw new DomainError(404, "NOT_FOUND", "Submission not found");

  let jobTitle: string | undefined;
  let company: string | undefined;
  if (row.jobId) {
    try {
      const [job] = await deps.db
        .select({ title: jobItems.title, company: jobItems.company })
        .from(jobItems)
        .where(eq(jobItems.id, row.jobId))
        .limit(1);
      jobTitle = job?.title;
      company = job?.company ?? undefined;
    } catch {
      // Best-effort enrichment — return the submission without job info.
    }
  }

  return { ...row, jobTitle, company };
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP-envelope adapters (route + tests)
// ═══════════════════════════════════════════════════════════════════════════

export const handleSaveSubmission = asHandler(saveSubmission, 201);
export const handleUpdateCacheEntry = asHandler(updateCacheEntry);
export const handleDeleteCacheEntry = asHandler(deleteCacheEntry);
export const handleHistoryList = asHandler(listHistory);
export const handleHistoryDetail = asHandler(getHistoryDetail);
