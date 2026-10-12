// Feed-related TypeScript types and interfaces

export interface FeedPostMedia {
  id: string;
  feedPostId?: string;
  mediaType: 'Image' | 'Video';
  mediaUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  displayOrder: number;
  createdAt?: string;
}

export interface FeedPostTag {
  id: string;
  feedPostId?: string;
  tagType: 'Hashtag' | 'Mention';
  tagValue: string;
  mentionedUserId?: string;
  position?: number;
  createdAt?: string;
}

export interface FeedPostLike {
  id: string;
  feedPostId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  // Professional reaction type (shared/feed-reactions.ts). Optional for
  // back-compat with payloads predating reactions.
  reactionType?: string;
  createdAt?: string;
}

// One bucket of a reaction rollup — mirrors `ReactionCount` in
// shared/feed-reactions.ts.
export interface ReactionCount {
  type: string;
  count: number;
}

export interface FeedPostComment {
  id: string;
  feedPostId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  // Comment reactions — same professional set as posts.
  reactions?: ReactionCount[];
  reactionCount?: number;
  currentUserReaction?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Shallow preview of the reshared original embedded inside a repost. The API
 * sends this flat (no nested likes/comments/repostOf) so the embed can't
 * recurse — it only renders author + content + media + counts. Mirrors
 * `FeedRepostPreviewSchema` in `feed-service.ts`.
 */
export interface FeedRepostPreview {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  kind: 'text' | 'video' | 'article';
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImageUrl?: string;
  privacy: 'Public' | 'recruiter' | 'Connections' | 'Private';
  createdAt: string;
  media: FeedPostMedia[];
  likeCount: number;
  commentCount: number;
  repostCount: number;
  subjectType?: string;
  subjectId?: string;
  embedPayload?: Record<string, unknown>;
}

export interface FeedPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  // Post kind (gap #1828): 'text' | 'video' | 'article'. Drives long-form
  // rendering for articles and per-kind feed filtering.
  kind: 'text' | 'video' | 'article';
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImageUrl?: string;
  privacy: 'Public' | 'recruiter' | 'Connections' | 'Private';
  createdAt: string;
  updatedAt: string;
  media: FeedPostMedia[];
  tags: FeedPostTag[];
  likes: FeedPostLike[];
  comments: FeedPostComment[];
  likeCount: number;
  // Professional reaction rollup (per-type counts, display-sorted) + the
  // current viewer's own reaction. `likeCount` is the total across all
  // reaction types; `isLikedByCurrentUser` === (currentUserReaction != null).
  reactions?: ReactionCount[];
  currentUserReaction?: string | null;
  commentCount: number;
  isLikedByCurrentUser: boolean;
  // Reshare. `repostCount` = times this post was reposted; `repostOf` = the
  // embedded original when this post itself is a repost; `repostOfId` flags
  // it as a repost without needing the embed.
  repostCount: number;
  repostOfId?: string;
  repostOf?: FeedRepostPreview;
  // Polymorphic surfacing — when set, this post is a pointer to a
  // reviewable / promotable subject (a review, a video, a resume, …)
  // and the renderer inlines that subject's canonical card.
  subjectType?: string;
  subjectId?: string;
  embedPayload?: Record<string, unknown>;
}

export interface CreateFeedPostRequest {
  content: string;
  kind?: 'text' | 'video' | 'article';
  linkUrl?: string;
  privacy: 'Public' | 'recruiter' | 'Connections' | 'Private';
  media: CreateFeedPostMediaRequest[];
}

export interface CreateFeedPostMediaRequest {
  mediaType: 'Image' | 'Video';
  mediaUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  displayOrder: number;
}

export interface UpdateFeedPostRequest {
  content: string;
  kind?: 'text' | 'video' | 'article';
  privacy: 'Public' | 'recruiter' | 'Connections' | 'Private';
  media: CreateFeedPostMediaRequest[];
}

export interface CreateFeedPostCommentRequest {
  feedPostId: string;
  content: string;
}

export interface UpdateFeedPostCommentRequest {
  content: string;
}

export interface GetFeedPostsRequest {
  searchTerm?: string;
  filter?: 'all' | 'connections' | 'following';
  privacy?: 'public' | 'connections';
  // Hashtag discovery (gap #1829): filter the feed to a single hashtag.
  tag?: string;
  fromDate?: string;
  toDate?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// Trending hashtag (gap #1829) — top hashtags by recent post frequency.
export interface TrendingTag {
  tag: string;
  postCount: number;
}

// Trending post — a public post ranked by recent engagement (weighted
// reactions + reposts + comments). Compact shape for the sidebar; clicking
// a row deep-links to /feed/:id.
export interface TrendingPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  excerpt: string;
  kind: 'text' | 'video' | 'article';
  createdAt: string;
  reactionCount: number;
  commentCount: number;
  repostCount: number;
  score: number;
}

export interface FeedPostsResponse {
  posts: FeedPost[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface LinkPreviewRequest {
  url: string;
}

/** POST /api/feed/link-preview — OpenGraph unfurl. Every field but
 *  `url` is null when the page didn't expose it. */
/** Each field is absent/null when the page doesn't declare it. Optional as
 *  well as nullable so it matches `LinkPreviewResponseSchema`'s inferred
 *  type under this project's zod/tsc settings. */
export interface LinkPreviewResponse {
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
}

// UI-specific types
export interface FeedFilters {
  searchTerm: string;
  filter: 'all' | 'connections' | 'following';
  privacy: 'public' | 'connections';
  // Active hashtag filter (gap #1829) — set when a trending tag is clicked.
  tag?: string;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
}

export interface CreatePostData {
  content: string;
  privacy: 'Public' | 'recruiter' | 'Connections' | 'Private';
  linkUrl?: string;
  mediaFiles: File[];
}

// Feed interaction types
export interface FeedInteraction {
  type: 'like' | 'comment' | 'share';
  postId: string;
  userId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Feed analytics types
export interface FeedAnalytics {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  engagementRate: number;
  topHashtags: Array<{
    tag: string;
    count: number;
  }>;
  topPosts: FeedPost[];
}