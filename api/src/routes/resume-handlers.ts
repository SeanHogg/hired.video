/**
 * Pure resume handlers — extracted from routes/resumes.ts so the Hono
 * layer is a thin adapter and every business rule can be exercised with
 * mocked dependencies.
 *
 * Pattern (same as auth-handlers.ts):
 *   • ResumeDeps            — infrastructure abstractions (db, clock,
 *                             randomness, AI parser, diff recompute,
 *                             sentiment tool). Long-lived; one instance
 *                             per request is fine.
 *   • ResumeRequestContext  — per-request metadata the route strips out
 *                             of the Hono context (viewerId, ipHash,
 *                             referrer, userAgent). Never passed as
 *                             Hono-typed objects so tests don't need to
 *                             build a fake context.
 *   • handle*(deps, ctx, …) — pure functions returning { status, body }.
 *
 * The original routes called getDb() and ad-hoc DB patterns inside each
 * handler. Moving to DI lets tests mock the database and assert on
 * observable outcomes (rows inserted, views recorded, scores persisted)
 * instead of only the shape of the response.
 */

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import {
  CreateResumeSchema,
  UpdateResumeSchema,
  type Resume,
  type ResumeSummary,
  type ResumePrivacy,
} from "../../../shared/resume.js";

const { resumeInformation: resumes, watchedResumes, resumeViews } = schema;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type DbPort = any;

/** AI-backed resume parser. Pure wrapper so tests can return deterministic
 *  content without firing LLM calls. */
export interface ResumeParserPort {
  parseRawText(text: string): Promise<Record<string, unknown>>;
  tryParseJsonResume(text: string): Record<string, unknown> | null;
  normalizeJsonResume(content: unknown): Record<string, unknown>;
}

/** Diff recomputation port — the live implementation walks the parent/
 *  child relationship; tests inject a stub that records which resume ids
 *  were recomputed. */
export interface DiffRecomputePort {
  refresh(db: DbPort, userId: string, resumeId: string): Promise<void>;
}

export interface ResumeDeps {
  db: DbPort;
  parser: ResumeParserPort;
  diff: DiffRecomputePort;
  now: () => Date;
}

/** Per-request context the route strips out of Hono's c. */
export interface ResumeRequestContext {
  viewerId: string | null;
  ipHash: string | null;
  referrer: string | null;
  userAgent: string | null;
}

// ---------------------------------------------------------------------------
// Handler result envelope (same as auth-handlers.ts)
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
// Serializer duplicates avoided — resumes.ts already exports
// `rowToResume`, `rowToResumeSummary`, and `EMPTY_VIEWER_EXTRAS`. These
// handlers import them from the main module to keep one source of truth.
// ---------------------------------------------------------------------------

import {
  rowToResume,
  rowToResumeSummary,
  EMPTY_VIEWER_EXTRAS,
  preserveMetaData,
  type ResumeViewerExtras,
} from "./resumes.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVACY_TO_LEVEL: Record<string, number> = {
  public: 0, recruiter_only: 1, connections: 2, private: 10, draft: 10,
};

// ---------------------------------------------------------------------------
// computeViewerExtras / recordResumeView / persistSentimentScore are
// re-implemented here against the DbPort instead of importing from
// resumes.ts, so tests can pass a fake without pulling the live module's
// concrete db getter into the test graph.
// ---------------------------------------------------------------------------

