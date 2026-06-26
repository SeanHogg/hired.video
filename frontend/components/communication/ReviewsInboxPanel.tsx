/**
 * ReviewsInboxPanel — the "Reviews" tab body of the Communication Hub.
 *
 * Lists the viewer's feedback engagements (reviews they own + reviews assigned
 * to them) from `useMyReviews`. Clicking a row opens the review surface. Pure
 * presentation over the hook; mounts lazily inside the open hub overlay.
 */
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageSquare, Inbox as InboxIcon, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMyReviews, type ReviewInboxEntry } from "@/hooks/use-my-reviews";

function safeRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function ReviewRow({
  entry,
  onOpen,
}: {
  entry: ReviewInboxEntry;
  onOpen: (entry: ReviewInboxEntry) => void;
}) {
  const { t } = useTranslation();
  const roleLabel =
    entry.role === "owner" ? t("reviews.roleOwner") : t("reviews.roleReviewer");
  const subtitle =
    entry.role === "owner"
      ? entry.counterparty
        ? t("reviews.fromReviewer", { name: entry.counterparty })
        : t("reviews.awaitingReviewer")
      : t("reviews.requestedOfYou");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(entry);
        }
      }}
      className={cn(
        "group flex items-start gap-3 border-b px-3 py-3 last:border-b-0 cursor-pointer transition-colors hover:bg-muted/50",
        entry.actionable && "bg-primary/5",
      )}
    >
      <div className="mt-0.5 shrink-0">
        <MessageSquare className="h-4 w-4 text-brand-purple" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide font-semibold border rounded px-1.5 py-0.5 bg-purple-100 text-purple-700 border-purple-200">
            {roleLabel}
          </span>
          <span className="truncate text-sm font-medium">
            {entry.title || t("reviews.untitled")}
          </span>
          {entry.actionable && (
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label={t("reviews.needsYou")} />
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">{subtitle}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="h-4 px-1 text-[10px] capitalize">
            {entry.status}
          </Badge>
          {entry.totalCount > 0 && (
            <span>{t("reviews.commentCount", { count: entry.totalCount })}</span>
          )}
          <span>· {safeRelativeTime(entry.updatedAt)}</span>
        </div>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </div>
  );
}

export interface ReviewsInboxPanelProps {
  heightClassName?: string;
  onClose?: () => void;
}

export function ReviewsInboxPanel({
  heightClassName = "max-h-[70vh] md:max-h-[32rem]",
  onClose,
}: ReviewsInboxPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { entries, isLoading } = useMyReviews();

  const open = (entry: ReviewInboxEntry) => {
    navigate(`/resume-review/${entry.id}`);
    onClose?.();
  };

  return (
    <div className={cn("flex flex-col overflow-hidden", heightClassName)}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <InboxIcon className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t("reviews.empty")}</p>
          </div>
        ) : (
          <div>
            {entries.map((entry) => (
              <ReviewRow key={entry.id} entry={entry} onOpen={open} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReviewsInboxPanel;
