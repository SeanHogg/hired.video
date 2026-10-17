/**
 * Feed DTO builders — shape `feed_posts` / feed `comments` rows into
 * the wire DTOs the feed UI renders, batch-loading authors, avatars,
 * reaction rollups, comment and reshare counts in one round-trip each
 * (no N+1).
 */

import { normalizeReaction, summarizeReactions, type ReactionCount } from "../../../../shared/feed-reactions.js";
import {
  countRepostsByOriginal,
  findPostsByIds,
  type FeedDb,
  type FeedPostRecord,
} from "../../repositories/feedPostsRepository.js";
import {
  countCommentsForPosts,
  findAuthorAvatars,
  findAuthorNames,
  findReactionsForComments,
  findReactionsForPosts,
  type FeedCommentRecord,
} from "../../repositories/feedEngagementRepository.js";
import type { FeedKind, FeedPrivacy } from "./feedPostPolicy.js";

interface PostDtoSupport {
  authorName: string;
  authorAvatar: string | null;
  likes: Array<{ id: string; userId: string; reactionType: string }>;
  // Professional reaction rollup (count-per-type, display-sorted) + the
  // current viewer's own reaction, so the picker can render its selected
  // state without a second round-trip.
  reactions: ReactionCount[];
  currentUserReaction: string | null;
  commentCount: number;
  repostCount: number;
}

function toPostDto(
  post: FeedPostRecord,
  support: PostDtoSupport,
  // Embedded reshare original — typed loosely to avoid a self-referential
  // return-type cycle; it's the same DTO shape with repostOf already null.
  repostOf: Record<string, unknown> | null,
) {
  const { authorName, authorAvatar, likes, reactions, currentUserReaction, commentCount, repostCount } = support;
  return {
    id: post.id,
    userId: post.userId,
    userName: authorName,
    userAvatar: authorAvatar ?? undefined,
    content: post.content,
    kind: (post.kind as FeedKind) ?? "text",
    linkUrl: post.linkUrl ?? undefined,
    linkTitle: post.linkTitle ?? undefined,
    linkDescription: post.linkDescription ?? undefined,
    linkImageUrl: post.linkImageUrl ?? undefined,
    privacy: post.privacy as FeedPrivacy,
    createdAt: new Date(post.createdAt).toISOString(),
    updatedAt: new Date(post.updatedAt).toISOString(),
    media: post.media ?? [],
    tags: post.tags ?? [],
    likes: likes.map((l) => ({ id: l.id, feedPostId: post.id, userId: l.userId, userName: "", reactionType: l.reactionType })),
    comments: [],
    // `likeCount` stays the total reaction count (back-compat); `reactions`
    // is the per-type breakdown and `currentUserReaction` the viewer's pick.
    likeCount: likes.length,
    reactions,
    currentUserReaction,
    commentCount,
    repostCount,
    isLikedByCurrentUser: currentUserReaction != null,
    // Polymorphic surfacing — when set, the renderer mounts the
    // canonical card for `subjectType` (e.g. <ReviewCard>) instead
    // of the default text/link card. `embedPayload` carries the
    // minimal display data so the feed list is one query.
    subjectType: post.subjectType ?? undefined,
    subjectId: post.subjectId ?? undefined,
    embedPayload: post.embedPayload ?? undefined,
    // Reshare. `repostOfId` flags this row as a repost; `repostOf` is the
    // embedded original (one level deep — a repost of a repost still only
    // carries its immediate parent) so the renderer never N+1s.
    repostOfId: post.repostOfId ?? undefined,
    repostOf: repostOf ?? undefined,
  };
}

export type FeedPostDto = ReturnType<typeof toPostDto>;

/** Load the author / avatar / likes / comment-count / reshare-count maps
 *  for a set of post rows in one batched round-trip each (no N+1). Shared
 *  by the main post rows AND the embedded reshare originals. */
