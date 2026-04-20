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
import { computeDiffPercent } from "../utils/resume-diff.js";

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

// Result envelope + auth guard live in the shared handler module.
// `requireAuth` is imported here even though resume handlers mostly accept
// anonymous callers (public/embedded reads) — write endpoints like
// handleWatchResume / handleSentimentPrediction still need a gate.
import { ok, fail, requireAuth, type HandlerResult } from "../handlers/shared.js";
export { ok, fail };
export type { HandlerResult };

// Serializers, constants, and row-extras queries all live in the shared
// serializer module. Before this consolidation this file had its own copy
// of computeViewerExtras / computeViewerExtrasBatch / recordResumeView /
// PRIVACY_TO_LEVEL that silently drifted from the ones in resumes.ts —
// the exact duplication class that produced the 2026-04-20 blank-title
// bug. Never re-implement these locally.
import {
  UUID_RE,
  PRIVACY_TO_LEVEL,
  EMPTY_VIEWER_EXTRAS,
  rowToResume,
  rowToResumeSummary,
  preserveMetaData,
  computeViewerExtras,
  computeViewerExtrasBatch,
  recordResumeView as recordResumeViewShared,
  type ResumeViewerExtras,
} from "../handlers/resume-serializer.js";

/** Small adapter — the shared `recordResumeView` expects `{ userId, … }`
 *  but our per-request context uses `viewerId` (semantically: "current
 *  viewer, possibly anonymous"). One function to keep the names straight. */
async function recordResumeView(
  db: DbPort,
  resumeId: string,
  ownerId: string,
  ctx: ResumeRequestContext,
): Promise<void> {
  await recordResumeViewShared(db, resumeId, ownerId, {
    userId: ctx.viewerId,
    ipHash: ctx.ipHash,
    referrer: ctx.referrer,
    userAgent: ctx.userAgent,
  });
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
  opts: { recordView?: boolean } = {},
): Promise<HandlerResult> {
  const condition = UUID_RE.test(id) ? eq(resumes.id, id) : eq(resumes.slug, id);
  const [row] = await deps.db.select().from(resumes).where(condition).limit(1);
  if (!row) return fail(404, "NOT_FOUND", "Resume not found");

  const isOwner = !!ctx.viewerId && row.userId === ctx.viewerId;
  const isPublic = row.privacyLevel === 0;
  if (!isOwner && !isPublic) {
    return fail(404, "RESUME_PRIVATE", "This resume is private. Ask the owner to share it with you.");
  }

  // Embedded views skip the view recording — if a resume is embedded on
  // a page every pageload would inflate analytics. Owners also never
  // count (handled inside recordResumeView).
  if (opts.recordView !== false) {
    await recordResumeView(deps.db, row.id, row.userId, ctx);
  }
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
  // Collision check is GLOBAL (not per-user) because slugs resolve public
  // URLs via `/api/resumes/public/:slug` which picks one row with .limit(1);
  // allowing the same slug on two users' resumes means one of their public
  // URLs silently points to the other person's resume. The error message
  // tells the user exactly what's wrong so they can pick a different one.
  let slugUpdate: { slug: string | null } | undefined;
  if (parsed.data.slug !== undefined) {
    const slug = parsed.data.slug;
    if (slug !== null) {
      const [taken] = await deps.db
        .select({ id: resumes.id })
        .from(resumes)
        .where(and(eq(resumes.slug, slug), ne(resumes.id, id)))
        .limit(1);
      if (taken) {
        return fail(
          409,
          "SLUG_TAKEN",
          `The slug "${slug}" is already in use. Please choose a different slug.`,
        );
      }
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

// ═══════════════════════════════════════════════════════════════════════════
// handleListOwnedResumes — GET /api/resumes/getresumesownedbyauthuser
//                      and GET /api/resumes/withownership
//   • Returns summaries (not full content) of every resume owned by the
//     caller.
//   • When `includeOwnership` is true, each item gets `ownership: "owned"`
//     so the /withownership endpoint can distinguish owned vs.
//     shared-with-me on future mixed lists.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListOwnedResumes(
  deps: ResumeDeps,
  ownerId: string,
  opts: { includeOwnership?: boolean } = {},
): Promise<HandlerResult> {
  const rows = await deps.db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, ownerId));

  const extrasMap = await computeViewerExtrasBatch(deps.db, rows, ownerId);
  const summaries = (rows as any[]).map((r) => {
    const summary = rowToResumeSummary(r, extrasMap.get(r.id) ?? EMPTY_VIEWER_EXTRAS);
    return opts.includeOwnership ? { ...summary, ownership: "owned" as const } : summary;
  });
  return ok(summaries);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleListPublicResumes — GET /api/resumes/public
//   • Paginated feed of public resumes for anonymous browsing / discovery.
//   • Anyone can call; when the caller is authenticated, `isOwner` is
//     computed per row so the UI can show edit buttons on their own
//     resumes that happen to appear in the feed.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListPublicResumes(
  deps: ResumeDeps,
  viewerId: string | null,
  opts: { page?: number; limit?: number } = {},
): Promise<HandlerResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

  const rows = await deps.db
    .select()
    .from(resumes)
    .where(eq(resumes.privacyLevel, 0))
    .orderBy(resumes.updatedAt)
    .limit(limit)
    .offset((page - 1) * limit);

  const items = (rows as any[]).map((row) =>
    rowToResumeSummary(row, {
      ...EMPTY_VIEWER_EXTRAS,
      isOwner: Boolean(viewerId && row.userId === viewerId),
    }),
  );

  return ok({
    items,
    total: items.length,
    page,
    limit,
    hasNext: items.length === limit,
    hasPrev: page > 1,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleListMasterGroups — GET /api/resumes/mastergroups
//   • Returns the caller's resumes grouped by master + its variations.
//   • Non-master root resumes surface as single-item groups so the UI
//     can render them in the same list without special-casing.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListMasterGroups(
  deps: ResumeDeps,
  ownerId: string,
): Promise<HandlerResult> {
  const all = await deps.db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, ownerId));

  const extrasMap = await computeViewerExtrasBatch(deps.db, all, ownerId);
  const toResume = (r: any) =>
    rowToResume(r, extrasMap.get(r.id) ?? EMPTY_VIEWER_EXTRAS);

  const masters = (all as any[]).filter((r) => r.isMaster && !r.parentId);
  const variations = (all as any[]).filter((r) => !!r.parentId);
  const ungrouped = (all as any[]).filter((r) => !r.isMaster && !r.parentId);

  const masterGroups = [
    ...masters.map((m) => ({
      masterResume: toResume(m),
      variations: variations.filter((v) => v.parentId === m.id).map(toResume),
    })),
    ...ungrouped.map((r) => ({ masterResume: toResume(r), variations: [] })),
  ];

  return ok(masterGroups);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleValidateSlug — GET /api/resumes/validateslug?slug=…&resumeId=…
