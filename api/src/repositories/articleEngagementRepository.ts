/**
 * ArticleEngagementRepository — reader-side engagement data for an article:
 * the denormalised `articles.view_count`, the per-day `article_engagement`
 * rollup (read seconds / claps / shares) and the `article_shares` log.
 * Every rollup bump is ONE upsert statement keyed on (article_id, day).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { articles, articleEngagement, articleShares } = schema;

export type ArticleRow = typeof articles.$inferSelect;
export type ArticleEngagementRow = typeof articleEngagement.$inferSelect;

export interface IArticleEngagementRepository {
  findStatus(articleId: string): Promise<{ status: string | null } | null>;
  findOwnerId(articleId: string): Promise<{ userId: string } | null>;
  findById(articleId: string): Promise<ArticleRow | null>;
  /** `view_count + 1` on a PUBLISHED article — one statement; false when the
   *  article is missing or not published. */
  incrementPublishedViewCount(articleId: string): Promise<boolean>;
  addReadSeconds(articleId: string, day: string, seconds: number, verified: boolean): Promise<void>;
  addClaps(articleId: string, day: string, delta: number): Promise<void>;
  insertShare(row: { articleId: string; userId: string | null | undefined; channel: string; userAgent: string | null }): Promise<void>;
  addShare(articleId: string, day: string): Promise<void>;
  listRollups(articleId: string, limit: number): Promise<ArticleEngagementRow[]>;
  updateArticle(articleId: string, patch: Record<string, unknown>): Promise<ArticleRow | undefined>;
}

/** `UPDATE articles SET view_count = view_count + 1 WHERE id = $1 AND
 *  status = 'published' RETURNING id` (exported so tests can pin the SQL). */
export function buildPublishedViewBump(db: Db, articleId: string) {
  return db.update(articles)
    .set({ viewCount: sql`${articles.viewCount} + 1` })
    .where(and(eq(articles.id, articleId), eq(articles.status, "published")))
    .returning({ id: articles.id });
}

export class ArticleEngagementRepository implements IArticleEngagementRepository {
  constructor(private readonly db: Db) {}

  async findStatus(articleId: string) {
    const [row] = await this.db.select({ status: articles.status })
      .from(articles).where(eq(articles.id, articleId)).limit(1);
    return row ?? null;
  }

  async findOwnerId(articleId: string) {
    const [row] = await this.db.select({ userId: articles.userId })
      .from(articles).where(eq(articles.id, articleId)).limit(1);
    return row ?? null;
  }

  async findById(articleId: string): Promise<ArticleRow | null> {
    const [row] = await this.db.select().from(articles).where(eq(articles.id, articleId)).limit(1);
    return row ?? null;
  }

  async incrementPublishedViewCount(articleId: string): Promise<boolean> {
    const rows = await buildPublishedViewBump(this.db, articleId);
    return rows.length > 0;
  }

  /** Verified readers accrue `read_seconds` (partner-pool paid); everyone
   *  else accrues `anonymous_read_seconds` (#1757). */
  async addReadSeconds(articleId: string, day: string, seconds: number, verified: boolean): Promise<void> {
    await this.db.insert(articleEngagement).values({
      articleId,
      day,
      readSeconds: verified ? seconds : 0,
      anonymousReadSeconds: verified ? 0 : seconds,
      uniqueReaders: 0,
    }).onConflictDoUpdate({
      target: [articleEngagement.articleId, articleEngagement.day],
      set: {
        readSeconds: verified
          ? sql`${articleEngagement.readSeconds} + ${seconds}`
          : articleEngagement.readSeconds,
        anonymousReadSeconds: verified
          ? articleEngagement.anonymousReadSeconds
          : sql`${articleEngagement.anonymousReadSeconds} + ${seconds}`,
        updatedAt: new Date(),
      },
    });
  }

  async addClaps(articleId: string, day: string, delta: number): Promise<void> {
    await this.db.insert(articleEngagement).values({
      articleId, day, clapCount: delta,
    }).onConflictDoUpdate({
      target: [articleEngagement.articleId, articleEngagement.day],
      set: {
        clapCount: sql`${articleEngagement.clapCount} + ${delta}`,
        updatedAt: new Date(),
      },
    });
  }

  async insertShare(row: { articleId: string; userId: string | null | undefined; channel: string; userAgent: string | null }): Promise<void> {
    await this.db.insert(articleShares).values({
      articleId: row.articleId,
      userId: row.userId,
      channel: row.channel,
      userAgent: row.userAgent,
    });
  }

  async addShare(articleId: string, day: string): Promise<void> {
    await this.db.insert(articleEngagement).values({
      articleId, day, shareCount: 1,
    }).onConflictDoUpdate({
      target: [articleEngagement.articleId, articleEngagement.day],
      set: {
        shareCount: sql`${articleEngagement.shareCount} + 1`,
        updatedAt: new Date(),
      },
    });
  }

  async listRollups(articleId: string, limit: number): Promise<ArticleEngagementRow[]> {
    return this.db.select().from(articleEngagement)
      .where(eq(articleEngagement.articleId, articleId))
      .orderBy(desc(articleEngagement.day))
      .limit(limit);
  }

  async updateArticle(articleId: string, patch: Record<string, unknown>): Promise<ArticleRow | undefined> {
    const [row] = await this.db.update(articles)
      .set(patch as any)
      .where(eq(articles.id, articleId))
      .returning();
    return row;
  }
}