async function loadSupport(
  rows: FeedPostRecord[],
  db: FeedDb,
  currentUserId: string,
): Promise<Map<string, PostDtoSupport>> {
  const out = new Map<string, PostDtoSupport>();
  if (rows.length === 0) return out;
  const postIds = rows.map((p) => p.id);
  const authorIds = [...new Set(rows.map((p) => p.userId))];

  const [authorRows, profileRows, likeRows, commentCounts, repostCounts] = await Promise.all([
    findAuthorNames(db, authorIds),
    findAuthorAvatars(db, authorIds),
    findReactionsForPosts(db, postIds),
    countCommentsForPosts(db, postIds),
    countRepostsByOriginal(db, postIds),
  ]);

  const authorMap = new Map(authorRows.map((a) => [a.id, a.name]));
  const avatarMap = new Map(profileRows.map((p) => [p.userId, p.avatarUrl ?? null]));
  const likesByPost = new Map<string, Array<{ id: string; userId: string; reactionType: string }>>();
  for (const like of likeRows) {
    if (!likesByPost.has(like.feedPostId)) likesByPost.set(like.feedPostId, []);
    likesByPost.get(like.feedPostId)!.push({
      id: like.id,
      userId: like.userId,
      reactionType: normalizeReaction(like.reactionType),
    });
  }
  const commentCountMap = new Map(commentCounts.map((c) => [c.feedPostId, c.count]));
  const repostCountMap = new Map(
    repostCounts.filter((r) => r.repostOfId).map((r) => [r.repostOfId as string, Number(r.count) || 0]),
  );

  for (const post of rows) {
    const likes = likesByPost.get(post.id) ?? [];
    out.set(post.id, {
      authorName: authorMap.get(post.userId) ?? "Unknown",
      authorAvatar: avatarMap.get(post.userId) ?? null,
      likes,
      reactions: summarizeReactions(likes),
      currentUserReaction: likes.find((l) => l.userId === currentUserId)?.reactionType ?? null,
      commentCount: commentCountMap.get(post.id) ?? 0,
      repostCount: repostCountMap.get(post.id) ?? 0,
    });
  }
  return out;
}

/** Shape post rows into DTOs, embedding each reshare's original. */
export async function buildPostDtos(
  postRows: FeedPostRecord[],
  currentUserId: string,
  db: FeedDb,
): Promise<FeedPostDto[]> {
  if (postRows.length === 0) return [];

  // Resolve embedded reshare originals (one level deep). Fetch only the
  // originals NOT already present in `postRows` to avoid a redundant query.
  const presentIds = new Set(postRows.map((p) => p.id));
  const originalIds = [
    ...new Set(
      postRows
        .map((p) => p.repostOfId)
        .filter((id): id is string => Boolean(id) && !presentIds.has(id as string)),
    ),
  ];
  const originalRows = await findPostsByIds(db, originalIds);

  const support = await loadSupport([...postRows, ...originalRows], db, currentUserId);

  const originalDtoById = new Map<string, Record<string, unknown>>();
  for (const row of [...postRows, ...originalRows]) {
    if (!originalDtoById.has(row.id)) {
      originalDtoById.set(row.id, toPostDto(row, support.get(row.id)!, null));
    }
  }

  return postRows.map((post) =>
    toPostDto(
      post,
      support.get(post.id)!,
      post.repostOfId ? originalDtoById.get(post.repostOfId) ?? null : null,
    ),
  );
}

/** Batch-load author name/avatar + reaction rollups for a set of comment
 *  rows (no N+1) and shape them into the comment DTO. Shared by the thread
 *  GET and the single-comment create/update responses. */
export async function buildCommentDtos(
  rows: FeedCommentRecord[],
  currentUserId: string,
  db: FeedDb,
) {
  if (rows.length === 0) return [];
  const commentIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.userId))];

  const [authorRows, profileRows, reactionRows] = await Promise.all([
    findAuthorNames(db, authorIds),
    findAuthorAvatars(db, authorIds),
    findReactionsForComments(db, commentIds),
  ]);

  const nameMap = new Map(authorRows.map((a) => [a.id, a.name]));
  const avatarMap = new Map(profileRows.map((p) => [p.userId, p.avatarUrl ?? undefined]));
  const reactionsByComment = new Map<string, Array<{ userId: string; reactionType: string }>>();
  for (const r of reactionRows) {
    if (!reactionsByComment.has(r.commentId)) reactionsByComment.set(r.commentId, []);
    reactionsByComment.get(r.commentId)!.push({ userId: r.userId, reactionType: normalizeReaction(r.reactionType) });
  }

  return rows.map((r) => {
    const rx = reactionsByComment.get(r.id) ?? [];
    return {
      id: r.id,
      feedPostId: r.feedPostId,
      userId: r.userId,
      userName: nameMap.get(r.userId) ?? "Unknown",
      userAvatar: avatarMap.get(r.userId),
      content: r.content,
      reactions: summarizeReactions(rx),
      reactionCount: rx.length,
      currentUserReaction: rx.find((x) => x.userId === currentUserId)?.reactionType ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    };
  });
}
