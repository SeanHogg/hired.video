/**
 * Feed Service
 * Handles social feed-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";
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
  createdAt: z.string().optional(),
});

export const FeedPostCommentSchema = z.object({
  id: z.string(),
  feedPostId: z.string().optional(),
  userId: z.string(),
  userName: z.string(),
  userAvatar: z.string().optional(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const FeedPostSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  userAvatar: z.string().optional(),
  content: z.string(),
  linkUrl: z.string().optional(),
  linkTitle: z.string().optional(),
  linkDescription: z.string().optional(),
  linkImageUrl: z.string().optional(),
  privacy: z.enum(["Public", "Recruiter", "Connections", "Private"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  media: z.array(FeedPostMediaSchema),
  tags: z.array(FeedPostTagSchema),
  likes: z.array(FeedPostLikeSchema),
  comments: z.array(FeedPostCommentSchema),
  likeCount: z.number(),
  commentCount: z.number(),
  isLikedByCurrentUser: z.boolean(),
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
  linkUrl: z.string().url().optional(),
  privacy: z.enum(["Public", "Recruiter", "Connections", "Private"]),
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
  privacy: z.enum(["Public", "Recruiter", "Connections", "Private"]),
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
 * Like a feed post
 */
export async function likeFeedPost(postId: string): Promise<FeedPostLike> {
  const response = await apiClient.post<ApiSuccessResponse<FeedPostLike>>(
    `/api/feed/posts/${postId}/like`
  );

  return FeedPostLikeSchema.parse(response.data);
}

/**
 * Unlike a feed post
 */
export async function unlikeFeedPost(postId: string): Promise<void> {
  await apiClient.delete(`/api/feed/posts/${postId}/like`);
}

/**
 * Report a feed post
 */
export async function reportFeedPost(postId: string, reason: string, details?: string): Promise<void> {
  await apiClient.post(`/api/feed/posts/${postId}/report`, { reason, details });
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
  const likePost = async (postId: string) => {
    try {
      return await likeFeedPost(postId);
    } catch (error) {
      console.error("Failed to like post:", error);
      throw error;
    }
  };

  const unlikePost = async (postId: string) => {
    try {
      await unlikeFeedPost(postId);
    } catch (error) {
      console.error("Failed to unlike post:", error);
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
    likePost,
    unlikePost,
    addComment,
  };
}