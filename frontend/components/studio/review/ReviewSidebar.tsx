/**
 * ReviewSidebar — the feedback rail for the resume review surface (#1947).
 *
 * Lists every annotation (sticky note / highlight / comment) with status
 * filtering, the owner's accept / dismiss / resolve controls, per-annotation
 * suggested-edit diffs the owner can apply, the reviewer-proposed full drafts
 * the owner can accept/reject, and the composer for new general comments. The
 * lifecycle actions (reviewer "submit", owner "complete"/"cancel") live in the
 * footer. All mutations go through the shared `useResumeReview` hook, so this
 * component holds no fetch logic of its own.
 */
import { useMemo, useState } from "react";
import {
  Check,
  MessageSquare,
  StickyNote,
  Trash2,
  Highlighter,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ResumeReviewDetailDTO,
  ResumeReviewAnnotationDTO,
  AnnotationStatus,
} from "@shared/resume-feedback";
import type { UseResumeReview } from "@/hooks/use-resume-review";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import InviteReviewersDialog from "@/components/studio/review/InviteReviewersDialog";

interface ReviewSidebarProps {
  detail: ResumeReviewDetailDTO;
  review: UseResumeReview;
  /** Logged-in user id, to gate author-only edit/delete (null for token guests). */
  currentUserId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onFlash: (annotation: ResumeReviewAnnotationDTO) => void;
  onStartSticky: () => void;
  /** Owner only — copyable reviewer share link. */
  shareUrl?: string;
  /** Owner: called after the review is marked complete (so the page can
   *  navigate the owner back to their resume). */
  onAfterComplete?: () => void;
}

const STATUS_FILTERS: { key: "all" | AnnotationStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "accepted", label: "Accepted" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
];

const KIND_ICON = {
  sticky_note: StickyNote,
  highlight: Highlighter,
  comment: MessageSquare,
} as const;

const STATUS_VARIANT: Record<AnnotationStatus, "default" | "secondary" | "outline"> = {
  open: "default",
  accepted: "secondary",
  resolved: "outline",
  dismissed: "outline",
};

function isActiveReview(detail: ResumeReviewDetailDTO): boolean {
  return detail.review.status !== "completed" && detail.review.status !== "cancelled";
}

