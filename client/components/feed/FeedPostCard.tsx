import React, { useState } from "react";
import {
  Heart,
  MessageCircle,
  Share,
  MoreHorizontal,
  Globe,
  Lock,
  Users,
  Hash,
  AtSign,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { likeFeedPost, unlikeFeedPost, createComment } from "@/lib/services/feed-service";
import { useAuth } from "@/lib/auth";
import type { FeedPost, CreateFeedPostCommentRequest } from "@/types/feed";

// Sub-components
const FeedPostMedia = ({ media }: { media: FeedPost['media'] }) => {
  if (!media || media.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {media.map((item) => (
        <div key={item.id} className="rounded-lg overflow-hidden border">
          {item.mediaType === 'Image' ? (
            <img
              src={item.mediaUrl}
              alt={item.altText || 'Post image'}
              className="w-full h-auto max-h-96 object-cover"
            />
          ) : (
            <video
              src={item.mediaUrl}
              controls
              className="w-full h-auto max-h-96"
              poster={item.thumbnailUrl}
            />
          )}
        </div>
      ))}
    </div>
  );
};

const FeedPostLinkPreview = ({
  linkUrl,
  linkTitle,
  linkDescription,
  linkImageUrl
}: {
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImageUrl?: string;
}) => {
  if (!linkUrl) return null;

  return (
    <div className="mt-4 border rounded-lg overflow-hidden">
      {linkImageUrl && (
        <img
          src={linkImageUrl}
          alt={linkTitle || 'Link preview'}
          className="w-full h-48 object-cover"
        />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm line-clamp-2">
              {linkTitle || 'Link Preview'}
            </h4>
            {linkDescription && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {linkDescription}
              </p>
            )}
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
        </div>
        <p className="text-xs text-muted-foreground mt-2 truncate">
          {linkUrl}
        </p>
      </div>
    </div>
  );
};

const FeedPostTags = ({ tags }: { tags: FeedPost['tags'] }) => {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="text-xs px-2 py-1"
        >
          {tag.tagType === 'Hashtag' ? (
            <Hash className="h-3 w-3 mr-1" />
          ) : (
            <AtSign className="h-3 w-3 mr-1" />
          )}
          {tag.tagValue}
        </Badge>
      ))}
    </div>
  );
};

const FeedPostActions = ({
  post,
  onLike,
  onComment
}: {
  post: FeedPost;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
}) => {
  const { user } = useAuth();
  const [liking, setLiking] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const handleLike = async () => {
    if (!user) return;

    setLiking(true);
    try {
      if (post.isLikedByCurrentUser) {
        await unlikeFeedPost(post.id);
      } else {
        await likeFeedPost(post.id);
      }
      onLike(post.id);
    } catch (error) {
      console.error('Failed to toggle like:', error);
    } finally {
      setLiking(false);
    }
  };

  const handleComment = () => {
    setShowComments(!showComments);
    onComment(post.id);
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={liking}
            className={`text-muted-foreground hover:text-red-500 ${
              post.isLikedByCurrentUser ? 'text-red-500' : ''
            }`}
          >
            <Heart
              className={`h-4 w-4 mr-2 ${
                post.isLikedByCurrentUser ? 'fill-current' : ''
              }`}
            />
            {post.likeCount}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleComment}
            className="text-muted-foreground hover:text-blue-500"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            {post.commentCount}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-green-500"
          >
            <Share className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Report Post</DropdownMenuItem>
            <DropdownMenuItem>Hide Post</DropdownMenuItem>
            {post.userId === user?.id && (
              <>
                <DropdownMenuItem>Edit Post</DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">Delete Post</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="border-t pt-4 space-y-3">
          {post.comments.slice(0, 3).map((comment) => (
            <div key={comment.id} className="flex space-x-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={comment.userAvatar} />
                <AvatarFallback className="text-xs">
                  {comment.userName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-sm font-medium">{comment.userName}</p>
                  <p className="text-sm">{comment.content}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}

          {post.comments.length > 3 && (
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              View all {post.commentCount} comments
            </Button>
          )}

          {/* Add Comment */}
          <div className="flex space-x-3 pt-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="text-xs">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 flex space-x-2">
              <input
                type="text"
                placeholder="Write a comment..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button size="sm" variant="outline">
                Post
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface FeedPostCardProps {
  post: FeedPost;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
}

export default function FeedPostCard({ post, onLike, onComment }: FeedPostCardProps) {
  const getPrivacyIcon = () => {
    switch (post.privacy) {
      case 'Public':
        return <Globe className="h-3 w-3" />;
      case 'Private':
        return <Lock className="h-3 w-3" />;
      case 'Connections':
        return <Users className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getPrivacyText = () => {
    switch (post.privacy) {
      case 'Public':
        return 'Public';
      case 'Private':
        return 'Private';
      case 'Connections':
        return 'Connections only';
      default:
        return '';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarImage src={post.userAvatar} />
              <AvatarFallback>
                {post.userName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{post.userName}</p>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                <span>•</span>
                <div className="flex items-center space-x-1">
                  {getPrivacyIcon()}
                  <span>{getPrivacyText()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Post Content */}
        <div className="prose prose-sm max-w-none">
          <p className="whitespace-pre-wrap">{post.content}</p>
        </div>

        {/* Link Preview */}
        <FeedPostLinkPreview
          linkUrl={post.linkUrl}
          linkTitle={post.linkTitle}
          linkDescription={post.linkDescription}
          linkImageUrl={post.linkImageUrl}
        />

        {/* Media */}
        <FeedPostMedia media={post.media} />

        {/* Tags */}
        <FeedPostTags tags={post.tags} />

        {/* Actions */}
        <FeedPostActions
          post={post}
          onLike={onLike}
          onComment={onComment}
        />
      </CardContent>
    </Card>
  );
}