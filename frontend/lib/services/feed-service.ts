/**
 * Feed Service
 * Handles social feed-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import { FEED_REACTIONS } from "@shared/feed-reactions";
import type {
  FeedPost,
  FeedPostsResponse,
  CreateFeedPostRequest,
  UpdateFeedPostRequest,
  CreateFeedPostCommentRequest,
  UpdateFeedPostCommentRequest,
  GetFeedPostsRequest,
  FeedPostLike,
  FeedPostComment,
  LinkPreviewRequest,
  LinkPreviewResponse,
  TrendingTag,
  TrendingPost,
} from "../../types/feed";

// ============================================================================
// SCHEMAS
// ============================================================================

export const FeedPostMediaSchema = z.object({
  id: z.string(),
  feedPostId: z.string().optional(),
  mediaType: z.enum(["Image", "Video"]),
  mediaUrl: z.string(),
  thumbnailUrl: z.string().optional(),
  altText: z.string().optional(),
  displayOrder: z.number(),
  createdAt: z.string().optional(),
});

export const FeedPostTagSchema = z.object({
  id: z.string(),
  feedPostId: z.string().optional(),
  tagType: z.enum(["Hashtag", "Mention"]),
  tagValue: z.string(),
  mentionedUserId: z.string().optional(),
  position: z.number().optional(),
  createdAt: z.string().optional(),
});

export const FeedPostLikeSchema = z.object({
  id: z.string(),
  feedPostId: z.string().optional(),
  userId: z.string(),
  userName: z.string(),
  userAvatar: z.string().optional(),
  reactionType: z.string().optional(),
  createdAt: z.string().optional(),
});

// One reaction-count bucket — mirrors `ReactionCount` (shared/feed-reactions.ts).
export const ReactionCountSchema = z.object({
  type: z.string(),
  count: z.number(),
});

export const FeedPostCommentSchema = z.object({
  id: z.string(),
  feedPostId: z.string().optional(),
  userId: z.string(),
  userName: z.string(),
  userAvatar: z.string().optional(),
  content: z.string(),
  reactions: z.array(ReactionCountSchema).optional(),
  reactionCount: z.number().optional(),
  currentUserReaction: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Shallow preview of the reshared original embedded inside a repost. Kept
// flat (no nested likes/comments/repostOf) so the schema can't recurse;
// the embed only renders author + content + media + counts.
export const FeedRepostPreviewSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  userAvatar: z.string().optional(),
  content: z.string(),
  kind: z.enum(["text", "video", "article"]).default("text"),
  linkUrl: z.string().optional(),
  linkTitle: z.string().optional(),
  linkDescription: z.string().optional(),
  linkImageUrl: z.string().optional(),
  privacy: z.enum(["Public", "recruiter", "Connections", "Private"]),
  createdAt: z.string(),
  media: z.array(FeedPostMediaSchema).default([]),
  likeCount: z.number().default(0),
  commentCount: z.number().default(0),
  repostCount: z.number().default(0),
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
  embedPayload: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const FeedPostSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  userAvatar: z.string().optional(),
  content: z.string(),
  kind: z.enum(["text", "video", "article"]).default("text"),
  linkUrl: z.string().optional(),
  linkTitle: z.string().optional(),
  linkDescription: z.string().optional(),
  linkImageUrl: z.string().optional(),
  privacy: z.enum(["Public", "recruiter", "Connections", "Private"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  media: z.array(FeedPostMediaSchema),
  tags: z.array(FeedPostTagSchema),
  likes: z.array(FeedPostLikeSchema),
  comments: z.array(FeedPostCommentSchema),
  likeCount: z.number(),
  reactions: z.array(ReactionCountSchema).optional(),
  currentUserReaction: z.string().nullable().optional(),
  commentCount: z.number(),
  // Reshare count (how many times this post was reposted) + the embedded
  // original when this post IS a repost (gap social-feed pass).
  repostCount: z.number().default(0),
  repostOfId: z.string().optional(),
  repostOf: FeedRepostPreviewSchema.optional(),
  isLikedByCurrentUser: z.boolean(),
  // Polymorphic surfacing — populated for posts that point at a
  // reviewable/promotable subject (review, video, voice clone, …).
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
  embedPayload: z.record(z.string(), z.unknown()).optional(),
});

export const FeedPostsResponseSchema = z.object({
  posts: z.array(FeedPostSchema),
  totalCount: z.number(),
  pageNumber: z.number(),
  pageSize: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const CreateFeedPostRequestSchema = z.object({
  content: z.string(),
  kind: z.enum(["text", "video", "article"]).optional(),
  linkUrl: z.string().url().optional(),
  privacy: z.enum(["Public", "recruiter", "Connections", "Private"]),
  media: z.array(z.object({
    mediaType: z.enum(["Image", "Video"]),
    mediaUrl: z.string(),
    thumbnailUrl: z.string().optional(),
    altText: z.string().optional(),
    displayOrder: z.number(),
  })),
}).refine((d) => d.content.trim().length > 0 || d.media.length > 0, {
  message: "Add some content or attach media before posting",
  path: ["content"],
});

export const UpdateFeedPostRequestSchema = z.object({
  content: z.string().min(1, "Content is required"),
  kind: z.enum(["text", "video", "article"]).optional(),
  privacy: z.enum(["Public", "recruiter", "Connections", "Private"]),
  media: z.array(z.object({
    mediaType: z.enum(["Image", "Video"]),
    mediaUrl: z.string(),
    thumbnailUrl: z.string().optional(),
    altText: z.string().optional(),
    displayOrder: z.number(),
  })),
});

export const CreateFeedPostCommentRequestSchema = z.object({
  feedPostId: z.string(),
  content: z.string().min(1, "Comment content is required"),
});

export const UpdateFeedPostCommentRequestSchema = z.object({
  content: z.string().min(1, "Comment content is required"),
});

export const GetFeedPostsRequestSchema = z.object({
  searchTerm: z.string().optional(),
  filter: z.enum(["all", "connections", "following"]).optional(),
  privacy: z.enum(["public", "connections"]).optional(),
  tag: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  pageNumber: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
});

export const LinkPreviewRequestSchema = z.object({
  url: z.string().url("Invalid URL format"),
});

export const LinkPreviewResponseSchema = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string(),
  imageUrl: z.string().optional(),
  siteName: z.string().optional(),
});

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Get feed posts with optional filtering and pagination
 */
