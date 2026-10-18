/**
 * Employee Community (Pro Employer) use cases behind /api/community: a
 * company-scoped, channel-based feed stored as `Private` feed posts tagged
 * `company:<companyId>:<channel>`. Every company-scoped call requires an
 * active company membership. Throws DomainError (403 / 404).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos } from "../../repositories/index.js";
import {
  deletePost,
  findPostOwner,
  insertPost,
  listCommunityChannelPosts,
  type FeedPostRecord,
} from "../../repositories/feedPostsRepository.js";
import {
  isActiveCompanyMember,
  listActiveCompanyMemberUserIds,
} from "../../repositories/companyMembershipsRepository.js";
import { emitNotification } from "../notifications/notificationService.js";

export const COMMUNITY_CHANNELS = ["engage", "inform", "inspire", "general"] as const;
export type CommunityChannel = (typeof COMMUNITY_CHANNELS)[number];

const CHANNEL_DESCRIPTIONS: Record<CommunityChannel, string> = {
  engage: "Two-way conversations, polls, and team discussions",
  inform: "Company updates, announcements, and news",
  inspire: "Recognition, wins, and motivational content",
  general: "General company communication",
};

const PAGE_LIMIT = 50;

const channelTag = (companyId: string, channel: string) => `company:${companyId}:${channel}`;

async function assertMember(userId: string, companyId: string): Promise<void> {
  if (!(await isActiveCompanyMember(userId, companyId))) {
    throw new DomainError(403, "FORBIDDEN", "You are not a member of this company");
  }
}

export async function listChannelPosts(
  userId: string,
  companyId: string,
  channel: string,
): Promise<{ channel: string; companyId: string; posts: FeedPostRecord[] }> {
  await assertMember(userId, companyId);
  const posts = await listCommunityChannelPosts(getDb(), channelTag(companyId, channel), PAGE_LIMIT);
  return { channel, companyId, posts };
}

export interface CreateCommunityPostInput {
  companyId: string;
  channel: CommunityChannel;
  content: string;
  media: Array<{ url: string; type: string }>;
  isPinned: boolean;
}

/** Post into a channel (hidden from the public feed) and notify the other members. */
export async function createCommunityPost(userId: string, body: CreateCommunityPostInput): Promise<FeedPostRecord> {
  await assertMember(userId, body.companyId);
  const db = getDb();
  const post = await insertPost(db, {
    userId,
    content: body.content,
    privacy: "Private", // hidden from public feed
    media: body.media as any,
    tags: [channelTag(body.companyId, body.channel), `channel:${body.channel}`] as any,
  });

  // Notify all company members except the poster (#19) — best-effort.
  const recipientIds = (await listActiveCompanyMemberUserIds(body.companyId)).filter((id) => id !== userId);
  if (recipientIds.length > 0) {
    await emitNotification(
      { repos: buildRepos(db) },
      {
        recipientIds,
        type: "community_post",
        actor: null,
        title: "New community post",
        message: `A new post was shared in the ${body.channel} channel.`,
        extraData: { postId: post.id, channel: body.channel, companyId: body.companyId },
      },
    ).catch(() => undefined);
  }
  return post;
}

/** Delete one of the caller's own posts. */
export async function deleteCommunityPost(userId: string, postId: string): Promise<void> {
  const db = getDb();
  const post = await findPostOwner(db, postId);
  if (!post || post.userId !== userId) throw new DomainError(404, "NOT_FOUND", "Post not found");
  await deletePost(db, post.id);
}

export async function listChannels(userId: string, companyId: string) {
  await assertMember(userId, companyId);
  return {
    companyId,
    channels: COMMUNITY_CHANNELS.map((ch) => ({
      id: ch,
      name: ch.charAt(0).toUpperCase() + ch.slice(1),
      description: CHANNEL_DESCRIPTIONS[ch],
      tag: channelTag(companyId, ch),
    })),
  };
}
