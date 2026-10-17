/**
 * FeedEngagementRepository — engagement on social-feed posts: post reactions
 * (`reactions`, subject 'feed_post'), comments (`comments`, subject
 * 'feed_post'), comment reactions (`reactions`, subject 'comment'), plus the
 * author name/avatar lookups the feed DTOs batch-load. Post rows themselves
 * live in feedPostsRepository.
 *
 * Comment rows are projected back to the feed's shape (feedPostId / userId /
 * content) so the feed DTOs and API responses are unchanged by the W3-A merge.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { FeedDb } from "./feedPostsRepository.js";
import {
  commentsOn,
  commentsOnAny,
  reactionBy,
  reactionsOnAny,
} from "./engagementSubjectFilters.js";

const { comments, reactions, users, userProfiles } = schema;

export interface FeedCommentRecord {
  id: string;
  feedPostId: string;
  userId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

/** `comments` row → feed comment shape. author_user_id is always set for
 *  feed comments (the column is nullable only for other surfaces). */
const feedCommentColumns = {
  id: comments.id,
  feedPostId: comments.subjectId,
  userId: sql<string>`${comments.authorUserId}`,
  content: comments.body,
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
};

const isFeedComment = eq(comments.subjectType, "feed_post");

// ─── Authors ─────────────────────────────────────────────────────────────────

export async function findAuthorNames(db: FeedDb, ids: string[]): Promise<Array<{ id: string; name: string }>> {
  return db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
}

export async function findAuthorAvatars(
  db: FeedDb,
  ids: string[],
): Promise<Array<{ userId: string; avatarUrl: string | null }>> {
  return db
    .select({ userId: userProfiles.userId, avatarUrl: userProfiles.avatarUrl })
    .from(userProfiles)
    .where(inArray(userProfiles.userId, ids));
}

/** Mentions match by lowercased full `name` — the @-syntax doesn't carry
 *  ids, so a name lookup is the only way to resolve who's being talked to. */
export async function findUserIdsByLowerName(db: FeedDb, lowerNames: string[]): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(sql`lower(${users.name})`, lowerNames));
  return rows.map((u) => u.id);
}

// ─── Post reactions ──────────────────────────────────────────────────────────

export async function findReactionsForPosts(
  db: FeedDb,
  postIds: string[],
): Promise<Array<{ id: string; feedPostId: string; userId: string; reactionType: string }>> {
  return db
    .select({
      id: reactions.id,
      feedPostId: reactions.subjectId,
      userId: reactions.userId,
      reactionType: reactions.reactionType,
    })
    .from(reactions)
    .where(reactionsOnAny("feed_post", postIds));
}

export async function hasPostReaction(db: FeedDb, postId: string, userId: string): Promise<boolean> {
  const [prior] = await db
    .select({ id: reactions.id })
    .from(reactions)
    .where(reactionBy("feed_post", postId, userId))
    .limit(1);
  return Boolean(prior);
}

/** Insert or switch the viewer's reaction (unique per subject+user). */
async function upsertReaction(
  db: FeedDb,
  subjectType: "feed_post" | "comment",
  subjectId: string,
  userId: string,
  reactionType: string,
): Promise<{ id: string }> {
  const [reaction] = await db
    .insert(reactions)
    .values({ subjectType, subjectId, userId, reactionType, count: 1 })
    .onConflictDoUpdate({
      target: [reactions.subjectType, reactions.subjectId, reactions.userId],
      set: { reactionType, updatedAt: new Date() },
    })
    .returning({ id: reactions.id });
  return reaction;
}

export async function upsertPostReaction(
  db: FeedDb,
  postId: string,
  userId: string,
  reactionType: string,
): Promise<{ id: string }> {
  return upsertReaction(db, "feed_post", postId, userId, reactionType);
}

export async function deletePostReaction(db: FeedDb, postId: string, userId: string): Promise<void> {
  await db.delete(reactions).where(reactionBy("feed_post", postId, userId));
}

// ─── Comments ────────────────────────────────────────────────────────────────

/** A post's comments, newest first (capped at 500). */
export async function listCommentsForPost(
  db: FeedDb,
  postId: string,
  limit = 200,
): Promise<FeedCommentRecord[]> {
  return db
    .select(feedCommentColumns)
    .from(comments)
    .where(commentsOn("feed_post", postId))
    .orderBy(desc(comments.createdAt))
    .limit(Math.min(500, Math.max(1, limit)));
}

export async function countCommentsForPosts(
  db: FeedDb,
  postIds: string[],
): Promise<Array<{ feedPostId: string; count: number }>> {
  return db
    .select({ feedPostId: comments.subjectId, count: sql<number>`count(*)::int` })
    .from(comments)
    .where(commentsOnAny("feed_post", postIds))
    .groupBy(comments.subjectId);
}

export async function insertComment(
  db: FeedDb,
  values: { feedPostId: string; userId: string; content: string },
): Promise<FeedCommentRecord> {
  const [comment] = await db
    .insert(comments)
    .values({
      subjectType: "feed_post",
      subjectId: values.feedPostId,
      authorUserId: values.userId,
      body: values.content,
    })
    .returning(feedCommentColumns);
  return comment;
}

export async function findCommentById(db: FeedDb, commentId: string): Promise<FeedCommentRecord | undefined> {
  const [row] = await db
    .select(feedCommentColumns)
    .from(comments)
    .where(and(eq(comments.id, commentId), isFeedComment))
    .limit(1);
  return row;
}

export async function updateCommentContent(
  db: FeedDb,
  commentId: string,
  content: string,
): Promise<FeedCommentRecord> {
  const [updated] = await db
    .update(comments)
    .set({ body: content, updatedAt: new Date() })
    .where(and(eq(comments.id, commentId), isFeedComment))
    .returning(feedCommentColumns);
  return updated;
}

/** Deleting the row also removes its reactions (reactions_subject_deleted trigger). */
export async function deleteComment(db: FeedDb, commentId: string): Promise<void> {
  await db.delete(comments).where(and(eq(comments.id, commentId), isFeedComment));
}

// ─── Comment reactions ───────────────────────────────────────────────────────

export async function findReactionsForComments(
  db: FeedDb,
  commentIds: string[],
): Promise<Array<{ commentId: string; userId: string; reactionType: string }>> {
  return db
    .select({
      commentId: reactions.subjectId,
      userId: reactions.userId,
      reactionType: reactions.reactionType,
    })
    .from(reactions)
    .where(reactionsOnAny("comment", commentIds));
}

export async function hasCommentReaction(db: FeedDb, commentId: string, userId: string): Promise<boolean> {
  const [prior] = await db
    .select({ id: reactions.id })
    .from(reactions)
    .where(reactionBy("comment", commentId, userId))
    .limit(1);
  return Boolean(prior);
}

export async function upsertCommentReaction(
  db: FeedDb,
  commentId: string,
  userId: string,
  reactionType: string,
): Promise<{ id: string }> {
  return upsertReaction(db, "comment", commentId, userId, reactionType);
}

export async function deleteCommentReaction(db: FeedDb, commentId: string, userId: string): Promise<void> {
  await db.delete(reactions).where(reactionBy("comment", commentId, userId));
}