export async function getFeedPosts(request: GetFeedPostsRequest = {}): Promise<FeedPostsResponse> {
  const params = new URLSearchParams();

  if (request.searchTerm) params.append("searchTerm", request.searchTerm);
  if (request.filter) params.append("filter", request.filter);
  if (request.privacy) params.append("privacy", request.privacy);
  if (request.tag) params.append("tag", request.tag);
  if (request.fromDate) params.append("fromDate", request.fromDate);
  if (request.toDate) params.append("toDate", request.toDate);
  if (request.pageNumber) params.append("pageNumber", request.pageNumber.toString());
  if (request.pageSize) params.append("pageSize", request.pageSize.toString());
  if (request.sortBy) params.append("sortBy", request.sortBy);
  if (request.sortDirection) params.append("sortDirection", request.sortDirection);

  const response = await apiClient.get<ApiSuccessResponse<FeedPostsResponse>>(
    `/api/feed/posts?${params.toString()}`
  );

  const parsed = FeedPostsResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    console.warn("[feed] Response validation warning:", parsed.error.issues);
    return response.data as unknown as FeedPostsResponse;
  }
  return parsed.data;
}

/**
 * Get a specific feed post by ID
 */
export async function getFeedPost(postId: string): Promise<FeedPost> {
  const response = await apiClient.get<ApiSuccessResponse<FeedPost>>(
    `/api/feed/posts/${postId}`
  );

  return FeedPostSchema.parse(response.data);
}

/**
 * Create a new feed post
 */
export async function createFeedPost(request: CreateFeedPostRequest): Promise<FeedPost> {
  CreateFeedPostRequestSchema.parse(request);

  const response = await apiClient.post<ApiSuccessResponse<FeedPost>>(
    "/api/feed/posts",
    request
  );

  return FeedPostSchema.parse(response.data);
}

/**
 * Update an existing feed post
 */
export async function updateFeedPost(postId: string, request: UpdateFeedPostRequest): Promise<FeedPost> {
  UpdateFeedPostRequestSchema.parse(request);

  const response = await apiClient.put<ApiSuccessResponse<FeedPost>>(
    `/api/feed/posts/${postId}`,
    request
  );

  return FeedPostSchema.parse(response.data);
}

/**
 * Delete a feed post
 */
export async function deleteFeedPost(postId: string): Promise<void> {
  await apiClient.delete(`/api/feed/posts/${postId}`);
}

/**
 * React to a feed post with a professional reaction (like / celebrate /
 * support / insightful / curious / funny — see shared/feed-reactions.ts).
 * Idempotent per (post, viewer): calling again with a different type changes
 * the reaction. Defaults to a plain "like" for a quick tap.
 */
export async function reactToFeedPost(
  postId: string,
  reactionType = "like",
): Promise<FeedPostLike> {
  const response = await apiClient.post<ApiSuccessResponse<FeedPostLike>>(
    `/api/feed/posts/${postId}/react`,
    { reactionType },
  );
  return FeedPostLikeSchema.parse(response.data);
}

/**
 * Remove the viewer's reaction from a feed post.
 */
