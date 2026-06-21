import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  MessageCircle,
  Repeat2,
  MoreHorizontal,
  Globe,
  Lock,
  Users,
  Hash,
  AtSign,
  ExternalLink,
  FileText,
  Loader2,
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

import {
  reactToFeedPost,
  removeFeedPostReaction,
  reactToComment,
  removeCommentReaction,
  applyReactionToComment,
  createComment,
  getPostComments,
  resharePost,
  deleteFeedPost,
  updateFeedPost,
} from "@/lib/services/feed-service";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { FeedPost, FeedPostComment, FeedRepostPreview } from "@/types/feed";
import { FeedReviewEmbed } from "./FeedReviewEmbed";
import PostStatsSheet from "./PostStatsSheet";
import ReactionPicker, { ReactionSummaryChips } from "./ReactionPicker";
import ShareMenu from "@/components/share/ShareMenu";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";

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

const FeedPostTags = ({
  tags,
  onSelectTag,
}: {
  tags: FeedPost['tags'];
  // Hashtag discovery (gap #1829): when provided, hashtag chips become
  // clickable and filter the feed to that tag.
  onSelectTag?: (tag: string) => void;
}) => {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {tags.map((tag) => {
        const clickable = tag.tagType === 'Hashtag' && Boolean(onSelectTag);
        return (
          <Badge
            key={tag.id}
            variant="secondary"
            role={clickable ? 'button' : undefined}
            onClick={clickable ? () => onSelectTag!(tag.tagValue.toLowerCase()) : undefined}
            className={`text-xs px-2 py-1 ${clickable ? 'cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors' : ''}`}
          >
            {tag.tagType === 'Hashtag' ? (
              <Hash className="h-3 w-3 mr-1" />
            ) : (
              <AtSign className="h-3 w-3 mr-1" />
            )}
            {tag.tagValue}
          </Badge>
        );
      })}
    </div>
  );
};

// The reshared original, embedded inside a repost. Read-only — its own
// actions live on its standalone card; here it's a clickable preview that
// deep-links to the original post's detail page.
const FeedRepostEmbed = ({ original }: { original: FeedRepostPreview }) => (
  <Link
    to={`/feed/${original.id}`}
    className="mt-3 block rounded-lg border hover:border-primary/50 transition-colors p-3"
  >
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6">
        <AvatarImage src={original.userAvatar} />
        <AvatarFallback className="text-[10px]">
          {original.userName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium">{original.userName}</span>
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(original.createdAt), { addSuffix: true })}
      </span>
    </div>
    {original.content && (
      <p className="text-sm mt-2 whitespace-pre-wrap line-clamp-6">{original.content}</p>
    )}
    <FeedPostMedia media={original.media} />
    <FeedPostLinkPreview
      linkUrl={original.linkUrl}
      linkTitle={original.linkTitle}
      linkDescription={original.linkDescription}
      linkImageUrl={original.linkImageUrl}
    />
  </Link>
);