export default function ReviewSidebar({
  detail,
  review,
  currentUserId,
  selectedId,
  onSelect,
  onFlash,
  onStartSticky,
  shareUrl,
  onAfterComplete,
}: ReviewSidebarProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | AnnotationStatus>("all");
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { isOwner, busy } = review;
  const canAnnotate = isActiveReview(detail);

  const visible = useMemo(() => {
    const list = detail.annotations.filter((a) => !a.parentAnnotationId);
    return filter === "all" ? list : list.filter((a) => a.status === filter);
  }, [detail.annotations, filter]);

  const openCount = detail.annotations.filter((a) => a.status === "open").length;

  const addComment = async () => {
    const body = comment.trim();
    if (!body) return;
    setComment("");
    await review.createAnnotation({ kind: "comment", body, anchor: { type: "general" } });
  };

  const accept = async (a: ResumeReviewAnnotationDTO) => {
    const { appliedEdit } = await review.acceptAnnotation(a.id);
    toast({
      title: "Accepted",
      description: appliedEdit
        ? "The suggested edit was applied to your resume."
        : "Marked as accepted.",
    });
  };

  const reviewerLabel = detail.review.reviewerName || detail.review.reviewerEmail;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {detail.review.title || "Resume feedback"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {openCount} open · {detail.annotations.length} total
            </p>
          </div>
          <Badge variant="outline" className="capitalize">{detail.review.status}</Badge>
        </div>

        {/* Who's reviewing (owner-facing attribution). */}
        {isOwner && reviewerLabel && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("review.reviewerLine", { name: reviewerLabel })}
          </p>
        )}

        {isOwner && canAnnotate && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="mr-1 h-3 w-3" /> {t("reviewInvite.openButton")}
          </Button>
        )}

        {isOwner && (
          <InviteReviewersDialog
            resumeId={detail.resume.id}
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            shareUrl={shareUrl}
          />
        )}

        {detail.review.message && (
          <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
            “{detail.review.message}”
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1 border-b p-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Annotation list */}
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {visible.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            No feedback here yet.
          </p>
        )}
        {visible.map((a) => {
          const Icon = KIND_ICON[a.kind];
          const selected = a.id === selectedId;
          const mine = currentUserId != null && a.authorId === currentUserId;
          return (
            <div
              key={a.id}
              className={`rounded-lg border p-3 text-sm transition ${
                selected ? "border-brand-primary ring-1 ring-brand-primary" : ""
              } ${a.status === "dismissed" ? "opacity-60" : ""}`}
              onClick={() => {
                onSelect(selected ? null : a.id);
                if (a.anchor.type === "content" && a.anchor.quote) onFlash(a);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {mine ? t("review.you") : a.authorName || t("review.reviewer")}
                  </span>
                </span>
                <Badge variant={STATUS_VARIANT[a.status]} className="shrink-0 text-[10px] capitalize">
                  {a.status}
                </Badge>
              </div>

              {a.anchor.type === "content" && a.anchor.quote && (
                <blockquote className="mt-2 border-l-2 border-amber-400 pl-2 text-xs italic text-muted-foreground">
                  “{a.anchor.quote}”
                </blockquote>
              )}

              {editing?.id === a.id ? (
                <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <Textarea
                    value={editing.body}
                    onChange={(e) => setEditing({ id: a.id, body: e.target.value })}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        await review.editAnnotationBody(a.id, editing.body.trim());
                        setEditing(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap">{a.body}</p>
              )}

              {a.suggestedEdit && (
                <div className="mt-2 rounded-md bg-muted p-2 text-xs">
                  <p className="mb-1 font-medium text-muted-foreground">Suggested edit</p>
                  {a.suggestedEdit.before && (
                    <p className="rounded bg-diff-removed px-1 text-diff-removed-foreground line-through">{a.suggestedEdit.before}</p>
                  )}
                  <p className="rounded bg-diff-added px-1 text-diff-added-foreground">{a.suggestedEdit.after}</p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                {isOwner && a.status === "open" && (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => accept(a)}>
                      <Check className="mr-1 h-3 w-3" />
                      {a.suggestedEdit ? "Accept edit" : "Accept"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => review.setAnnotationStatus(a.id, "resolved")}
                    >
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => review.setAnnotationStatus(a.id, "dismissed")}
                    >
                      Dismiss
                    </Button>
                  </>
                )}
                {!isOwner && mine && a.status === "open" && canAnnotate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing({ id: a.id, body: a.body })}
                  >
                    Edit
                  </Button>
                )}
                {(isOwner || mine) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => review.deleteAnnotation(a.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Proposed drafts (owner accept/reject) */}
        {detail.proposals.length > 0 && (
          <div className="mt-4 rounded-lg border p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Proposed drafts</p>
            {detail.proposals.map((p) => (
              <div key={p.versionId} className="flex items-center justify-between gap-2 py-1 text-sm">
                <span className="truncate">
                  {p.label || "Full draft"}{" "}
                  <span className="text-xs capitalize text-muted-foreground">· {p.proposalStatus}</span>
                </span>
                {isOwner && p.proposalStatus === "proposed" && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => review.acceptProposal(p.versionId)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => review.rejectProposal(p.versionId)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer + lifecycle footer */}
      {canAnnotate && (
        <div className="space-y-2 border-t p-3">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a general comment…"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={busy || !comment.trim()} onClick={addComment}>
              <MessageSquare className="mr-1 h-3 w-3" /> Comment
            </Button>
            <Button size="sm" variant="outline" onClick={onStartSticky}>
              <StickyNote className="mr-1 h-3 w-3" /> Sticky
            </Button>
          </div>

          <div className="flex gap-2 pt-1">
            {!isOwner ? (
              <Button
                size="sm"
                variant="default"
                className="flex-1"
                disabled={busy}
                onClick={async () => {
                  await review.submitReview();
                  toast({
                    title: t("review.feedbackSent"),
                    description: t("review.feedbackSentHint"),
                  });
                }}
              >
                <Send className="mr-1 h-3 w-3" /> {t("review.submitFeedback")}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={async () => {
                    await review.completeReview();
                    onAfterComplete?.();
                  }}
                >
                  {t("review.complete")}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => review.cancelReview()}>
                  {t("review.cancel")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
