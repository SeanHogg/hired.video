/**
 * Feed notifications — @mention and reaction fan-out. All fire-and-forget
 * (callers hand the promise to `waitUntil`). `feed_reaction` has no
 * preference category, so it goes out as an in-app notification under the
 * channel-level gate.
 */

import { reactionDef } from "../../../../shared/feed-reactions.js";
import { buildRepos } from "../../repositories/index.js";
import { findPostOwner, type FeedDb } from "../../repositories/feedPostsRepository.js";
import { findCommentById, findUserIdsByLowerName } from "../../repositories/feedEngagementRepository.js";
import { emitNotification, resolveActor } from "../notifications/notificationService.js";
import { extractMentions } from "./feedPostPolicy.js";

export async function createMentionNotifications(
  content: string,
  postId: string,
  postAuthorId: string,
  db: FeedDb,
): Promise<void> {
  const mentionedNames = extractMentions(content);
  if (mentionedNames.length === 0) return;

  const recipientIds = await findUserIdsByLowerName(db, mentionedNames);
  if (recipientIds.length === 0) return;

  const repos = buildRepos(db);
  const { actor, actorName } = await resolveActor({ repos }, postAuthorId);
  await emitNotification(
    { repos },
    {
      recipientIds,
      type: "feed_mention",
      actor,
      title: `${actorName} mentioned you`,
      message: `${actorName} mentioned you in a post`,
      target: { id: postId, type: "feed_post" },
    },
  );
}

/** Notify a post's author that someone reacted. Skips self-reactions. */
export async function notifyPostReaction(
  postId: string,
  reactorId: string,
  reactionType: string,
  db: FeedDb,
): Promise<void> {
  const post = await findPostOwner(db, postId);
  if (!post || post.userId === reactorId) return;

  const repos = buildRepos(db);
  const { actor, actorName } = await resolveActor({ repos }, reactorId);
  const def = reactionDef(reactionType);
  await emitNotification(
    { repos },
    {
      recipientIds: [post.userId],
      type: "feed_reaction",
      actor,
      title: `${actorName} reacted to your post`,
      message: `${actorName} reacted ${def.emoji} ${def.label} to your post`,
      target: { id: postId, type: "feed_post" },
    },
  );
}

/** Notify a comment's author that someone reacted to their comment. */
export async function notifyCommentReaction(
  commentId: string,
  reactorId: string,
  reactionType: string,
  db: FeedDb,
): Promise<void> {
  const comment = await findCommentById(db, commentId);
  if (!comment || comment.userId === reactorId) return;

  const repos = buildRepos(db);
  const { actor, actorName } = await resolveActor({ repos }, reactorId);
  const def = reactionDef(reactionType);
  await emitNotification(
    { repos },
    {
      recipientIds: [comment.userId],
      type: "feed_reaction",
      actor,
      title: `${actorName} reacted to your comment`,
      message: `${actorName} reacted ${def.emoji} ${def.label} to your comment`,
      target: { id: comment.feedPostId, type: "feed_post" },
    },
  );
}
