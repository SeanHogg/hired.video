/**
 * InboxPanel — the unified Communication Hub inbox body.
 *
 * Single source of truth for rendering the merged feed of messages,
 * notifications, and connection requests. Consumed by:
 *   • CommunicationHub (header Popover/Sheet overlay)
 *   • /outreach "Inbox" tab (primary home)
 *
 * Data is owned by the `useCommHub` hook; this component is pure presentation
 * plus local busy state for per-row actions. It accepts an optional
 * `heightClassName` so callers control whether the panel is capped
 * (overlay) or fills its container (page tab).
 */

import { useState } from "react";
import {
  MessageCircle,
  UserPlus,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Briefcase,
  Check,
  X,
  Loader2,
  Mail,
} from "lucide-react";
import { InboxEmptyState } from "@/components/email/InboxEmptyState";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useCommHub, type HubItem, type HubItemKind } from "@/hooks/use-comm-hub";

const KIND_LABEL: Record<HubItemKind, string> = {
  message: "Message",
  notification: "Notification",
  request: "Request",
  external_email: "Email",
};

const KIND_BADGE_CLASS: Record<HubItemKind, string> = {
  message: "bg-blue-100 text-blue-700 border-blue-200",
  notification: "bg-amber-100 text-amber-700 border-amber-200",
  request: "bg-purple-100 text-purple-700 border-purple-200",
  external_email: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

function iconForItem(item: HubItem) {
  if (item.kind === "message") return <MessageCircle className="h-4 w-4 text-blue-500" />;
  if (item.kind === "request") return <UserPlus className="h-4 w-4 text-purple-500" />;
  if (item.kind === "external_email") {
    // Linked-job emails are recognised as job-flow events.
    if (item.linkedJobId || item.category === "job_opportunity" || item.category === "application_status") {
      return <Briefcase className="h-4 w-4 text-emerald-600" />;
    }
    return <Mail className="h-4 w-4 text-emerald-600" />;
  }
  switch (item.iconType) {
    case "success":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "job_application":
      return <Briefcase className="h-4 w-4 text-blue-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function safeRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

interface RowProps {
  item: HubItem;
  onClose?: () => void;
  onOpenMessage: (conversationId: string) => void;
  onMarkNotificationRead: (id: string) => void;
  onAcceptRequest: (id: string) => void;
  onDeclineRequest: (id: string) => void;
  onMarkExternalEmailRead: (id: string) => void;
}

function InboxRow({
  item,
  onClose,
  onOpenMessage,
  onMarkNotificationRead,
  onAcceptRequest,
  onDeclineRequest,
  onMarkExternalEmailRead,
}: RowProps) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const handleClick = () => {
    if (item.kind === "message" && item.conversationId) {
      onOpenMessage(item.conversationId);
      onClose?.();
    } else if (item.kind === "notification" && item.notificationId && !item.isRead) {
      onMarkNotificationRead(item.notificationId);
    } else if (item.kind === "external_email" && item.externalEmailId && !item.isRead) {
      onMarkExternalEmailRead(item.externalEmailId);
    }
  };

  const isClickable =
    item.kind === "message" ||
    item.kind === "notification" ||
    item.kind === "external_email";

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-3 border-b last:border-b-0 transition-colors",
        isClickable && "cursor-pointer hover:bg-muted/50",
        !item.isRead && "bg-primary/5",
      )}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      <div className="shrink-0 mt-0.5">{iconForItem(item)}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-[10px] uppercase tracking-wide font-semibold border rounded px-1.5 py-0.5",
              KIND_BADGE_CLASS[item.kind],
            )}
          >
            {KIND_LABEL[item.kind]}
          </span>
          {item.kind === "external_email" && item.accountLabel && (
            <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">
              {item.provider ? `${item.provider} · ${item.accountLabel}` : item.accountLabel}
            </span>
          )}
          {item.kind === "external_email" && item.category && (
            <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
              {item.category.replace(/_/g, " ")}
            </span>
          )}
          <span
            className={cn(
              "text-sm font-medium truncate",
              item.isRead ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {item.title}
          </span>
          {!item.isRead && (
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
          )}
        </div>

        <p
          className={cn(
            "text-sm mt-0.5 line-clamp-2",
            item.isRead ? "text-muted-foreground" : "text-foreground/80",
          )}
        >
          {item.preview}
        </p>

        <p className="text-xs text-muted-foreground mt-1">
          {safeRelativeTime(item.timestamp)}
        </p>

        {item.kind === "request" && item.connectionId && (
          <div className="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              className="h-8 px-3"
              disabled={busy !== null}
              onClick={async (e) => {
                e.stopPropagation();
                setBusy("accept");
                await onAcceptRequest(item.connectionId!);
              }}
            >
              {busy === "accept" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1" />
              )}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3"
              disabled={busy !== null}
              onClick={async (e) => {
                e.stopPropagation();
                setBusy("decline");
                await onDeclineRequest(item.connectionId!);
              }}
            >
              {busy === "decline" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5 mr-1" />
              )}
              Decline
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export interface InboxPanelProps {
  /** Optional injected hub — lets callers share one `useCommHub()` instance
   *  (e.g. Outreach page reusing counts on the Dashboard tab). */
  hub?: ReturnType<typeof useCommHub>;
  /** Called after a row action that should close the hosting surface
   *  (popover/sheet). Omit when rendering inline on a page. */
  onClose?: () => void;
  /** Height class — caller owns layout. Defaults to the overlay cap. */
  heightClassName?: string;
  /** Hide the header (title + mark-all-read) when the host already has one. */
  hideHeader?: boolean;
}

export function InboxPanel({
  hub: injectedHub,
  onClose,
  heightClassName = "max-h-[70vh] md:max-h-[32rem]",
  hideHeader = false,
}: InboxPanelProps) {
  const ownHub = useCommHub();
  const hub = injectedHub ?? ownHub;

  const {
    items,
    unreadCount,
    isLoading,
    markAllRead,
    openMessage,
    markNotificationRead,
    acceptRequest,
    declineRequest,
    markExternalEmailRead,
  } = hub;

  return (
    <div className={cn("flex flex-col h-full", heightClassName)}>
      {!hideHeader && (
        <div className="flex items-center justify-between px-3 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">Inbox</h2>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </div>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              className="text-xs h-7"
            >
              Mark all read
            </Button>
          )}
        </div>
      )}


      <ScrollArea className="flex-1">
        {isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <InboxEmptyState />
        ) : (
          <div>
            {items.map((item) => (
              <InboxRow
                key={item.id}
                item={item}
                onClose={onClose}
                onOpenMessage={openMessage}
                onMarkNotificationRead={markNotificationRead}
                onAcceptRequest={acceptRequest}
                onDeclineRequest={declineRequest}
                onMarkExternalEmailRead={markExternalEmailRead}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default InboxPanel;
