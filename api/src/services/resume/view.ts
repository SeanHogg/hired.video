/**
 * Resume view service — orchestrates per-viewer row extras and the
 * handful of cross-cutting updates the list/detail handlers need.
 *
 * These functions used to live in `handlers/resume-serializer.ts` and
 * took a Drizzle handle directly, which muddled the layering: the
 * serializer was both pure-serialization code AND a DB access point.
 * Extracting them here means:
 *
 *   • `rowToResume` / `rowToResumeSummary` are pure wire-shape mappers.
 *   • Everything DB-ish goes through `ResumeRepository`.
 *   • This service composes the two — handlers inject a repo and call
 *     these functions to produce the extras a row serializer needs.
 */

import { EMPTY_VIEWER_EXTRAS, type ResumeViewerExtras } from "../../handlers/resume-serializer.js";
import type { IResumeRepository, ResumeRow } from "../../repositories/index.js";
import { computeDiffPercent } from "../../utils/resume-diff.js";

// ─── Viewer extras ────────────────────────────────────────────────────────────

/** Compute isOwner / isWatched / viewCount for a single row. Used by
 *  the GET /:id handler — for list endpoints prefer the batch variant
 *  which collapses watch + view counts to one repo query each. */
export async function computeViewerExtras(
  repo: IResumeRepository,
  row: { id: string; userId: string },
  viewerId: string | null | undefined,
): Promise<ResumeViewerExtras> {
  const isOwner = Boolean(viewerId && viewerId === row.userId);

  let isWatched = false;
  if (viewerId) {
    isWatched = await repo.hasWatched(viewerId, row.id);
  }
  const viewCount = await repo.countViews(row.id);

  return { isOwner, isWatched, viewCount };
}

/** Batched variant for list handlers — one repo call per cross-cut
 *  (watches + views) rather than N lookups. Returns a Map keyed by
 *  resume id so callers can project back onto their row array. */
export async function computeViewerExtrasBatch(
  repo: IResumeRepository,
  rows: Array<{ id: string; userId: string }>,
  viewerId: string | null | undefined,
): Promise<Map<string, ResumeViewerExtras>> {
  const result = new Map<string, ResumeViewerExtras>();
  if (rows.length === 0) return result;

  const ids = rows.map((r) => r.id);
  const watched = viewerId
    ? await repo.watchedIdsForViewer(viewerId, ids)
    : new Set<string>();
  const viewCounts = await repo.countViewsBulk(ids);

  for (const row of rows) {
    result.set(row.id, {
      isOwner: Boolean(viewerId && viewerId === row.userId),
      isWatched: watched.has(row.id),
      viewCount: viewCounts.get(row.id) ?? 0,
    });
  }
  return result;
}

/** Record a single view event. No-op when the viewer is the owner —
 *  owners refreshing their own resume would otherwise inflate the count. */
export async function recordResumeView(
  repo: IResumeRepository,
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
  await repo.insertView({
    resumeId,
    viewerId: viewer.userId,
    ipHash: viewer.ipHash ?? null,
    referrer: viewer.referrer ?? null,
    userAgent: viewer.userAgent ?? null,
  });
}

// ─── Diff + sentiment persistence ────────────────────────────────────────────

/** Recompute diff_percent for this resume and any of its children.
 *
 *   - Variant (parentId set): fetch the parent and recompute this row's diff.
 *   - Potential parent: recompute every child's diff against this (newly
 *     updated) content.
 *
 *  Called after any create/update that could shift the relationship.
 *  No-op for standalone resumes with no parent and no children. */
export async function refreshDiffPercentFor(
  repo: IResumeRepository,
  userId: string,
  resumeId: string,
): Promise<void> {
  const self = await repo.findByIdForOwner(resumeId, userId);
  if (!self) return;

  const updates: Array<{ id: string; diffPercent: number | null }> = [];

  if (self.parentId) {
    const parent = await repo.findByIdForOwner(self.parentId, userId);
    const pct = parent
      ? computeDiffPercent(
          parent.content as Record<string, unknown>,
          self.content as Record<string, unknown>,
        )
      : null;
    updates.push({ id: self.id, diffPercent: pct });
  }

  const children = await repo.findChildrenForOwner(resumeId, userId);
  for (const child of children) {
    updates.push({
      id: child.id,
      diffPercent: computeDiffPercent(
        self.content as Record<string, unknown>,
        child.content as Record<string, unknown>,
      ),
    });
  }

  // One write for self + every child (was one UPDATE per row).
  await repo.updateDiffPercentBulk(userId, updates);
}

/** Persist the latest sentiment score on the resume row. */
export async function persistSentimentScore(
  repo: IResumeRepository,
  resumeId: string,
  userId: string,
  score: number,
): Promise<void> {
  await repo.updateSentimentScoreForOwner(resumeId, userId, Math.round(score));
}

// Re-export for convenience so handlers can import extras type + default
// alongside the orchestration functions from a single module.
export { EMPTY_VIEWER_EXTRAS };
export type { ResumeViewerExtras };