export async function removeFeedPostReaction(postId: string): Promise<void> {
  await apiClient.delete(`/api/feed/posts/${postId}/react`);
}

/**
 * React to a comment with a professional reaction (same set as posts).
 */
export async function reactToComment(
  commentId: string,
  reactionType = "like",
): Promise<void> {
  await apiClient.post(`/api/feed/comments/${commentId}/react`, { reactionType });
}

/**
 * Remove the viewer's reaction from a comment.
 */
export async function removeCommentReaction(commentId: string): Promise<void> {
  await apiClient.delete(`/api/feed/comments/${commentId}/react`);
}

/**
 * Report a feed post
 */
export async function reportFeedPost(postId: string, reason: string, details?: string): Promise<void> {
  await apiClient.post(`/api/feed/posts/${postId}/report`, { reason, details });
}

/**
 * Reshare / repost a feed post. Optional `content` = a quote-repost (the
 * resharer's commentary above the embedded original); empty = plain repost.
 */
export async function resharePost(
  postId: string,
  options: { content?: string; privacy?: FeedPost["privacy"] } = {},
): Promise<FeedPost> {
  const response = await apiClient.post<ApiSuccessResponse<FeedPost>>(
    `/api/feed/posts/${postId}/reshare`,
    { content: options.content ?? "", privacy: options.privacy ?? "Public" },
  );
  return FeedPostSchema.parse(response.data);
}

/**
 * Load the full comment thread for a post (the list/detail DTO ships an
 * empty comments array to keep the feed query flat — this fetches them on
 * demand when a viewer expands the thread).
 */
export async function getPostComments(postId: string): Promise<FeedPostComment[]> {
  const response = await apiClient.get<ApiSuccessResponse<FeedPostComment[]>>(
    `/api/feed/posts/${postId}/comments`,
  );
  return z.array(FeedPostCommentSchema).parse(response.data ?? []);
}

/**
 * Add a comment to a feed post
 */
export async function createComment(request: CreateFeedPostCommentRequest): Promise<FeedPostComment> {
  CreateFeedPostCommentRequestSchema.parse(request);

  const response = await apiClient.post<ApiSuccessResponse<FeedPostComment>>(
    "/api/feed/comments",
    request
  );

  return FeedPostCommentSchema.parse(response.data);
}

/**
 * Update a comment
 */
export async function updateComment(commentId: string, request: UpdateFeedPostCommentRequest): Promise<FeedPostComment> {
  UpdateFeedPostCommentRequestSchema.parse(request);

  const response = await apiClient.put<ApiSuccessResponse<FeedPostComment>>(
    `/api/feed/comments/${commentId}`,
    request
  );

  return FeedPostCommentSchema.parse(response.data);
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId: string): Promise<void> {
  await apiClient.delete(`/api/feed/comments/${commentId}`);
}

/**
 * Search feed posts
 */
export async function searchFeedPosts(
  searchTerm: string,
  pageNumber = 1,
  pageSize = 20
): Promise<FeedPostsResponse> {
  const params = new URLSearchParams({
    searchTerm,
    pageNumber: pageNumber.toString(),
    pageSize: pageSize.toString(),
  });

  const response = await apiClient.get<ApiSuccessResponse<FeedPostsResponse>>(
    `/api/feed/search?${params.toString()}`
  );

  const parsed = FeedPostsResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    console.warn("[feed] Search response validation warning:", parsed.error.issues);
    return response.data as unknown as FeedPostsResponse;
  }
  return parsed.data;
}

/**
 * Get trending hashtags (gap #1829) — top hashtags from public posts over the
 * last 30 days. Powers the clickable "Trending topics" sidebar; selecting one
 * filters the feed via `getFeedPosts({ tag })`.
 */
export const TrendingTagSchema = z.object({
  tag: z.string(),
  // Backend returns `post_count` (raw SQL aggregate); normalise to camelCase.
  post_count: z.number(),
});

export async function getTrendingTags(limit = 8): Promise<TrendingTag[]> {
  const response = await apiClient.get<ApiSuccessResponse<Array<{ tag: string; post_count: number }>>>(
    `/api/feed/trending-tags?limit=${limit}`,
  );
  const parsed = z.array(TrendingTagSchema).safeParse(response.data);
  if (!parsed.success) {
    console.warn("[feed] Trending-tags validation warning:", parsed.error.issues);
    return [];
  }
  return parsed.data.map((r) => ({ tag: r.tag, postCount: r.post_count }));
}

/**
 * Trending posts — public posts ranked by recent engagement (weighted
 * reactions + reposts + comments). Powers the "Trending" sidebar; selecting
 * one deep-links to /feed/:id.
 */