const FeedPostActions = ({
  post,
  onReact,
  onComment,
  onDelete,
  onEdit,
  onHide,
  onReshare,
}: {
  post: FeedPost;
  // Reaction change: `reactionType` is the new reaction, or null when removed.
  onReact: (postId: string, reactionType: string | null) => void;
  onComment: (postId: string) => void;
  onDelete: (postId: string) => void;
  onEdit: (postId: string, updatedPost: FeedPost) => void;
  onHide: (postId: string) => void;
  onReshare?: (newPost: FeedPost) => void;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reacting, setReacting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [saving, setSaving] = useState(false);

  // Comment thread — loaded on demand the first time the viewer expands it
  // (the feed/list DTO ships an empty comments array to keep the feed query
  // flat). `loaded` distinguishes "no comments" from "not fetched yet".
  const [comments, setComments] = useState<FeedPostComment[]>(post.comments ?? []);
  const [commentsLoaded, setCommentsLoaded] = useState((post.comments ?? []).length > 0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // Reshare composer.
  const [showReshare, setShowReshare] = useState(false);
  const [quote, setQuote] = useState("");
  const [resharing, setResharing] = useState(false);

  const commentCount = commentsLoaded ? comments.length : post.commentCount;

  // React (or change reaction). Optimistic: tell the parent first, then
  // persist; roll back to the previous reaction on failure.
  const handleReact = async (reactionType: string) => {
    if (!user) return;
    const prev = post.currentUserReaction ?? null;
    setReacting(true);
    onReact(post.id, reactionType);
    try {
      await reactToFeedPost(post.id, reactionType);
    } catch {
      onReact(post.id, prev);
      toast({ title: "Could not save your reaction", description: "Please try again.", variant: "destructive" });
    } finally {
      setReacting(false);
    }
  };

  const handleRemoveReaction = async () => {
    if (!user) return;
    const prev = post.currentUserReaction ?? null;
    setReacting(true);
    onReact(post.id, null);
    try {
      await removeFeedPostReaction(post.id);
    } catch {
      onReact(post.id, prev);
      toast({ title: "Could not remove your reaction", description: "Please try again.", variant: "destructive" });
    } finally {
      setReacting(false);
    }
  };

  // Per-comment reaction handling — updates the locally-held comment thread
  // via the shared optimistic helper, then persists.
  const handleCommentReact = async (commentId: string, reactionType: string | null) => {
    if (!user) return;
    setComments((prev) =>
      prev.map((cmt) => (cmt.id === commentId ? applyReactionToComment(cmt, reactionType) : cmt)),
    );
    try {
      if (reactionType) await reactToComment(commentId, reactionType);
      else await removeCommentReaction(commentId);
    } catch {
      toast({ title: "Could not save your reaction", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleComment = async () => {
    const next = !showComments;
    setShowComments(next);
    onComment(post.id);
    if (next && !commentsLoaded) {
      setLoadingComments(true);
      try {
        const loaded = await getPostComments(post.id);
        setComments(loaded);
        setCommentsLoaded(true);
      } catch (err) {
        console.error("Failed to load comments:", err);
      } finally {
        setLoadingComments(false);
      }
    }
  };

  const handleAddComment = async () => {
    if (!user || !newComment.trim()) return;
    setPostingComment(true);
    try {
      const created = await createComment({ feedPostId: post.id, content: newComment.trim() });
      // New comments sort newest-first (matches the API ordering).
      setComments((prev) => [created, ...prev]);
      setCommentsLoaded(true);
      setNewComment("");
    } catch {
      toast({ title: "Could not post comment", description: "Please try again later.", variant: "destructive" });
    } finally {
      setPostingComment(false);
    }
  };

  const handleReshare = async () => {
    if (!user) return;
    setResharing(true);
    try {
      const created = await resharePost(post.id, { content: quote.trim() || undefined });
      toast({ title: quote.trim() ? "Reposted with your comment" : "Reposted to your feed" });
      setShowReshare(false);
      setQuote("");
      onReshare?.(created);
    } catch {
      toast({ title: "Could not repost", description: "Please try again later.", variant: "destructive" });
    } finally {
      setResharing(false);
    }
  };

  const handleHide = () => {
    onHide(post.id);
    toast({ title: "Post hidden", description: "You won't see this post in your feed anymore." });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFeedPost(post.id);
      onDelete(post.id);
      toast({ title: "Post deleted" });
    } catch {
      toast({ title: "Could not delete post", description: "Please try again later.", variant: "destructive" });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleEditSave = async () => {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      const updated = await updateFeedPost(post.id, {
        content: editContent.trim(),
        privacy: post.privacy,
        media: post.media.map((m) => ({
          mediaType: m.mediaType,
          mediaUrl: m.mediaUrl,
          thumbnailUrl: m.thumbnailUrl,
          altText: m.altText,
          displayOrder: m.displayOrder,
        })),
      });
      onEdit(post.id, updated);
      setEditing(false);
      toast({ title: "Post updated" });
    } catch {
      toast({ title: "Could not save changes", description: "Please try again later.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditContent(post.content);
    setEditing(false);
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Inline Edit */}
      {editing && (
        <div className="border rounded-lg p-3 space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full min-h-[80px] px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            disabled={saving}
          />
          <div className="flex justify-end space-x-2">
            <Button size="sm" variant="ghost" onClick={handleEditCancel} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleEditSave} disabled={saving || !editContent.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="border border-red-200 bg-red-50 dark:bg-red-950/20 rounded-lg p-3 flex items-center justify-between">
          <p className="text-sm text-red-600">Delete this post? This can't be undone.</p>
          <div className="flex space-x-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      )}

      {/* Reshare composer — optional quote above the embedded original. */}
      {showReshare && (
        <div className="border rounded-lg p-3 space-y-2">
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Add a comment to your repost (optional)…"
            className="w-full min-h-[70px] px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            disabled={resharing}
          />
          <div className="flex justify-end space-x-2">
            <Button size="sm" variant="ghost" onClick={() => { setShowReshare(false); setQuote(""); }} disabled={resharing}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleReshare} disabled={resharing}>
              {resharing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Repost"}
            </Button>
          </div>
        </div>
      )}

      {/* Engagement summary — reaction mix + counts, LinkedIn-style above
          the action bar. Self-gates: hidden until there's engagement. */}
      {(post.likeCount > 0 || commentCount > 0 || post.repostCount > 0) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
          <ReactionSummaryChips summary={post.reactions} totalCount={post.likeCount} />
          <div className="flex items-center gap-3">
            {commentCount > 0 && (
              <span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span>
            )}
            {post.repostCount > 0 && (
              <span>{post.repostCount} {post.repostCount === 1 ? "repost" : "reposts"}</span>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Professional reactions — quick-tap to Like, hover/long-press to
              pick Celebrate / Support / Insightful / Curious / Funny. */}
          <ReactionPicker
            currentReaction={post.currentUserReaction}
            totalCount={post.likeCount}
            onReact={handleReact}
            onRemove={handleRemoveReaction}
            disabled={reacting || !user}
            showCount={false}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleComment}
            className="text-muted-foreground hover:text-blue-500"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            {commentCount}
          </Button>

          {/* Share — repost to feed + LinkedIn / X / Facebook / WhatsApp /
              Email / copy link / native share. The reusable cross-card
              ShareMenu; "Repost" opens the quote-repost composer below. */}
          <ShareMenu
            url={`${window.location.origin}/feed/${post.id}`}
            title={post.content?.slice(0, 140) || post.userName}
            text={post.content}
            onRepost={user ? () => setShowReshare(true) : undefined}
            count={post.repostCount}
          />
          {/* Canonical moderation report — self-gates (hidden for the
              author, bounces anon to /login) and routes into the admin
              moderation queue with a reason picker. */}
          <ReportAbuseButton
            entityType="feed_post"
            entityId={post.id}
            entityOwnerId={post.userId}
            entityLabel="feed post"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleHide}>Hide Post</DropdownMenuItem>
            {post.userId === user?.id && (
              <>
                <DropdownMenuItem onClick={() => { setEditing(true); setEditContent(post.content); }}>
                  Edit Post
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDelete(true)}>
                  Delete Post
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="border-t pt-4 space-y-3">
          {loadingComments ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading comments…
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet. Be the first.</p>
          ) : (
            comments.map((comment) => (
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
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </p>
                    {/* Comment reactions — same professional set as posts. */}
                    <ReactionPicker
                      size="sm"
                      currentReaction={comment.currentUserReaction}
                      totalCount={comment.reactionCount ?? 0}
                      onReact={(type) => handleCommentReact(comment.id, type)}
                      onRemove={() => handleCommentReact(comment.id, null)}
                      disabled={!user}
                    />
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Add Comment */}
          {user && (
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
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleAddComment();
                    }
                  }}
                  placeholder="Write a comment..."
                  disabled={postingComment}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddComment}
                  disabled={postingComment || !newComment.trim()}
                >
                  {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface FeedPostCardProps {
  post: FeedPost;
  // Reaction change: `reactionType` is the new reaction, or null when removed.
  onReact: (postId: string, reactionType: string | null) => void;
  onComment: (postId: string) => void;
  onDelete: (postId: string) => void;
  onEdit: (postId: string, updatedPost: FeedPost) => void;
  onHide: (postId: string) => void;
  // Hashtag discovery (gap #1829): filter the feed to a clicked hashtag.
  onSelectTag?: (tag: string) => void;
  // Reshare: the parent prepends the new repost to its timeline.
  onReshare?: (newPost: FeedPost) => void;
  // When true, the author/timestamp deep-link to the post detail page
  // (/feed/:id). Off on the detail page itself to avoid a self-link.
  linkToDetail?: boolean;
}

export default function FeedPostCard({ post, onReact, onComment, onDelete, onEdit, onHide, onSelectTag, onReshare, linkToDetail = true }: FeedPostCardProps) {
  const isRepost = Boolean(post.repostOfId);
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
        {/* Repost attribution line — "<name> reposted" above the author row. */}
        {isRepost && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Repeat2 className="h-3.5 w-3.5" />
            <span>{post.userName} reposted</span>
          </div>
        )}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarImage src={post.userAvatar} />
              <AvatarFallback>
                {post.userName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">{post.userName}</p>
                {post.kind === 'article' && (
                  <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                    <FileText className="h-3 w-3" /> Article
                  </Badge>
                )}
              </div>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                {/* Timestamp deep-links to the post detail page so any post
                    (incl. trending) opens its permalink on click. */}
                {linkToDetail ? (
                  <Link to={`/feed/${post.id}`} className="hover:text-primary hover:underline">
                    {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                  </Link>
                ) : (
                  <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                )}
                <span>•</span>
                <div className="flex items-center space-x-1">
                  {getPrivacyIcon()}
                  <span>{getPrivacyText()}</span>
                </div>
              </div>
            </div>
          </div>
          {/* Owner-only insights drawer (impressions + viewer geography).
              Self-gates: renders nothing for non-authors. */}
          <PostStatsSheet post={post} />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Post Content — article posts (gap #1828) render long-form with
            roomier type + line height; everything else stays compact. */}
        {post.content && (
          <div className="prose prose-sm max-w-none">
            <p className={`whitespace-pre-wrap ${post.kind === 'article' ? 'text-[15px] leading-7' : ''}`}>
              {post.content}
            </p>
          </div>
        )}

        {isRepost ? (
          // A repost embeds the original; the resharer's quote (post.content)
          // already rendered above. Fall back to a tombstone when the
          // original was deleted (repostOf absent).
          post.repostOf ? (
            <FeedRepostEmbed original={post.repostOf} />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground italic rounded-lg border border-dashed p-3">
              The original post is no longer available.
            </p>
          )
        ) : post.subjectType === "review" && post.subjectId ? (
          // Polymorphic subject embed — when the post points at a
          // reviewable/promotable thing, render its canonical card here
          // instead of the default link/media block.
          <FeedReviewEmbed reviewId={post.subjectId} embedPayload={post.embedPayload} />
        ) : (
          <>
            <FeedPostLinkPreview
              linkUrl={post.linkUrl}
              linkTitle={post.linkTitle}
              linkDescription={post.linkDescription}
              linkImageUrl={post.linkImageUrl}
            />

            <FeedPostMedia media={post.media} />

            <FeedPostTags tags={post.tags} onSelectTag={onSelectTag} />
          </>
        )}

        {/* Actions */}
        <FeedPostActions
          post={post}
          onReact={onReact}
          onComment={onComment}
          onDelete={onDelete}
          onEdit={onEdit}
          onHide={onHide}
          onReshare={onReshare}
        />
      </CardContent>
    </Card>
  );
}