async function computeViewerExtras(
  db: DbPort,
  row: { id: string; userId: string },
  viewerId: string | null,
): Promise<ResumeViewerExtras> {
  const isOwner = Boolean(viewerId && viewerId === row.userId);

  let isWatched = false;
  if (viewerId) {
    const [watch] = await db
      .select({ id: watchedResumes.id })
      .from(watchedResumes)
      .where(and(eq(watchedResumes.viewerId, viewerId), eq(watchedResumes.resumeId, row.id)))
      .limit(1);
    isWatched = Boolean(watch);
  }

  const [viewRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(resumeViews)
    .where(eq(resumeViews.resumeId, row.id));
  const viewCount = Number(viewRow?.c ?? 0);

  return { isOwner, isWatched, viewCount };
}

async function recordResumeView(
  db: DbPort,
  resumeId: string,
  ownerId: string,
  viewer: ResumeRequestContext,
): Promise<void> {
  if (viewer.viewerId && viewer.viewerId === ownerId) return;
  await db.insert(resumeViews).values({
    resumeId,
    viewerId: viewer.viewerId,
    ipHash: viewer.ipHash ?? null,
    referrer: viewer.referrer ?? null,
    userAgent: viewer.userAgent ?? null,
  } as any);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleGetResume — GET /api/resumes/:id
//   • 404 when the resume doesn't exist
//   • 404 RESUME_PRIVATE when not owner and privacy !== public
//   • Records a view for non-owner callers
//   • Returns the clean Resume DTO with real isWatched / viewCount
// ═══════════════════════════════════════════════════════════════════════════

export async function handleGetResume(
  deps: ResumeDeps,
  ctx: ResumeRequestContext,
  id: string,
): Promise<HandlerResult> {
  const condition = UUID_RE.test(id) ? eq(resumes.id, id) : eq(resumes.slug, id);
  const [row] = await deps.db.select().from(resumes).where(condition).limit(1);
  if (!row) return fail(404, "NOT_FOUND", "Resume not found");

  const isOwner = !!ctx.viewerId && row.userId === ctx.viewerId;
  const isPublic = row.privacyLevel === 0;
  if (!isOwner && !isPublic) {
    return fail(404, "RESUME_PRIVATE", "This resume is private. Ask the owner to share it with you.");
  }

  await recordResumeView(deps.db, row.id, row.userId, ctx);
  const extras = await computeViewerExtras(deps.db, row, ctx.viewerId);
  return ok(rowToResume(row, extras));
}

// ═══════════════════════════════════════════════════════════════════════════
// handleUpdateResume — PUT /api/resumes/:id
//   • Slug in body (closes 2026-04-19 query-string bug)
//   • Slug validated by UpdateResumeSchema (rejects UUID-shaped strings)
//   • 409 SLUG_TAKEN when slug collides with another owned resume
//   • content.metaData preserved when caller omits it
//   • parentId:null clears stored diff
// ═══════════════════════════════════════════════════════════════════════════

export async function handleUpdateResume(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  body: unknown,
): Promise<HandlerResult> {
  const parsed = UpdateResumeSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  // Slug handling — only touch the column when the caller sent slug.
  let slugUpdate: { slug: string | null } | undefined;
  if (parsed.data.slug !== undefined) {
    const slug = parsed.data.slug;
    if (slug !== null) {
      const [taken] = await deps.db
        .select({ id: resumes.id })
        .from(resumes)
        .where(and(eq(resumes.userId, ownerId), eq(resumes.slug, slug), ne(resumes.id, id)))
        .limit(1);
      if (taken) return fail(409, "SLUG_TAKEN", "Slug is already in use");
    }
    slugUpdate = { slug };
  }

  // Fetch the current row so we can preserve metaData across content updates.
  const [existing] = await deps.db
    .select({ content: resumes.content })
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .limit(1);
  const existingMetaData = (existing?.content as Record<string, unknown> | null)?.metaData;

  const { privacy, slug: _slugBody, ...dbFields } = parsed.data;
  void _slugBody;
  const setData: Record<string, unknown> = {
    ...dbFields,
    ...(slugUpdate ?? {}),
    updatedAt: deps.now(),
  };
  if (setData.content !== undefined) {
    setData.content = preserveMetaData(setData.content, existingMetaData);
  }
  if (privacy !== undefined) {
    setData.privacyLevel = PRIVACY_TO_LEVEL[privacy] ?? 10;
  }
  if (dbFields.parentId === null) {
    setData.diffPercent = null;
  }

  const [updated] = await deps.db
    .update(resumes)
    .set(setData as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .returning();
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");

  if (setData.content !== undefined) {
    await deps.diff.refresh(deps.db, ownerId, updated.id);
  }
  return ok(rowToResume(updated, { isOwner: true, isWatched: false, viewCount: 0 }));
}

// ═══════════════════════════════════════════════════════════════════════════
// handleCreateResume — POST /api/resumes
//   • First upload on the account auto-promotes to master+active
//   • rawText triggers JSON-Resume parse then AI parse fallback
//   • PascalCase content is normalised to canonical camelCase before write
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCreateResume(
  deps: ResumeDeps,
  ownerId: string,
  body: unknown,
): Promise<HandlerResult> {
  const parsed = CreateResumeSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  let content: Record<string, unknown> = parsed.data.content
    ? deps.parser.normalizeJsonResume(parsed.data.content)
    : {};
  if (parsed.data.rawText) {
    const structured = deps.parser.tryParseJsonResume(parsed.data.rawText);
    content = structured ?? (await deps.parser.parseRawText(parsed.data.rawText));
  }

  const privacyLevel = PRIVACY_TO_LEVEL[parsed.data.privacy ?? "private"] ?? 10;

  // First-resume auto-promotion — new users shouldn't have to click "Set
  // Master" / "Set Active" before their first upload is usable.
  const [countRow] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(resumes)
    .where(eq(resumes.userId, ownerId));
  const isFirst = (countRow?.n ?? 0) === 0;
  const isMaster = (parsed.data.isMaster ?? false) || isFirst;

  const [created] = await deps.db
    .insert(resumes)
    .values({
      userId: ownerId,
      title: parsed.data.title,
      content,
      status: parsed.data.status,
      isMaster,
      isActive: isFirst,
      privacyLevel,
    } as any)
    .returning();

  return ok(
    rowToResume(created, { isOwner: true, isWatched: false, viewCount: 0 }),
    201,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// handleDeleteResume — DELETE /api/resumes/:id
//   • 404 when the resume doesn't exist for this user
//   • Master deletion unparents its variants (so they become standalone
//     rather than being orphaned as dangling foreign keys)
//   • WHERE clause always includes userId (defense-in-depth against
//     future refactors dropping the pre-check)
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDeleteResume(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const [existing] = await deps.db
    .select({ id: resumes.id, isMaster: resumes.isMaster })
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!existing) return fail(404, "NOT_FOUND", "Resume not found");

  if (existing.isMaster) {
    await deps.db
      .update(resumes)
      .set({ parentId: null, updatedAt: deps.now() } as any)
      .where(and(eq(resumes.parentId, id), eq(resumes.userId, ownerId)));
  }

  await deps.db
    .delete(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)));

  return ok(undefined);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleWatchResume / handleUnwatchResume
// ═══════════════════════════════════════════════════════════════════════════

export async function handleWatchResume(
  deps: ResumeDeps,
  viewerId: string,
  resumeId: string,
): Promise<HandlerResult> {
  const [existing] = await deps.db
    .select({ id: watchedResumes.id })
    .from(watchedResumes)
    .where(and(eq(watchedResumes.viewerId, viewerId), eq(watchedResumes.resumeId, resumeId)))
    .limit(1);

  if (!existing) {
    await deps.db
      .insert(watchedResumes)
      .values({ viewerId, resumeId } as any);
  }
  return ok({ success: true });
}

export async function handleUnwatchResume(
  deps: ResumeDeps,
  viewerId: string,
  resumeId: string,
): Promise<HandlerResult> {
  await deps.db
    .delete(watchedResumes)
    .where(and(eq(watchedResumes.viewerId, viewerId), eq(watchedResumes.resumeId, resumeId)));
  return ok({ success: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSentimentPrediction — POST /api/resumes/sentimentprediction
//   • Scores the input (length-based heuristic; the real tool swaps this)
//   • When { resumeId, text } shape is sent, persists the score on the
//     owning resume row so GET /:id reflects it.
// ═══════════════════════════════════════════════════════════════════════════

function scoreSentiment(text: string): number {
  return text.length > 300 ? 78 : text.length > 80 ? 64 : 52;
}

export async function handleSentimentPrediction(
  deps: ResumeDeps,
  ownerId: string,
  body: unknown,
): Promise<HandlerResult> {
  const resumeId = typeof body === "object" && body !== null ? (body as any).resumeId : undefined;
  const text = typeof body === "string"
    ? body
    : typeof (body as any)?.text === "string"
      ? (body as any).text
      : JSON.stringify(body ?? "");

  const score = scoreSentiment(text);

  if (typeof resumeId === "string" && resumeId.length > 0) {
    try {
      await deps.db
        .update(resumes)
        .set({ sentimentScore: Math.round(score), updatedAt: deps.now() } as any)
        .where(and(eq(resumes.id, resumeId), eq(resumes.userId, ownerId)));
    } catch (err) {
      console.warn(
        "[sentimentprediction] persist failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return ok({ score });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleListResumes — GET /api/resumes
//   • Returns every resume owned by the caller, with batch-computed
//     viewer extras (isWatched + viewCount).
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListResumes(
  deps: ResumeDeps,
  ownerId: string,
): Promise<HandlerResult> {
  const rows = await deps.db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, ownerId))
    .orderBy(resumes.updatedAt);

  if (!Array.isArray(rows) || rows.length === 0) {
    return ok([]);
  }

  // Batched lookup — single query per cross-cut (watches + view counts).
  const ids = rows.map((r: any) => r.id);
  const watches = await deps.db
    .select({ resumeId: watchedResumes.resumeId })
    .from(watchedResumes)
    .where(and(eq(watchedResumes.viewerId, ownerId), inArray(watchedResumes.resumeId, ids)));
  const watched = new Set<string>(watches.map((w: any) => w.resumeId));

  const viewRows = await deps.db
    .select({ resumeId: resumeViews.resumeId, c: sql<number>`count(*)::int` })
    .from(resumeViews)
    .where(inArray(resumeViews.resumeId, ids))
    .groupBy(resumeViews.resumeId);
  const viewCounts = new Map<string, number>(
    viewRows.map((r: any) => [r.resumeId, Number(r.c)]),
  );

  const serialized = rows.map((r: any) =>
    rowToResume(r, {
      isOwner: true,
      isWatched: watched.has(r.id),
      viewCount: viewCounts.get(r.id) ?? 0,
    }),
  );
  return ok(serialized);
}
