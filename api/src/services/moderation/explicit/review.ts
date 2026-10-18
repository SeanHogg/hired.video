/**
 * SuperAdmin review of the home-wall gate: blocked / unscreened public
 * videos, an override (approve → on the wall, or keep blocked), and a
 * bounded backfill that scans public videos that have no verdict yet.
 * Overrides are audit-logged by the route (AUDIT_ACTIONS).
 */
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { isNotRenderVariant } from "../../../repositories/renderVariantRepository.js";
import { getDb, type Db } from "../../../db/index.js";
import { contentScans } from "../../../db/schema/contentScans.js";
import { users } from "../../../db/schema/users.js";
import { videos } from "../../../db/schema/videos.js";
import { cdnUrl } from "../../../utils/cdn.js";
import {
  isPubliclyVisible,
  type ScanOverride,
} from "../../../../../shared/moderation/explicit.js";
import { invalidatePublicVideoFeed } from "../../studio/public-video-feed.js";
import { getScan, listVideoScansForReview, setOverride, type ReviewFilter, type StoredScan } from "./contentScanRepository.js";
import { evaluateVideoForPublic } from "./videoScan.js";
import type { ExplicitScanDeps } from "./deps.js";
import { DomainError } from "../../../domains/errors.js";

const QUEUE_LIMIT = 100;

export interface VideoScanReviewItem {
  videoId: string;
  title: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  ownerId: string | null;
  ownerName: string | null;
  verdict: StoredScan["verdict"];
  overrideVerdict: StoredScan["overrideVerdict"];
  categories: StoredScan["categories"];
  reason: string | null;
  scannedAt: string;
  reviewedAt: string | null;
}

export async function listVideoScanQueue(filter: ReviewFilter, db: Db = getDb()): Promise<VideoScanReviewItem[]> {
  const scans = await listVideoScansForReview(filter, QUEUE_LIMIT, db);
  if (scans.length === 0) return [];
  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      thumbnailUrl: videos.thumbnailUrl,
      r2Key: videos.r2Key,
      youtubeUrl: videos.youtubeUrl,
      ownerId: users.id,
      ownerName: users.name,
    })
    .from(videos)
    .innerJoin(users, eq(users.id, videos.userId))
    .where(inArray(videos.id, scans.map((s) => s.subjectId)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Deleted videos leave an orphan scan row — skip them.
  return scans.flatMap((s) => {
    const v = byId.get(s.subjectId);
    if (!v) return [];
    return [{
      videoId: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      videoUrl: v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null),
      ownerId: v.ownerId,
      ownerName: v.ownerName,
      verdict: s.verdict,
      overrideVerdict: s.overrideVerdict,
      categories: s.categories,
      reason: s.reason,
      scannedAt: s.scannedAt.toISOString(),
      reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
    }];
  });
}

export class ScanReviewError extends DomainError {
  declare readonly code: "NOT_FOUND";
  constructor(code: "NOT_FOUND") {
    super(404, code, "No scan found for that video");
    this.name = "ScanReviewError";
  }
}

export async function overrideVideoScan(args: { videoId: string; override: ScanOverride; reviewerId: string }): Promise<StoredScan> {
  const before = await getScan("video", args.videoId);
  if (!before) throw new ScanReviewError("NOT_FOUND");
  const after = await setOverride({ subjectType: "video", subjectId: args.videoId, override: args.override, reviewerId: args.reviewerId });
  if (!after) throw new ScanReviewError("NOT_FOUND");
  if (isPubliclyVisible(before) !== isPubliclyVisible(after)) invalidatePublicVideoFeed();
  return after;
}

/** How long an unscreened verdict waits before the backfill retries it. */
export const UNSCREENED_RETRY_HOURS = 6;

/**
 * Public, on-the-wall videos that need a (re)scan, newest first (the wall
 * shows the most recent 20):
 *   • no `video` scan yet (posted before the gate, or by a writer with no
 *     request context — e.g. mediaRepository.insertVideo / updateVideoById);
 *   • the row changed after its last scan (videos.updated_at > scanned_at);
 *   • unscreened (classifier was down) for longer than the retry window,
 *     unless a SuperAdmin already decided.
 * Exported so a test can pin the predicate's SQL.
 */
export function videosNeedingScanQuery(db: Db, limit: number) {
  return db
    .select({ id: videos.id })
    .from(videos)
    .leftJoin(contentScans, and(eq(contentScans.subjectType, "video"), eq(contentScans.subjectId, sql`${videos.id}::text`)))
    .where(and(
      eq(videos.privacyStatus, "public"),
      eq(videos.showOnHome, true),
      isNotRenderVariant(videos.id),
      or(
        isNull(contentScans.id),
        gt(videos.updatedAt, contentScans.scannedAt),
        and(
          eq(contentScans.verdict, "unscreened"),
          isNull(contentScans.overrideVerdict),
          lt(contentScans.scannedAt, sql.raw(`now() - interval '${UNSCREENED_RETRY_HOURS} hours'`)),
        ),
      ),
    ))
    .orderBy(desc(videos.createdAt))
    .limit(Math.min(Math.max(limit, 1), 25));
}

/** Scan the next batch of videos needing it. Called by the SuperAdmin
 *  button and by the scheduled cron tick (scheduled.ts). Each evaluation
 *  stamps scanned_at, so repeated runs make progress. */
export async function backfillVideoScans(deps: ExplicitScanDeps, limit = 10, db: Db = getDb()): Promise<{ scanned: number }> {
  const pending = await videosNeedingScanQuery(db, limit);
  for (const { id } of pending) await evaluateVideoForPublic(id, deps);
  return { scanned: pending.length };
}
