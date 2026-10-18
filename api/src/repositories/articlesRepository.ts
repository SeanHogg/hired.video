/**
 * ArticlesRepository — the author-owned side of the `articles` aggregate:
 * create, list mine, read / patch / delete, and the owner review-lifecycle
 * transitions (withdraw, unpublish). Every owner read/write is scoped by
 * `user_id` in the WHERE clause. The SA moderation queue lives in
 * adminArticlesRepository.ts; reader engagement in articleEngagementRepository.ts.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { articles, users, userProfiles } = schema;

export { ARTICLE_KINDS, type ArticleKind } from "../db/schema/articles.js";

export type ArticleRow = typeof articles.$inferSelect;
export type ArticleInsert = typeof articles.$inferInsert;
export type ArticlePatch = Partial<ArticleInsert>;

/** True when `userId` already has an article at `slug` (slugs are per-author). */
export async function articleSlugTaken(db: Db, userId: string, slug: string): Promise<boolean> {
  const [row] = await db.select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.userId, userId), eq(articles.slug, slug)))
    .limit(1);
  return !!row;
}

export async function insertArticle(db: Db, values: ArticleInsert): Promise<ArticleRow> {
  const [created] = await db.insert(articles).values(values).returning();
  return created;
}

/** Every article the author owns, most recently edited first. */
export async function listArticlesOwnedBy(db: Db, userId: string): Promise<ArticleRow[]> {
  return db.select().from(articles)
    .where(eq(articles.userId, userId))
    .orderBy(desc(articles.updatedAt));
}

export async function findOwnedArticle(db: Db, userId: string, id: string): Promise<ArticleRow | null> {
  const [row] = await db.select().from(articles)
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Patch an article by id (caller has already verified ownership). */
export async function updateArticleById(db: Db, id: string, patch: ArticlePatch): Promise<ArticleRow> {
  const [updated] = await db.update(articles).set(patch).where(eq(articles.id, id)).returning();
  return updated;
}

/** submitted → draft for the owner; null when not found / not in review. */
export async function withdrawOwnedSubmission(db: Db, userId: string, id: string, now: Date): Promise<ArticleRow | null> {
  const [updated] = await db.update(articles)
    .set({ status: "draft", submittedForReviewAt: null, updatedAt: now })
    .where(and(eq(articles.id, id), eq(articles.userId, userId), eq(articles.status, "submitted")))
    .returning();
  return updated ?? null;
}

/** Back to draft + clear publishedAt for the owner; null when not found. */
export async function unpublishOwnedArticle(db: Db, userId: string, id: string, now: Date): Promise<ArticleRow | null> {
  const [updated] = await db.update(articles)
    .set({ status: "draft", publishedAt: null, updatedAt: now })
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .returning();
  return updated ?? null;
}

/** Delete the owner's article; returns the deleted id or null. */
export async function deleteOwnedArticle(db: Db, userId: string, id: string): Promise<string | null> {
  const [deleted] = await db.delete(articles)
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .returning({ id: articles.id });
  return deleted?.id ?? null;
}

/** The fields a version snapshot needs (owner + content); null when not found. */
export async function findArticleContent(db: Db, id: string): Promise<{
  userId: string;
  title: string;
  bodyMd: string | null;
  bodyJson: unknown;
} | null> {
  const [row] = await db.select({
    userId: articles.userId,
    title: articles.title,
    bodyMd: articles.bodyMd,
    bodyJson: articles.bodyJson,
  }).from(articles).where(eq(articles.id, id)).limit(1);
  return row ?? null;
}

/** The owner id of an article; null when not found. */
export async function findArticleOwnerId(db: Db, id: string): Promise<string | null> {
  const [row] = await db.select({ userId: articles.userId })
    .from(articles).where(eq(articles.id, id)).limit(1);
  return row?.userId ?? null;
}

// ---------------------------------------------------------------------------
// Public reads: published articles by verified authors.
// ---------------------------------------------------------------------------

export interface PublicArticleCardRow {
  article: ArticleRow;
  author: { id: string; name: string | null; isSystem: boolean };
  authorProfile: { avatarUrl: string | null; customUrlSlug: string | null } | null;
}

export interface PublishedArticleFilters {
  userId?: string;
  kind?: string;
  sector?: string;
  audience?: string;
  limit: number;
}

/** Published articles by verified authors, newest first. */
export async function listPublishedArticleCards(db: Db, f: PublishedArticleFilters): Promise<PublicArticleCardRow[]> {
  return db
    .select({
      article: articles,
      author: { id: users.id, name: users.name, isSystem: users.isSystem },
      authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
    })
    .from(articles)
    .innerJoin(users, eq(articles.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      f.userId ? eq(articles.userId, f.userId) : undefined,
      eq(articles.status, "published"),
      eq(users.emailVerified, true),
      f.kind ? eq(articles.kind, f.kind) : undefined,
      f.sector ? eq(articles.sector, f.sector) : undefined,
      f.audience ? eq(articles.audience, f.audience) : undefined,
    ))
    .orderBy(desc(articles.publishedAt))
    .limit(f.limit);
}

/** One published article by author + slug (verified author); null when absent. */
export async function findPublishedArticleBySlug(db: Db, authorUserId: string, slug: string): Promise<{
  article: ArticleRow;
  author: { id: string; name: string | null };
  authorProfile: { avatarUrl: string | null; customUrlSlug: string | null } | null;
} | null> {
  const [row] = await db
    .select({
      article: articles,
      author: { id: users.id, name: users.name },
      authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
    })
    .from(articles)
    .innerJoin(users, eq(articles.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      eq(articles.userId, authorUserId),
      eq(articles.slug, slug),
      eq(articles.status, "published"),
      eq(users.emailVerified, true),
    ))
    .limit(1);
  return row ?? null;
}
