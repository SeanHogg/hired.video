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
  createdAt?: string;
}

export interface FeedPostComment {
  id: string;
  feedPostId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
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
  commentCount: number;
  isLikedByCurrentUser: boolean;
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

export interface LinkPreviewResponse {
  url: string;
  title: string;
  description: string;
  imageUrl?: string;
  siteName?: string;
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