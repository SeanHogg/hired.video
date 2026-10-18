/**
 * FeedPostsRepository — the social-feed post aggregate (`feed_posts`) and
 * the anonymous trending read models. (Post abuse reports are content_reports
 * rows filed through services/moderation.) Every Drizzle call against these tables from the feed routes
 * lives here; engagement (reactions, comments) is in feedEngagementRepository.
 */

import { desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { syncFeedPostHashtags } from "./feedPostTagsRepository.js";

const { feedPosts, feedPostTags } = schema;

export type FeedDb = ReturnType<typeof getDb>;
export type FeedPostRecord = typeof feedPosts.$inferSelect;
export type FeedPostValues = typeof feedPosts.$inferInsert;

/**
 * SQL predicate enforcing feed visibility rules (see services/feed/feedPostPolicy.ts).
 *
 * Always excludes community posts (any tag starting with "company:") — those belong to
 * the pro Employee Community surface, not the public feed.
 */
export function feedVisibilityCondition(currentUserId: string, isRecruiter: boolean): SQL {
  const privacyClause = isRecruiter
    ? sql`(${feedPosts.privacy} IN ('Public', 'Recruiter') OR ${feedPosts.userId} = ${currentUserId})`
    : sql`(${feedPosts.privacy} = 'Public' OR ${feedPosts.userId} = ${currentUserId})`;
  // Community posts store tags as raw string elements like "company:uuid:channel".
  // Regular feed posts store tags as objects ({"tagType":..., "tagValue":...}), so the
  // quoted "company: prefix reliably distinguishes them in the jsonb text form.
  const excludeCommunity = sql`NOT (${feedPosts.tags}::text LIKE '%"company:%')`;
  return sql`${privacyClause} AND ${excludeCommunity}`;
}

export interface FeedViewer {
  userId: string;
  isRecruiter: boolean;
}

/** One page of visible posts (newest first) + the total, optionally
 *  filtered to a lowercased hashtag. */
export async function listVisiblePosts(
  db: FeedDb,
  viewer: FeedViewer,
  opts: { tag: string; limit: number; offset: number },
): Promise<{ total: number; rows: FeedPostRecord[] }> {
  const visibility = feedVisibilityCondition(viewer.userId, viewer.isRecruiter);
  const tagFilter = opts.tag
    ? sql`EXISTS (SELECT 1 FROM ${feedPostTags} WHERE ${feedPostTags.postId} = ${feedPosts.id} AND ${feedPostTags.tag} = ${opts.tag.toLowerCase()})`
    : null;
  const whereClause = tagFilter ? sql`${visibility} AND ${tagFilter}` : visibility;

  const [totalRow, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(feedPosts).where(whereClause),
    db.select().from(feedPosts).where(whereClause).orderBy(desc(feedPosts.createdAt)).limit(opts.limit).offset(opts.offset),
  ]);
  return { total: totalRow[0]?.count ?? 0, rows };
}

