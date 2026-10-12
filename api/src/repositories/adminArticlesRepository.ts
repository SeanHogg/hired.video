/**
 * AdminArticlesRepository — data access for the SuperAdmin article review
 * queue (`routes/admin-articles.ts`). Bulk-shaped on purpose: every
 * approve/reject/scan touches up to 100 articles and neon-http makes each
 * statement a full HTTP round-trip, so per-article statements are batched
 * into one `inArray` read / multi-row insert / VALUES-joined update.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { articles, users, userProfiles, adminAuditLog, feedPosts } = schema;

export type DbLike = any;
export type ArticleRow = typeof articles.$inferSelect;
export type FeedPostInsert = typeof feedPosts.$inferInsert;
export type AdminAuditInsert = typeof adminAuditLog.$inferInsert;

export interface ArticleModerationUpdate {
  id: string;
  score: number;
  findings: ArticleRow["moderationFindings"];
}

export interface ArticleAuthorCard {
  name: string | null;
  slug: string | null;
  avatarUrl: string | null;
}

export interface IAdminArticlesRepository {
  listQueue(status: string, kind: string | undefined, limit: number): Promise<Array<{
    article: ArticleRow;
    author: { id: string; name: string | null; email: string };
    authorProfile: { avatarUrl: string | null; customUrlSlug: string | null } | null;
  }>>;
  findByIds(ids: string[]): Promise<ArticleRow[]>;
  /** One UPDATE … FROM (VALUES …) for every scanned article. */
  bulkSetModeration(updates: ArticleModerationUpdate[], scannedBy: string, at: Date): Promise<void>;
  publishSubmitted(ids: string[], actorId: string, at: Date): Promise<ArticleRow[]>;
  rejectSubmitted(ids: string[], actorId: string, reason: string, at: Date): Promise<ArticleRow[]>;
  /** Author name + profile slug/avatar for many users in one query. */
  findAuthorCards(userIds: string[]): Promise<Map<string, ArticleAuthorCard>>;
  /** Multi-row insert; on failure retries per row so one bad row can't
   *  drop the rest (preserves the old per-article isolation). */
  insertFeedPosts(rows: FeedPostInsert[]): Promise<void>;
  insertAudit(row: AdminAuditInsert): Promise<void>;
}

export class AdminArticlesRepository implements IAdminArticlesRepository {
  constructor(private readonly db: DbLike) {}

  async listQueue(status: string, kind: string | undefined, limit: number) {
    return this.db
      .select({
        article: articles,
        author: { id: users.id, name: users.name, email: users.email },
        authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
      })
      .from(articles)
      .innerJoin(users, eq(articles.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(articles.status, status), kind ? eq(articles.kind, kind) : undefined))
      .orderBy(desc(articles.submittedForReviewAt))
      .limit(limit);
  }

  async findByIds(ids: string[]): Promise<ArticleRow[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(articles).where(inArray(articles.id, ids));
  }

  async bulkSetModeration(updates: ArticleModerationUpdate[], scannedBy: string, at: Date): Promise<void> {
    if (updates.length === 0) return;
    const values = sql.join(
      updates.map((u) => sql`(${u.id}::uuid, ${u.score}::real, ${u.findings == null ? null : JSON.stringify(u.findings)}::jsonb)`),
      sql`, `,
    );
    await this.db.execute(sql`
      UPDATE ${articles} AS a
      SET moderation_score = v.score,
          moderation_findings = v.findings,
          moderation_scanned_at = ${at},
          moderation_scanned_by = ${scannedBy}::uuid,
          updated_at = ${at}
      FROM (VALUES ${values}) AS v(id, score, findings)
      WHERE a.id = v.id
    `);
  }

  async publishSubmitted(ids: string[], actorId: string, at: Date): Promise<ArticleRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .update(articles)
      .set({
        status: "published",
        publishedAt: at,
        approvedBy: actorId,
        approvedAt: at,
        rejectionReason: null,
        rejectedAt: null,
        rejectedBy: null,
        updatedAt: at,
      })
      .where(and(inArray(articles.id, ids), eq(articles.status, "submitted")))
      .returning();
  }

  async rejectSubmitted(ids: string[], actorId: string, reason: string, at: Date): Promise<ArticleRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .update(articles)
      .set({ status: "rejected", rejectedBy: actorId, rejectedAt: at, rejectionReason: reason, updatedAt: at })
      .where(and(inArray(articles.id, ids), eq(articles.status, "submitted")))
      .returning();
  }

  async findAuthorCards(userIds: string[]): Promise<Map<string, ArticleAuthorCard>> {
    const out = new Map<string, ArticleAuthorCard>();
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return out;
    const rows: Array<{ id: string; name: string | null; slug: string | null; avatarUrl: string | null }> = await this.db
      .select({ id: users.id, name: users.name, slug: userProfiles.customUrlSlug, avatarUrl: userProfiles.avatarUrl })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(inArray(users.id, unique));
    for (const r of rows) {
      // First profile row wins (mirrors the old `.limit(1)` per-user read).
      if (!out.has(r.id)) out.set(r.id, { name: r.name, slug: r.slug, avatarUrl: r.avatarUrl });
    }
    return out;
  }

  async insertFeedPosts(rows: FeedPostInsert[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.db.insert(feedPosts).values(rows);
    } catch {
      for (const row of rows) {
        await this.db.insert(feedPosts).values(row).catch(() => undefined);
      }
    }
  }

  async insertAudit(row: AdminAuditInsert): Promise<void> {
    await this.db.insert(adminAuditLog).values(row).catch(() => undefined);
  }
}
