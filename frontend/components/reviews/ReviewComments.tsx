/**
 * Threaded comments under a single review. Top-level comments are
 * shown in `parent_id IS NULL`; replies nest under their parent (one
 * level deep visually, deeper threading is allowed by the schema but
 * collapsed for v1). The subject's owner gets a highlighted badge so
 * "company says:" / "creator says:" reads naturally.
 *
 * This component will also be the comment surface used when a review
 * gets surfaced in the dashboard /feed (Phase B); the data layer is
 * the same regardless of where the comment is rendered.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Trash2 } from "lucide-react";
import { reviewService, type ReviewComment } from "@/lib/services/review-service";
import { useAuth } from "@/lib/auth";

interface ReviewCommentsProps {
  reviewId: string;
}

function formatDate(value: string | Date): string {
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ReviewComments({ reviewId }: ReviewCommentsProps) {
  const { user, isAuthenticated } = useAuth();
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reviewService
      .listComments(reviewId)
      .then((items) => {
        if (!cancelled) setComments(items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  const submit = async () => {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      const saved = await reviewService.addComment(reviewId, draft.trim(), replyTo);
      setComments((prev) => [...prev, saved]);
      setDraft("");
      setReplyTo(null);
    } catch (err: any) {
      toast({
        title: "Couldn't post comment",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await reviewService.deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      toast({
        title: "Couldn't delete",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  // Group by parent. Top-level comments first, then their direct replies.
  const topLevel = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    if (!c.parentId) continue;
    const arr = repliesByParent.get(c.parentId) ?? [];
    arr.push(c);
    repliesByParent.set(c.parentId, arr);
  }

  return (
    <div className="border-t pt-3 mt-2 space-y-3">
      {loading && <p className="text-xs text-muted-foreground">Loading comments…</p>}

      {!loading && topLevel.length === 0 && (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      )}

      {topLevel.map((c) => (
        <div key={c.id} className="space-y-2">
          <CommentRow
            comment={c}
            currentUserId={user?.id ?? null}
            onReply={() => setReplyTo(c.id)}
            onDelete={() => remove(c.id)}
          />
          {(repliesByParent.get(c.id) ?? []).map((reply) => (
            <div key={reply.id} className="ml-6">
              <CommentRow
                comment={reply}
                currentUserId={user?.id ?? null}
                onDelete={() => remove(reply.id)}
              />
            </div>
          ))}
        </div>
      ))}

      {isAuthenticated && (
        <div className="space-y-2 pt-2">
          {replyTo && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              Replying to a comment
              <button
                type="button"
                className="underline"
                onClick={() => setReplyTo(null)}
              >
                cancel
              </button>
            </div>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            maxLength={4000}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={submitting || !draft.trim()}>
              {submitting ? "Posting…" : replyTo ? "Post reply" : "Post comment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CommentRowProps {
  comment: ReviewComment;
  currentUserId: string | null;
  onReply?: () => void;
  onDelete: () => void;
}

function CommentRow({ comment, currentUserId, onReply, onDelete }: CommentRowProps) {
  const canDelete = currentUserId !== null && comment.userId === currentUserId;
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 mb-1">
        {comment.isSubjectOwner && (
          <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
            Owner reply
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
        {onReply && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline ml-auto"
            onClick={onReply}
          >
            Reply
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label="Delete comment"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="whitespace-pre-line">{comment.body}</p>
    </div>
  );
}
