/**
 * promotion_submissions data access (Lane A queue, #2046). The only module
 * that touches the table; use cases go through these functions.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "../../db/index.js";
import type { PromotionPlatform, PromotionStatus } from "../../../../shared/promotions.js";

const { promotionSubmissions } = schema;
export type PromotionSubmission = typeof promotionSubmissions.$inferSelect;

/** Bounded admin page size — the queue is reviewed newest-first. */
export const PROMOTION_QUEUE_LIMIT = 100;

export async function insertSubmission(
  row: {
    projectId: string;
    submittedBy: string;
    platform: PromotionPlatform;
    title: string;
    description: string;
    screeningVerdict: "pass" | "flag" | "block" | "unscreened";
    screeningNotes: string | null;
    /** The fitted cut to publish (#2045); null = the master render. */
    renderVariantId?: string | null;
    /** Screening blocked it: stored already rejected, with the reason. */
    autoRejectReason?: string;
  },
  db: Db = getDb(),
): Promise<PromotionSubmission | null> {
  // The partial unique index admits one open (pending/failed) submission per
  // project+platform; a duplicate submit is a no-op that returns null.
  const { autoRejectReason, ...values } = row;
  const [created] = await db
    .insert(promotionSubmissions)
    .values(
      autoRejectReason
        ? { ...values, status: "rejected", rejectReason: autoRejectReason, reviewedAt: new Date() }
        : values,
    )
    .onConflictDoNothing()
    .returning();
  return created ?? null;
}

export async function findSubmission(id: string, db: Db = getDb()): Promise<PromotionSubmission | null> {
  const [row] = await db.select().from(promotionSubmissions).where(eq(promotionSubmissions.id, id)).limit(1);
  return row ?? null;
}

export async function listByStatus(status: PromotionStatus, db: Db = getDb()): Promise<PromotionSubmission[]> {
  return db
    .select()
    .from(promotionSubmissions)
    .where(eq(promotionSubmissions.status, status))
    .orderBy(desc(promotionSubmissions.createdAt))
    .limit(PROMOTION_QUEUE_LIMIT);
}

export async function listForProject(projectId: string, db: Db = getDb()): Promise<PromotionSubmission[]> {
  return db
    .select()
    .from(promotionSubmissions)
    .where(eq(promotionSubmissions.projectId, projectId))
    .orderBy(desc(promotionSubmissions.createdAt))
    .limit(20);
}

/**
 * Atomically claim a submission for publishing so two reviewers can never
 * upload it twice. Claimable: an unclaimed pending row, any failed row
 * (retry), or a pending row whose claim went stale (worker died mid-upload).
 * The claim is `reviewed_at` on a pending row.
 */
export async function claimForPublish(id: string, reviewerId: string, db: Db = getDb()): Promise<PromotionSubmission | null> {
  const [row] = await db
    .update(promotionSubmissions)
    .set({ status: "pending", reviewedBy: reviewerId, reviewedAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(
      and(
        eq(promotionSubmissions.id, id),
        sql`(
          (${promotionSubmissions.status} = 'pending' AND (${promotionSubmissions.reviewedAt} IS NULL
             OR ${promotionSubmissions.reviewedAt} < now() - interval '15 minutes'))
          OR ${promotionSubmissions.status} = 'failed'
        )`,
      ),
    )
    .returning();
  return row ?? null;
}

export async function markPublished(
  id: string,
  result: { externalId: string; externalUrl: string | null },
  db: Db = getDb(),
): Promise<PromotionSubmission> {
  const [row] = await db
    .update(promotionSubmissions)
    .set({ status: "published", externalId: result.externalId, externalUrl: result.externalUrl, lastError: null, updatedAt: new Date() })
    .where(eq(promotionSubmissions.id, id))
    .returning();
  return row!;
}

export async function markFailed(id: string, message: string, db: Db = getDb()): Promise<PromotionSubmission> {
  const [row] = await db
    .update(promotionSubmissions)
    .set({ status: "failed", lastError: message.slice(0, 2000), updatedAt: new Date() })
    .where(eq(promotionSubmissions.id, id))
    .returning();
  return row!;
}

/** Reject an unclaimed pending or a failed submission. */
export async function markRejected(
  id: string,
  reviewerId: string,
  reason: string,
  db: Db = getDb(),
): Promise<PromotionSubmission | null> {
  const [row] = await db
    .update(promotionSubmissions)
    .set({ status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date(), rejectReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(promotionSubmissions.id, id),
        sql`((${promotionSubmissions.status} = 'pending' AND ${promotionSubmissions.reviewedAt} IS NULL)
             OR ${promotionSubmissions.status} = 'failed')`,
      ),
    )
    .returning();
  return row ?? null;
}

/** Bounded set of recent published promotions for the reach summary. */
export const REACH_SUMMARY_LIMIT = 500;

export async function listRecentPublished(db: Db = getDb()): Promise<PromotionSubmission[]> {
  return db
    .select()
    .from(promotionSubmissions)
    .where(eq(promotionSubmissions.status, "published"))
    .orderBy(desc(promotionSubmissions.createdAt))
    .limit(REACH_SUMMARY_LIMIT);
}
