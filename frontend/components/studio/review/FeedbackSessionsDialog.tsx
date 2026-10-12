/**
 * FeedbackSessionsDialog — the owner's per-resume feedback-session manager.
 *
 * Opened from the "Get feedback" button on the resume detail. Lists every
 * review/feedback session on THIS resume (open share links, reviewers who are
 * annotating, feedback handed back, and closed/cancelled sessions) so the owner
 * can see what's outstanding instead of blindly minting a new share link on
 * every click. Per session the owner can open it, copy its share link, and
 * close or cancel it. From here they can also start a fresh share link or open
 * the invite-reviewers flow.
 *
 * Owner-scoped read via `resumeFeedbackService.listResumeReviews`; the backend
 * filters to the caller so a non-owner sees nothing.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  MessageSquare,
  Inbox as InboxIcon,
  Copy,
  ArrowRight,
  Link2,
  UserPlus,
  X,
  CheckCircle2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { safeRelativeTime } from "@/lib/relative-time";
import { useToast } from "@/hooks/use-toast";
import { resumeFeedbackService } from "@/lib/services/resume-feedback-service";
import type { ResumeReviewDTO, ReviewStatus } from "@shared/resume-feedback";
import InviteReviewersDialog from "./InviteReviewersDialog";

interface FeedbackSessionsDialogProps {
  resumeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Badge tone per lifecycle status — drawn from theme tokens so both themes read. */
const STATUS_VARIANT: Record<ReviewStatus, "default" | "secondary" | "outline"> = {
  pending: "outline",
  active: "secondary",
  submitted: "default",
  completed: "outline",
  cancelled: "outline",
};

/** A session still in flight (owner may copy its link / cancel it). */
function isLive(status: ReviewStatus): boolean {
  return status === "pending" || status === "active" || status === "submitted";
}

function shareUrlFor(token: string | undefined): string | null {
  if (!token || typeof window === "undefined") return null;
  return `${window.location.origin}/r/${token}`;
}

function SessionRow({
  review,
  onOpen,
  onCopy,
  onCancel,
  onComplete,
  busy,
}: {
  review: ResumeReviewDTO;
  onOpen: (r: ResumeReviewDTO) => void;
  onCopy: (r: ResumeReviewDTO) => void;
  onCancel: (r: ResumeReviewDTO) => void;
  onComplete: (r: ResumeReviewDTO) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const counterparty =
    review.reviewerName || review.reviewerEmail || t("feedbackSessions.awaitingReviewer");
  const open = review.openAnnotationCount ?? 0;
  const total = review.totalAnnotationCount ?? 0;
  const needsOwner = review.status === "submitted" || open > 0;
  const link = shareUrlFor(review.shareToken);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 transition-colors",
        needsOwner ? "border-brand-primary/40 bg-brand-primary/5" : "hover:bg-muted/40",
      )}
    >
      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[review.status]} className="h-5 px-1.5 text-[10px] capitalize">
            {t(`feedbackSessions.status.${review.status}`)}
          </Badge>
          <span className="truncate text-sm font-medium">{counterparty}</span>
          {needsOwner && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-primary"
              aria-label={t("feedbackSessions.needsYou")}
            />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{t("feedbackSessions.commentCount", { count: total })}</span>
          {open > 0 && <span>· {t("feedbackSessions.openCount", { count: open })}</span>}
          <span>· {safeRelativeTime(review.updatedAt)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => onOpen(review)}
          >
            {t("feedbackSessions.open")} <ArrowRight className="h-3 w-3" />
          </Button>
          {link && isLive(review.status) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => onCopy(review)}
            >
              <Copy className="h-3 w-3" /> {t("feedbackSessions.copyLink")}
            </Button>
          )}
          {review.status === "submitted" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              disabled={busy}
              onClick={() => onComplete(review)}
            >
              <CheckCircle2 className="h-3 w-3" /> {t("feedbackSessions.markComplete")}
            </Button>
          )}
          {isLive(review.status) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => onCancel(review)}
            >
              <X className="h-3 w-3" /> {t("feedbackSessions.cancel")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FeedbackSessionsDialog({
  resumeId,
  open,
  onOpenChange,
}: FeedbackSessionsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<ResumeReviewDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await resumeFeedbackService.listResumeReviews(resumeId));
    } catch {
      toast({ title: t("feedbackSessions.loadFailed"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [resumeId, t, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const copyLink = async (review: ResumeReviewDTO) => {
    const link = shareUrlFor(review.shareToken);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: t("feedbackSessions.linkCopied"), description: t("feedbackSessions.linkCopiedHint") });
    } catch {
      toast({ title: t("feedbackSessions.copyFailed"), description: link, variant: "destructive" });
    }
  };

  const createLink = async () => {
    setCreating(true);
    try {
      const created = await resumeFeedbackService.createReview({ resumeId, source: "self_share" });
      await copyLink(created);
      await load();
    } catch {
      toast({ title: t("feedbackSessions.createFailed"), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const cancelSession = async (review: ResumeReviewDTO) => {
    setBusyId(review.id);
    try {
      await resumeFeedbackService.cancelReview(review.id);
      await load();
    } catch {
      toast({ title: t("feedbackSessions.actionFailed"), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const completeSession = async (review: ResumeReviewDTO) => {
    setBusyId(review.id);
    try {
      await resumeFeedbackService.completeReview(review.id);
      await load();
    } catch {
      toast({ title: t("feedbackSessions.actionFailed"), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const openSession = (review: ResumeReviewDTO) => {
    onOpenChange(false);
    navigate(`/resume-review/${review.id}`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("feedbackSessions.title")}</DialogTitle>
            <DialogDescription>{t("feedbackSessions.subtitle")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={creating} onClick={createLink}>
              {creating ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-1.5 h-4 w-4" />
              )}
              {t("feedbackSessions.createLink")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              {t("feedbackSessions.invite")}
            </Button>
          </div>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {loading && sessions.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <InboxIcon className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{t("feedbackSessions.empty")}</p>
              </div>
            ) : (
              sessions.map((review) => (
                <SessionRow
                  key={review.id}
                  review={review}
                  onOpen={openSession}
                  onCopy={copyLink}
                  onCancel={cancelSession}
                  onComplete={completeSession}
                  busy={busyId === review.id}
                />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <InviteReviewersDialog
        resumeId={resumeId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => {
          setInviteOpen(false);
          void load();
        }}
      />
    </>
  );
}