export const TrendingPostSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  userAvatar: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  kind: z.enum(["text", "video", "article"]).default("text"),
  createdAt: z.string(),
  // Raw SQL aggregates arrive as numbers (or numeric strings via KV JSON);
  // coerce so the sidebar always gets numbers.
  reactionCount: z.coerce.number().default(0),
  commentCount: z.coerce.number().default(0),
  repostCount: z.coerce.number().default(0),
  score: z.coerce.number().default(0),
});

export async function getTrendingPosts(limit = 5): Promise<TrendingPost[]> {
  const response = await apiClient.get<ApiSuccessResponse<unknown[]>>(
    `/api/feed/trending-posts?limit=${limit}`,
  );
  const parsed = z.array(TrendingPostSchema).safeParse(response.data);
  if (!parsed.success) {
    console.warn("[feed] Trending-posts validation warning:", parsed.error.issues);
    return [];
  }
  return parsed.data.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userAvatar: r.userAvatar ?? undefined,
    excerpt: r.excerpt ?? "",
    kind: r.kind,
    createdAt: r.createdAt,
    reactionCount: r.reactionCount,
    commentCount: r.commentCount,
    repostCount: r.repostCount,
    score: r.score,
  }));
}

// ============================================================================
// OPTIMISTIC REACTION STATE HELPERS (pure)
// ============================================================================
// Shared by every feed surface (Home, Feed, PostDetail) so the optimistic
// update after a react/unreact is computed in ONE place — no duplicated
// "decrement old bucket / increment new bucket / adjust count" logic.

function rebuildSummary(counts: Map<string, number>): { type: string; count: number }[] {
  return FEED_REACTIONS.map((r) => ({ type: r.type, count: counts.get(r.type) ?? 0 })).filter(
    (b) => b.count > 0,
  );
}

/** Apply a reaction change (or removal — `null`) to a post, returning a new
 *  post object with `reactions`, `currentUserReaction`, `likeCount`, and
 *  `isLikedByCurrentUser` all kept in sync. */
export function applyReactionToPost(post: FeedPost, reactionType: string | null): FeedPost {
  const prev = post.currentUserReaction ?? null;
  if (prev === reactionType) return post;

  const counts = new Map((post.reactions ?? []).map((b) => [b.type, b.count]));
  if (prev) counts.set(prev, Math.max(0, (counts.get(prev) ?? 0) - 1));
  if (reactionType) counts.set(reactionType, (counts.get(reactionType) ?? 0) + 1);

  const likeDelta = (reactionType ? 1 : 0) - (prev ? 1 : 0);
  return {
    ...post,
    reactions: rebuildSummary(counts),
    currentUserReaction: reactionType,
    isLikedByCurrentUser: reactionType != null,
    likeCount: Math.max(0, post.likeCount + likeDelta),
  };
}

/** Apply a reaction change (or removal) to a comment. */
export function applyReactionToComment(
  comment: FeedPostComment,
  reactionType: string | null,
): FeedPostComment {
  const prev = comment.currentUserReaction ?? null;
  if (prev === reactionType) return comment;

  const counts = new Map((comment.reactions ?? []).map((b) => [b.type, b.count]));
  if (prev) counts.set(prev, Math.max(0, (counts.get(prev) ?? 0) - 1));
  if (reactionType) counts.set(reactionType, (counts.get(reactionType) ?? 0) + 1);

  const delta = (reactionType ? 1 : 0) - (prev ? 1 : 0);
  return {
    ...comment,
    reactions: rebuildSummary(counts),
    currentUserReaction: reactionType,
    reactionCount: Math.max(0, (comment.reactionCount ?? 0) + delta),
  };
}

/**
 * Get link preview for a URL
 */
export async function getLinkPreview(request: LinkPreviewRequest): Promise<LinkPreviewResponse> {
  LinkPreviewRequestSchema.parse(request);

  const response = await apiClient.post<ApiSuccessResponse<LinkPreviewResponse>>(
    "/api/feed/link-preview",
    request
  );

  return LinkPreviewResponseSchema.parse(response.data);
}

// ============================================================================
// HOOKS (if needed for complex operations)
// ============================================================================

/**
 * Hook for managing feed post interactions
 * This could be expanded for optimistic updates, caching, etc.
 */
export function useFeedInteractions() {
  const reactToPost = async (postId: string, reactionType = "like") => {
    try {
      return await reactToFeedPost(postId, reactionType);
    } catch (error) {
      console.error("Failed to react to post:", error);
      throw error;
    }
  };

  const unreactPost = async (postId: string) => {
    try {
      await removeFeedPostReaction(postId);
    } catch (error) {
      console.error("Failed to remove reaction:", error);
      throw error;
    }
  };

  const addComment = async (request: CreateFeedPostCommentRequest) => {
    try {
      return await createComment(request);
    } catch (error) {
      console.error("Failed to add comment:", error);
      throw error;
    }
  };

  return {
    reactToPost,
    unreactPost,
    addComment,
  };
}