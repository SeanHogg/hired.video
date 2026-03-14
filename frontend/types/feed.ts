// Feed-related TypeScript types and interfaces

export interface FeedPostMedia {
  id: string;
  feedPostId: string;
  mediaType: 'Image' | 'Video';
  mediaUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  displayOrder: number;
  createdAt: string;
}

export interface FeedPostTag {
  id: string;
  feedPostId: string;
  tagType: 'Hashtag' | 'Mention';
  tagValue: string;
  mentionedUserId?: string;
  position: number;
  createdAt: string;
}

export interface FeedPostLike {
  id: string;
  feedPostId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  createdAt: string;
}

export interface FeedPostComment {
  id: string;
  feedPostId: string;
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
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImageUrl?: string;
  privacy: 'Public' | 'Private' | 'Connections';
  createdAt: string;
  updatedAt: string;
  media: FeedPostMedia[];
  tags: FeedPostTag[];
  likes: FeedPostLike[];
  comments: FeedPostComment[];
  likeCount: number;
  commentCount: number;
  isLikedByCurrentUser: boolean;
}

export interface CreateFeedPostRequest {
  content: string;
  linkUrl?: string;
  privacy: 'Public' | 'Private' | 'Connections';
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
  privacy: 'Public' | 'Private' | 'Connections';
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
  fromDate?: string;
  toDate?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
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
  dateRange?: {
    from?: Date;
    to?: Date;
  };
}

export interface CreatePostData {
  content: string;
  privacy: 'Public' | 'Private' | 'Connections';
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