/** Content search across visible posts (newest first). */
export async function searchVisiblePosts(
  db: FeedDb,
  viewer: FeedViewer,
  opts: { searchTerm: string; limit: number; offset: number },
): Promise<FeedPostRecord[]> {
  const visibility = feedVisibilityCondition(viewer.userId, viewer.isRecruiter);
  return db
    .select()
    .from(feedPosts)
    .where(sql`${ilike(feedPosts.content, `%${opts.searchTerm}%`)} AND ${visibility}`)
    .orderBy(desc(feedPosts.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function findVisiblePost(
  db: FeedDb,
  postId: string,
  viewer: FeedViewer,
): Promise<FeedPostRecord | undefined> {
  const visibility = feedVisibilityCondition(viewer.userId, viewer.isRecruiter);
  const [post] = await db
    .select()
    .from(feedPosts)
    .where(sql`${eq(feedPosts.id, postId)} AND ${visibility}`)
    .limit(1);
  return post;
}

export async function findPostById(db: FeedDb, postId: string): Promise<FeedPostRecord | undefined> {
  const [post] = await db.select().from(feedPosts).where(eq(feedPosts.id, postId)).limit(1);
  return post;
}

/** Lightweight id + author lookup (ownership checks, notifications). */
export async function findPostOwner(
  db: FeedDb,
  postId: string,
): Promise<{ id: string; userId: string } | undefined> {
  const [row] = await db
    .select({ id: feedPosts.id, userId: feedPosts.userId })
    .from(feedPosts)
    .where(eq(feedPosts.id, postId))
    .limit(1);
  return row;
}

export async function findPostsByIds(db: FeedDb, ids: string[]): Promise<FeedPostRecord[]> {
  if (ids.length === 0) return [];
  return db.select().from(feedPosts).where(inArray(feedPosts.id, ids));
}

export async function insertPost(db: FeedDb, values: FeedPostValues): Promise<FeedPostRecord> {
  const [post] = await db.insert(feedPosts).values(values).returning();
  if (values.tags !== undefined) await syncFeedPostHashtags(db, post, post.tags);
  return post;
}

export async function updatePost(
  db: FeedDb,
  postId: string,
  patch: Partial<FeedPostValues>,
): Promise<FeedPostRecord> {
  const [updated] = await db.update(feedPosts).set(patch).where(eq(feedPosts.id, postId)).returning();
  if (updated && patch.tags !== undefined) await syncFeedPostHashtags(db, updated, updated.tags);
  return updated;
}

export async function deletePost(db: FeedDb, postId: string): Promise<void> {
  await db.delete(feedPosts).where(eq(feedPosts.id, postId));
}

/**
 * Employee Community channel posts (Pro): `Private` posts carrying the raw
 * string tag `company:<companyId>:<channel>`, newest first. The tag match is
 * a jsonb containment in SQL so other companies' private posts can't crowd
 * a channel out of the page.
 */
export async function listCommunityChannelPosts(
  db: FeedDb,
  channelTag: string,
  limit: number,
): Promise<FeedPostRecord[]> {
  return db
    .select()
    .from(feedPosts)
    .where(sql`${feedPosts.privacy} = 'Private' AND ${feedPosts.tags} @> ${JSON.stringify([channelTag])}::jsonb`)
    .orderBy(desc(feedPosts.createdAt))
    .limit(limit);
}

/** Reshare counts keyed by original post id. */
export async function countRepostsByOriginal(
  db: FeedDb,
  postIds: string[],
): Promise<Array<{ repostOfId: string | null; count: number }>> {
  return db
    .select({ repostOfId: feedPosts.repostOfId, count: sql<number>`count(*)::int` })
    .from(feedPosts)
    .where(inArray(feedPosts.repostOfId, postIds))
    .groupBy(feedPosts.repostOfId);
}

// ─── Trending read models (anonymous-visible: Public, non-community only) ────

export interface TrendingTagRow {
  tag: string;
  post_count: number;
}

/** Top hashtags by the number of posts carrying them over the last 30 days
 *  (feed_post_tags, migration 0616). */
export async function selectTrendingTags(db: FeedDb, limit: number): Promise<TrendingTagRow[]> {
  const rows = await db.execute(sql`
    SELECT
      t.tag           AS tag,
      count(*)::int   AS post_count
    FROM feed_post_tags t
    JOIN feed_posts p ON p.id = t.post_id
    WHERE t.created_at > now() - interval '30 days'
      AND p.privacy = 'Public'
      AND NOT (p.tags::text LIKE '%"company:%')
    GROUP BY t.tag
    ORDER BY post_count DESC
    LIMIT ${limit}
  `);
  return rows.rows as unknown as TrendingTagRow[];
}

/** Public root posts ranked by weighted engagement over the last 21 days.
 *  `reactionWeightCase` is a code-constant `WHEN 'x' THEN n …` fragment
 *  (no user input), so it is interpolated raw. */
export async function selectTrendingPosts(
  db: FeedDb,
  limit: number,
  reactionWeightCase: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await db.execute(sql`
    WITH reaction_stats AS (
      SELECT subject_id AS feed_post_id,
             COUNT(*)::int AS reaction_count,
             COALESCE(SUM(CASE reaction_type ${sql.raw(reactionWeightCase)} ELSE 1 END), 0) AS reaction_score
      FROM reactions
      WHERE subject_type = 'feed_post'
      GROUP BY subject_id
    ),
    comment_stats AS (
      SELECT subject_id AS feed_post_id, COUNT(*)::int AS comment_count
      FROM comments
      WHERE subject_type = 'feed_post'
      GROUP BY subject_id
    ),
    repost_stats AS (
      SELECT repost_of_id, COUNT(*)::int AS repost_count
      FROM feed_posts
      WHERE repost_of_id IS NOT NULL
      GROUP BY repost_of_id
    )
    SELECT
      p.id,
      p.user_id        AS "userId",
      u.name           AS "userName",
      up.avatar_url    AS "userAvatar",
      left(p.content, 140) AS "excerpt",
      p.kind,
      p.created_at     AS "createdAt",
      COALESCE(rs.reaction_count, 0) AS "reactionCount",
      COALESCE(cs.comment_count, 0)  AS "commentCount",
      COALESCE(ps.repost_count, 0)   AS "repostCount",
      (COALESCE(rs.reaction_score, 0)
        + 2 * COALESCE(ps.repost_count, 0)
        + 1.5 * COALESCE(cs.comment_count, 0)) AS "score"
    FROM feed_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    LEFT JOIN reaction_stats rs ON rs.feed_post_id = p.id
    LEFT JOIN comment_stats  cs ON cs.feed_post_id = p.id
    LEFT JOIN repost_stats   ps ON ps.repost_of_id = p.id
    WHERE p.privacy = 'Public'
      AND p.repost_of_id IS NULL
      AND p.created_at > now() - interval '21 days'
      AND NOT (p.tags::text LIKE '%"company:%')
    ORDER BY "score" DESC, p.created_at DESC
    LIMIT ${limit}
  `);
  return rows.rows as Array<Record<string, unknown>>;
}

/** Users with the most feed posts (creator leaderboard), most first. */
export function selectTopPosters(db: FeedDb, limit: number): Promise<Array<{ userId: string; postCount: number }>> {
  return db
    .select({ userId: feedPosts.userId, postCount: sql<number>`count(*)::int` })
    .from(feedPosts)
    .groupBy(feedPosts.userId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}
