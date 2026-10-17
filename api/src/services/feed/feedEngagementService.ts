/**
 * Feed engagement use cases — professional reactions on posts and comments
 * (like / celebrate / support / insightful / curious / funny) and the
 * comment thread CRUD. Return plain data; throw DomainError on rule
 * violations.
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { normalizeReaction } from "../../../../shared/feed-reactions.js";
import {
  deleteComment,
  deleteCommentReaction,
  deletePostReaction,
  findCommentById,
  hasCommentReaction,
  hasPostReaction,
  insertComment,
  listCommentsForPost,
  updateCommentContent,
  upsertCommentReaction,
  upsertPostReaction,
} from "../../repositories/feedEngagementRepository.js";
import { buildCommentDtos } from "./feedDtos.js";
import { notifyCommentReaction, notifyPostReaction } from "./feedNotifications.js";
import type { WaitUntil } from "./feedPostsService.js";

type Body = Record<string, unknown>;

const commentNotFound = () => new DomainError(404, "NOT_FOUND", "Comment not found");
const notYourComment = () => new DomainError(403, "FORBIDDEN", "Not your comment");

// ─── Post reactions ──────────────────────────────────────────────────────────

/** Add or change the viewer's reaction. Idempotent per (post, user): a second
 *  react switches the reaction_type. Only a NEW reaction notifies the author. */
export async function reactToPost(userId: string, postId: string, body: Body, waitUntil: WaitUntil) {
  const reactionType = normalizeReaction(body.reactionType);
  const db = getDb();

  const hadReaction = await hasPostReaction(db, postId, userId);
  const reaction = await upsertPostReaction(db, postId, userId, reactionType);

  if (!hadReaction) {
    waitUntil(notifyPostReaction(postId, userId, reactionType, db));
  }

  return { id: reaction.id, feedPostId: postId, userId, reactionType };
}

export async function removePostReaction(userId: string, postId: string): Promise<true> {
  await deletePostReaction(getDb(), postId, userId);
  return true;
}

// ─── Comments ────────────────────────────────────────────────────────────────

/** A post's comment thread (newest first). Same default/bounds the
 *  repository applies (200, 1..500). */
export async function listPostComments(viewerId: string, postId: string, limit: number) {
  const db = getDb();
  const rows = await listCommentsForPost(db, postId, limit);
  return buildCommentDtos(rows, viewerId, db);
}

export async function createComment(userId: string, body: Body) {
  const postId = typeof body.feedPostId === "string" ? body.feedPostId : "";
  const content = typeof body.content === "string" ? body.content : "";
  const db = getDb();

  const comment = await insertComment(db, { feedPostId: postId, userId, content });
  const [dto] = await buildCommentDtos([comment], userId, db);
  return dto;
}

export async function updateComment(userId: string, commentId: string, body: Body) {
  const db = getDb();
  const existing = await findCommentById(db, commentId);
  if (!existing) throw commentNotFound();
  if (existing.userId !== userId) throw notYourComment();

  const updated = await updateCommentContent(
    db,
    commentId,
    typeof body.content === "string" ? body.content : existing.content,
  );
  const [dto] = await buildCommentDtos([updated], userId, db);
  return dto;
}

export async function removeComment(userId: string, commentId: string): Promise<true> {
  const db = getDb();
  const existing = await findCommentById(db, commentId);
  if (!existing) throw commentNotFound();
  if (existing.userId !== userId) throw notYourComment();
  await deleteComment(db, commentId);
  return true;
}

// ─── Comment reactions ───────────────────────────────────────────────────────

/** Add/change a reaction to a comment (same professional set as posts).
 *  Idempotent per (comment, user). Only a NEW reaction notifies the author. */
export async function reactToComment(userId: string, commentId: string, body: Body, waitUntil: WaitUntil) {
  const reactionType = normalizeReaction(body.reactionType);
  const db = getDb();

  const hadReaction = await hasCommentReaction(db, commentId, userId);
  const reaction = await upsertCommentReaction(db, commentId, userId, reactionType);

  if (!hadReaction) {
    waitUntil(notifyCommentReaction(commentId, userId, reactionType, db));
  }

  return { id: reaction.id, commentId, userId, reactionType };
}

export async function removeCommentReaction(userId: string, commentId: string): Promise<true> {
  await deleteCommentReaction(getDb(), commentId, userId);
  return true;
}
