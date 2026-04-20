/**
 * Resume serializers + row-extras queries — one source of truth for the
 * wire format and the per-viewer extras the list/detail endpoints need.
 *
 * Before this module existed, these were scattered:
 *   - `routes/resumes.ts` owned the canonical implementations of
 *     `rowToResume`, `rowToResumeSummary`, `computeViewerExtras(Batch)`,
 *     `recordResumeView`, `PRIVACY_TO_LEVEL`, `LEVEL_TO_PRIVACY`.
 *   - `routes/resume-handlers.ts` re-implemented `computeViewerExtras`,
 *     `computeViewerExtrasBatch`, `recordResumeView`, and
 *     `PRIVACY_TO_LEVEL` locally because it wanted a `DbPort = any`
 *     signature rather than the `ReturnType<typeof getDb>` signature
 *     from resumes.ts.
 *
 * That duplication was already paying dividends in drift: a fix to the
 * query in one place wouldn't land in the other. Everything lives here
 * now and both consumers import from this file.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { computeDiffPercent } from "../utils/resume-diff.js";
import {
  normalizeJsonResume,
} from "../services/resume-parse.js";
import type {
  Resume,
  ResumeSummary,
  ResumePrivacy,
} from "../../../shared/resume.js";

const { resumeInformation: resumes, watchedResumes, resumeViews } = schema;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Privacy string → stored int. Ordered by increasing restriction. */
export const PRIVACY_TO_LEVEL: Record<string, number> = {
  public: 0,
  recruiter_only: 1,
  connections: 2,
  private: 10,
  draft: 10,
};

/** Reverse map used by the serializer to project stored ints back to the
 *  canonical string. Keep in lockstep with PRIVACY_TO_LEVEL — any row
 *  whose privacyLevel isn't in this map serializes as "private" (the
 *  safest default). */
export const LEVEL_TO_PRIVACY: Record<number, string> = {
  0: "public",
  1: "recruiter_only",
  2: "connections",
  10: "private",
};

// ---------------------------------------------------------------------------
// Viewer extras — what the serializer can't compute on its own
// ---------------------------------------------------------------------------

/** Per-viewer context that the serializer needs but can't compute on its
 *  own. Produced by computeViewerExtras[Batch] below. */
export interface ResumeViewerExtras {
  isOwner: boolean;
  isWatched: boolean;
  viewCount: number;
}

export const EMPTY_VIEWER_EXTRAS: ResumeViewerExtras = {
  isOwner: false,
  isWatched: false,
  viewCount: 0,
};

/** For a resume the caller just created: owner by construction, no
 *  watches or views yet. Avoids a round-trip to the DB on insert paths. */
export function freshOwnerExtras(): ResumeViewerExtras {
  return { isOwner: true, isWatched: false, viewCount: 0 };
}

// ---------------------------------------------------------------------------
// Content normalization
// ---------------------------------------------------------------------------

const EMPTY_CONTENT_DEFAULTS = {
  work: [],
  volunteer: [],
  education: [],
  awards: [],
  certificates: [],
  publications: [],
  skills: [],
  languages: [],
  interests: [],
  references: [],
  projects: [],
  metaData: [],
} as const;

/** Normalize a stored content blob to the canonical camelCase JSON Resume
 *  shape, filling empty arrays for sections the writer omitted so
 *  downstream consumers can rely on section arrays always being present. */