//   • Returns { slug, available }.
//   • `resumeId` excludes a specific row from the collision check so a
//     user editing a resume isn't told their own slug is taken.
//   • Uniqueness is GLOBAL across all users, not per-user. Public slug
//     URLs (`/api/resumes/public/:slug`) pick one row with .limit(1);
//     allowing the same slug on two users' resumes silently points one
//     person's public link at the other's resume. Kept in lockstep with
//     handleUpdateResume's SLUG_TAKEN check.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleValidateSlug(
  deps: ResumeDeps,
  ownerId: string,
  opts: { slug: string; resumeId?: string | null },
): Promise<HandlerResult> {
  void ownerId; // slug uniqueness is global; ownerId retained for API shape compat
  const slug = opts.slug ?? "";
  if (!slug) return ok({ slug, available: false });

  const conditions = opts.resumeId
    ? and(eq(resumes.slug, slug), ne(resumes.id, opts.resumeId))
    : eq(resumes.slug, slug);

  const [existing] = await deps.db
    .select({ id: resumes.id })
    .from(resumes)
    .where(conditions)
    .limit(1);

  return ok({ slug, available: !existing });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSaveResume — POST /api/resumes/save
//   • Lightweight insert. Accepts an already-normalised content object.
//   • Title falls back to the basics.name from the content, or
//     "Untitled Resume" if neither is present.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSaveResume(
  deps: ResumeDeps,
  ownerId: string,
  content: Record<string, unknown>,
): Promise<HandlerResult> {
  const title = typeof (content as any)?.name === "string"
    ? (content as any).name
    : "Untitled Resume";

  const [created] = await deps.db
    .insert(resumes)
    .values({ userId: ownerId, title, content, status: "draft" } as any)
    .returning();

  return ok(rowToResume(created, EMPTY_VIEWER_EXTRAS), 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleCloneResume — POST /api/resumes/:id/clone
//   • Duplicates the resume's content and adds " (copy)" to the title.
//   • Status resets to draft. Privacy resets to default on insert (safest
//     for copies — caller can re-publish from the UI).
//   • 404 when the source doesn't belong to the caller.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCloneResume(
  deps: ResumeDeps,
  ownerId: string,
  sourceId: string,
): Promise<HandlerResult> {
  const [original] = await deps.db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, sourceId), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!original) return fail(404, "NOT_FOUND", "Resume not found");

  const [cloned] = await deps.db
    .insert(resumes)
    .values({
      userId: ownerId,
      title: `${original.title} (copy)`,
      content: original.content ?? {},
      status: "draft",
    } as any)
    .returning();

  return ok(rowToResume(cloned, EMPTY_VIEWER_EXTRAS), 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// handlePublishResume — POST /api/resumes/:id/publish
//   • Flips status → "published". Does NOT change privacyLevel (callers
//     manage that through /setprivacy). A resume can be "published but
//     private" — e.g. shared by direct link only.
//   • 404 when the resume doesn't exist for this user.
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePublishResume(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const [updated] = await deps.db
    .update(resumes)
    .set({ status: "published", updatedAt: deps.now() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .returning();
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");
  return ok(rowToResume(updated, EMPTY_VIEWER_EXTRAS));
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSetMaster / handleSetActive
//   • Only one resume per user can be "master" (tailoring source) or
//     "active" (extension target) at a time — so the handler unsets the
//     flag across all owned rows first, then sets it on the target.
//   • 404 when the target doesn't belong to the caller.
// ═══════════════════════════════════════════════════════════════════════════

async function flipSingletonFlag(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  field: "isMaster" | "isActive",
): Promise<HandlerResult> {
  const [found] = await deps.db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!found) return fail(404, "NOT_FOUND", "Resume not found");

  await deps.db
    .update(resumes)
    .set({ [field]: false, updatedAt: deps.now() } as any)
    .where(eq(resumes.userId, ownerId));
  await deps.db
    .update(resumes)
    .set({ [field]: true, updatedAt: deps.now() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)));

  return ok(true);
}

export function handleSetMaster(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  return flipSingletonFlag(deps, ownerId, id, "isMaster");
}

export function handleSetActive(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  return flipSingletonFlag(deps, ownerId, id, "isActive");
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSetPrivacy — POST /api/resumes/:id/setprivacy
//   • Accepts a privacy string; unknown values fall through to "private"
//     (the safest default — never accidentally expose a resume).
//   • 404 when no row is updated.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSetPrivacy(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  privacy: string | undefined,
): Promise<HandlerResult> {
  const privacyLevel = privacy && PRIVACY_TO_LEVEL[privacy] !== undefined
    ? PRIVACY_TO_LEVEL[privacy]
    : 10;

  const [updated] = await deps.db
    .update(resumes)
    .set({ privacyLevel, updatedAt: deps.now() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .returning({ id: resumes.id });
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");
  return ok(true);
}

// ═══════════════════════════════════════════════════════════════════════════
// handlePromote — POST /api/resumes/:id/promote
//   • Promotes a variant to master: clears its parentId AND becomes the
//     sole master on the account (any previous master is demoted).
//   • 404 when the target isn't owned by the caller.
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePromote(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const [found] = await deps.db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!found) return fail(404, "NOT_FOUND", "Resume not found");

  await deps.db
    .update(resumes)
    .set({ isMaster: false, updatedAt: deps.now() } as any)
    .where(eq(resumes.userId, ownerId));
  await deps.db
    .update(resumes)
    .set({ isMaster: true, parentId: null, updatedAt: deps.now() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)));

  return ok(true);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleDetach — POST /api/resumes/:id/detach
//   • Detaches a variant from its parent WITHOUT promoting to master.
//     Also clears diffPercent since the comparison baseline is gone.
//   • 404 when the target doesn't exist for the caller.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDetach(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const [updated] = await deps.db
    .update(resumes)
    .set({ parentId: null, diffPercent: null, updatedAt: deps.now() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .returning({ id: resumes.id });
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");
  return ok(true);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleCreateVariation — POST /api/resumes/:id/createvariation
//   • Creates a child variant off of `sourceId`. Accepts optional
//     `resumeData` (markdown) and `description` — markdown is parsed via
//     the AI parser port so downstream scorers see structured JSON, not
//     raw text. A structured parse failure is non-fatal; the variation
//     keeps the parent's JSON content as a floor.
//   • Enforces one-level hierarchy: if the source is already a variant,
//     it gets detached (becomes root) first — grandchildren never exist.
//   • Variations are always created private (privacyLevel=10).
//   • Computes diffPercent vs. the parent for the UI badge.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCreateVariation(
  deps: ResumeDeps,
  ownerId: string,
  sourceId: string,
  body: { name?: string; description?: string; resumeData?: string } | null,
): Promise<HandlerResult> {
  const [parent] = await deps.db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, sourceId), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!parent) return fail(404, "NOT_FOUND", "Resume not found");

  const baseContent: Record<string, unknown> =
    parent.content && typeof parent.content === "object"
      ? { ...(parent.content as Record<string, unknown>) }
      : {};

  const markdown = typeof body?.resumeData === "string" ? body.resumeData.trim() : "";
  if (markdown) {
    baseContent.markdown = markdown;
    try {
      const parsed = await deps.parser.parseRawText(markdown);
      if (parsed && typeof parsed === "object") {
        const carryKeys = [
          "basics", "work", "education", "skills", "volunteer", "awards",
          "certificates", "publications", "languages", "interests",
          "references", "projects",
        ];
        for (const key of carryKeys) {
          if ((parsed as any)[key] !== undefined) {
            baseContent[key] = (parsed as any)[key];
          }
        }
      }
    } catch (err) {
      // Non-fatal — the variation is still created with parent JSON +
      // markdown. The frontend shows a warning banner when parse fails.
      console.warn(
        "[createvariation] AI parse failed; keeping parent JSON:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (typeof body?.description === "string") {
    baseContent.variationDescription = body.description;
  }

  // Enforce one-level hierarchy — detach the source if it's itself a variant.
  if (parent.parentId) {
    await deps.db
      .update(resumes)
      .set({ parentId: null, diffPercent: null, updatedAt: deps.now() } as any)
      .where(and(eq(resumes.id, parent.id), eq(resumes.userId, ownerId)));
  }

  const name = body?.name?.trim();
  const [created] = await deps.db
    .insert(resumes)
    .values({
      userId: ownerId,
      title: name ?? `${parent.title} Variation`,
      content: baseContent,
      status: "draft",
      parentId: parent.id,
      isMaster: false,
      isActive: false,
      privacyLevel: 10,
      diffPercent: computeDiffPercent(
        parent.content as Record<string, unknown>,
        baseContent,
      ),
    } as any)
    .returning();

  return ok(rowToResume(created, { isOwner: true, isWatched: false, viewCount: 0 }), 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleGetMetadata / handleUpdateMetadata — GET/PUT /api/resumes/:id/metadata
//
//   `metaData` is the freeform array the UI stores alongside structured
//   JSON Resume content (media attachments, custom badges, etc). These
//   endpoints isolate metadata-only changes so the main content fields
//   aren't touched — preserves the normalized shape while the user edits
//   sidebar attachments.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleGetMetadata(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const [row] = await deps.db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!row) return fail(404, "NOT_FOUND", "Resume not found");

  const content = (row.content ?? {}) as Record<string, unknown>;
  return ok(Array.isArray(content.metaData) ? content.metaData : []);
}

export async function handleUpdateMetadata(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  body: unknown,
): Promise<HandlerResult> {
  const metaData = Array.isArray(body) ? body : [];

  const [row] = await deps.db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!row) return fail(404, "NOT_FOUND", "Resume not found");

  const content: Record<string, unknown> =
    row.content && typeof row.content === "object"
      ? { ...(row.content as Record<string, unknown>) }
      : {};
  content.metaData = metaData;

  const [updated] = await deps.db
    .update(resumes)
    .set({ content, updatedAt: deps.now() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .returning();
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");

  return ok(rowToResume(updated, { isOwner: true, isWatched: false, viewCount: 0 }));
}

// ═══════════════════════════════════════════════════════════════════════════
// handleGetResumeDiff — GET /api/resumes/:id/diff?compareId=…
//   • Field-level structural diff of content object vs. another resume
//     (default: the resume's parent).
//   • Returns added/removed/changed summaries per top-level content key.
//   • 404 separately when either side isn't owned by the caller, so the
//     UI can show "comparison resume deleted or unshared" vs. "this resume
//     doesn't exist".
// ═══════════════════════════════════════════════════════════════════════════

export async function handleGetResumeDiff(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  compareIdParam: string | null,
): Promise<HandlerResult> {
  const [resume] = await deps.db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!resume) return fail(404, "NOT_FOUND", "Resume not found");

  const compareId = compareIdParam ?? (resume as any).parentId ?? null;
  if (!compareId) {
    return ok({ message: "No parent or compareId to diff against", changes: [] });
  }

  const [other] = await deps.db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, compareId), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!other) return fail(404, "NOT_FOUND", "Comparison resume not found");

  const aContent = (resume.content ?? {}) as Record<string, unknown>;
  const bContent = (other.content ?? {}) as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(aContent), ...Object.keys(bContent)]);

  const changes: Array<{
    field: string;
    type: "added" | "removed" | "changed";
    before: unknown;
    after: unknown;
  }> = [];
  for (const key of allKeys) {
    const before = bContent[key];
    const after = aContent[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (before === undefined) changes.push({ field: key, type: "added", before: null, after });
    else if (after === undefined) changes.push({ field: key, type: "removed", before, after: null });
    else changes.push({ field: key, type: "changed", before, after });
  }

  return ok({
    resumeId: resume.id,
    compareId: other.id,
    resumeTitle: resume.title,
    compareTitle: other.title,
    changes,
    summary: {
      total: changes.length,
      added: changes.filter((c) => c.type === "added").length,
      removed: changes.filter((c) => c.type === "removed").length,
      changed: changes.filter((c) => c.type === "changed").length,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleExportResume — GET /api/resumes/:id/export?format=…
//
//   Format selection:
//     • json (default)           — structured payload
//     • md / markdown            — stored markdown if present, else a
//                                   JSON-Resume-to-markdown conversion
//     • pdf / docx               — rendering isn't wired yet. Returns
//                                   the markdown body as plain text with
//                                   an X-Export-Note header so the client
//                                   can surface the fallback to the user.
//
//   Returns a discriminated result so the Hono adapter can either respond
//   with JSON (error branch) or build a file download Response (success).
// ═══════════════════════════════════════════════════════════════════════════

export type ExportResult =
  | { kind: "error"; status: number; body: unknown }
  | {
      kind: "download";
      status: number;
      body: string;
      contentType: string;
      filename: string;
      extraHeaders?: Record<string, string>;
    };

export async function handleExportResume(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  format: string,
  jsonResumeToMarkdown: (content: Record<string, unknown> | null, fallbackTitle: string) => string,
): Promise<ExportResult> {
  const [row] = await deps.db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, ownerId)))
    .limit(1);
  if (!row) {
    return {
      kind: "error",
      status: 404,
      body: (fail(404, "NOT_FOUND", "Resume not found") as any).body,
    };
  }

  const content = row.content as Record<string, unknown> | null;
  const safeName = String(row.title).replace(/[^a-z0-9]/gi, "_");

  const resolveMarkdown = () =>
    typeof content?.markdown === "string"
      ? (content.markdown as string)
      : jsonResumeToMarkdown(content, row.title);

  const fmt = (format ?? "json").toLowerCase();

  if (fmt === "md" || fmt === "markdown") {
    return {
      kind: "download",
      status: 200,
      body: resolveMarkdown(),
      contentType: "text/markdown; charset=utf-8",
      filename: `${safeName}.md`,
    };
  }

  if (fmt === "pdf" || fmt === "docx") {
    return {
      kind: "download",
      status: 200,
      body: resolveMarkdown(),
      contentType: "text/plain; charset=utf-8",
      filename: `${safeName}.txt`,
      extraHeaders: {
        "X-Export-Note":
          "PDF/DOCX rendering not yet available; content returned as plain text",
      },
    };
  }

  const payload = JSON.stringify(
    { id: row.id, title: row.title, content, exportedAt: deps.now().toISOString() },
    null,
    2,
  );
  return {
    kind: "download",
    status: 200,
    body: payload,
    contentType: "application/json",
    filename: `${safeName}.json`,
  };
}