export function normalizeContent(content: unknown): Record<string, unknown> {
  const normalized = normalizeJsonResume(content);
  for (const [k, v] of Object.entries(EMPTY_CONTENT_DEFAULTS)) {
    if (!(k in normalized)) (normalized as Record<string, unknown>)[k] = v;
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Serializers — pure, no DB, no env
// ---------------------------------------------------------------------------

/** Map `resume_information` row + viewer extras → canonical Resume wire
 *  shape. This is the function whose output must parse against
 *  `ResumeSchema` in shared/resume.ts (resume-contract.test.ts enforces). */
export function rowToResume(
  row: typeof resumes.$inferSelect,
  extras: ResumeViewerExtras,
): Resume {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    slug: row.slug ?? null,
    content: normalizeContent(row.content) as Resume["content"],
    status: (row.status as Resume["status"]) ?? "draft",
    privacy: (LEVEL_TO_PRIVACY[row.privacyLevel] ?? "private") as ResumePrivacy,
    isMaster: row.isMaster,
    isActive: row.isActive,
    parentId: row.parentId ?? null,
    diffPercent: row.diffPercent ?? null,
    templateId: row.templateId ?? null,
    metaResumeId: row.metaResumeId ?? null,
    sentimentScore: row.sentimentScore ?? null,
    viewCount: extras.viewCount,
    isOwner: extras.isOwner,
    isWatched: extras.isWatched,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/** Map `resume_information` row + viewer extras → ResumeSummary wire shape.
 *  The summary omits the full content blob and surfaces the two card-UI
 *  fields (`headline`, `summary`) so list endpoints stay cheap. */
export function rowToResumeSummary(
  row: typeof resumes.$inferSelect,
  extras: ResumeViewerExtras,
): ResumeSummary {
  const content = (row.content ?? {}) as Record<string, unknown>;
  // Tolerant of legacy PascalCase rows that the migration didn't rewrite.
  const basics = ((content.basics ?? content.Basics) ?? {}) as Record<string, unknown>;
  const headline = String(basics.label ?? (basics as any).Label ?? "");
  const summary = String(basics.summary ?? (basics as any).Summary ?? "");

  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    slug: row.slug ?? null,
    status: (row.status as ResumeSummary["status"]) ?? "draft",
    privacy: (LEVEL_TO_PRIVACY[row.privacyLevel] ?? "private") as ResumePrivacy,
    isMaster: row.isMaster,
    isActive: row.isActive,
    parentId: row.parentId ?? null,
    diffPercent: row.diffPercent ?? null,
    templateId: row.templateId ?? null,
    metaResumeId: row.metaResumeId ?? null,
    sentimentScore: row.sentimentScore ?? null,
    viewCount: extras.viewCount,
    isOwner: extras.isOwner,
    isWatched: extras.isWatched,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    headline,
    summary,
  };
}

/** Merge an incoming resume `content` blob with the metaData (media
 *  attachments) from the existing row. Media is managed by the dedicated
 *  PUT /:id/metadata endpoint, so blindly writing `content` from a resume
 *  edit would wipe out the user's attached media. Callers that
 *  deliberately pass `metaData` are respected. */
export function preserveMetaData(
  nextContent: unknown,
  existingMetaData: unknown,
): unknown {
  if (!nextContent || typeof nextContent !== "object") return nextContent;
  const next = nextContent as Record<string, unknown>;
  if (next.metaData !== undefined) return next;
  if (existingMetaData === undefined) return next;
  return { ...next, metaData: existingMetaData };
}

// ---------------------------------------------------------------------------
// DB-backed extras — the per-viewer joins the serializer needs
// ---------------------------------------------------------------------------

// Any Drizzle-compatible database handle. Typed `any` here rather than
// `ReturnType<typeof getDb>` because the fake-db test harness supplies
// a minimal shim, not a real Drizzle client.
type DbLike = any;

/** Single-row version: computes `isOwner`, `isWatched`, `viewCount` for
 *  one resume. For list endpoints prefer `computeViewerExtrasBatch` —
 *  this issues 2 queries per call. */
export async function computeViewerExtras(
  db: DbLike,
  row: { id: string; userId: string },
  viewerId: string | null | undefined,
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

/** Batched variant for list handlers — single query per cross-cut
 *  (watches + views) rather than N lookups. Returns a Map keyed by
 *  resume id so callers can project back onto their row array. */
export async function computeViewerExtrasBatch(
  db: DbLike,
  rows: Array<{ id: string; userId: string }>,
  viewerId: string | null | undefined,
): Promise<Map<string, ResumeViewerExtras>> {
  const ids = rows.map((r) => r.id);
  const result = new Map<string, ResumeViewerExtras>();
  if (ids.length === 0) return result;

  const watchedIds = new Set<string>();
  if (viewerId) {
    const watches = await db
      .select({ resumeId: watchedResumes.resumeId })
      .from(watchedResumes)
      .where(and(eq(watchedResumes.viewerId, viewerId), inArray(watchedResumes.resumeId, ids)));
    for (const w of watches as Array<{ resumeId: string }>) watchedIds.add(w.resumeId);
  }

  const viewRows = await db
    .select({
      resumeId: resumeViews.resumeId,
      c: sql<number>`count(*)::int`,
    })
    .from(resumeViews)
    .where(inArray(resumeViews.resumeId, ids))
    .groupBy(resumeViews.resumeId);
  const viewCounts = new Map<string, number>(
    (viewRows as Array<{ resumeId: string; c: number }>).map((r) => [r.resumeId, Number(r.c)]),
  );

  for (const row of rows) {
    result.set(row.id, {
      isOwner: Boolean(viewerId && viewerId === row.userId),
      isWatched: watchedIds.has(row.id),
      viewCount: viewCounts.get(row.id) ?? 0,
    });
  }
  return result;
}

/** Record a single view event. No-op when the viewer is the owner —
 *  owners refreshing their own resume would otherwise inflate the count. */
export async function recordResumeView(
  db: DbLike,
  resumeId: string,
  ownerId: string,
  viewer: {
    userId: string | null;
    ipHash?: string | null;
    referrer?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  if (viewer.userId && viewer.userId === ownerId) return;
  await db.insert(resumeViews).values({
    resumeId,
    viewerId: viewer.userId,
    ipHash: viewer.ipHash ?? null,
    referrer: viewer.referrer ?? null,
    userAgent: viewer.userAgent ?? null,
  } as any);
}

// ---------------------------------------------------------------------------
// Cross-cutting persistence — used by handleUpdateResume + sentiment tool
// ---------------------------------------------------------------------------

/** Recompute diff_percent for this resume and any of its children.
 *
 *   - Variant (parentId set): fetch the parent and recompute this row's diff.
 *   - Potential parent: recompute every child's diff against this (newly
 *     updated) content.
 *
 *  Called after any create/update that could shift the relationship.
 *  No-op for standalone resumes with no parent and no children. */
export async function refreshDiffPercentFor(
  db: DbLike,
  userId: string,
  resumeId: string,
): Promise<void> {
  const [self] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);
  if (!self) return;

  if (self.parentId) {
    const [parent] = await db
      .select({ content: resumes.content })
      .from(resumes)
      .where(and(eq(resumes.id, self.parentId), eq(resumes.userId, userId)))
      .limit(1);
    const pct = parent
      ? computeDiffPercent(
          parent.content as Record<string, unknown>,
          self.content as Record<string, unknown>,
        )
      : null;
    await db
      .update(resumes)
      .set({ diffPercent: pct } as any)
      .where(and(eq(resumes.id, self.id), eq(resumes.userId, userId)));
  }

  const children = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.parentId, resumeId), eq(resumes.userId, userId)));

  for (const child of children) {
    const pct = computeDiffPercent(
      self.content as Record<string, unknown>,
      child.content as Record<string, unknown>,
    );
    await db
      .update(resumes)
      .set({ diffPercent: pct } as any)
      .where(and(eq(resumes.id, child.id), eq(resumes.userId, userId)));
  }
}

/** Persist the latest sentiment score on the resume row. */
export async function persistSentimentScore(
  db: DbLike,
  resumeId: string,
  userId: string,
  score: number,
): Promise<void> {
  await db
    .update(resumes)
    .set({ sentimentScore: Math.round(score), updatedAt: new Date() } as any)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
}
