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
import { ReconnectMailboxBanner } from "@/components/email/ReconnectMailbox";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { HubItem, HubItemKind, UseCommHubReturn } from "@/hooks/use-comm-hub";

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
    case "contact_inquiry":
      // Inbound visitor inquiry from the shared ContactPanel — landed via
      // POST /api/marketing/contact and notified every super_admin. Render
      // with a distinct purple chat-bubble so triage row stands out vs the
      // generic blue info notification.
      return <MessageCircle className="h-4 w-4 text-brand-purple" />;
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
  /** Optional — when supplied, clicking an external_email or notification
   *  row delegates to this callback INSTEAD of the default mark-read
   *  behaviour. Used by the page-tab to open the slide-out detail sheet. */
  onSelect?: (item: HubItem) => void;
  /** Per-row dismiss — surfaces as a hover X on notifications + emails.
   *  No-op when not supplied. */
  onDismissNotification?: (id: string) => void;
  onDismissExternalEmail?: (id: string) => void;
  /** Selection mode — when true, render a leading checkbox in place of
   *  the kind icon and let the parent track selectedIds. */
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelected?: (id: string) => void;
}

function InboxRow({
  item,
  onClose,
  onOpenMessage,
  onMarkNotificationRead,
  onAcceptRequest,
  onDeclineRequest,
  onMarkExternalEmailRead,
  onSelect,
  onDismissNotification,
  onDismissExternalEmail,
  selectionMode = false,
  isSelected = false,
  onToggleSelected,
}: RowProps) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelected?.(item.id);
      return;
    }
    if (onSelect) {
      onSelect(item);
      if (item.kind === "notification" && item.notificationId && !item.isRead) {
        onMarkNotificationRead(item.notificationId);
      } else if (item.kind === "external_email" && item.externalEmailId && !item.isRead) {
        onMarkExternalEmailRead(item.externalEmailId);
      }
      return;
    }
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
    selectionMode ||
    !!onSelect ||
    item.kind === "message" ||
    item.kind === "notification" ||
    item.kind === "external_email";

  const canDismiss =
    (item.kind === "notification" && !!onDismissNotification) ||
    (item.kind === "external_email" && !!onDismissExternalEmail);

  const handleDismiss = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (item.kind === "notification" && item.notificationId) {
      onDismissNotification?.(item.notificationId);
    } else if (item.kind === "external_email" && item.externalEmailId) {
      onDismissExternalEmail?.(item.externalEmailId);
    }
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-3 py-3 border-b last:border-b-0 transition-colors",
        isClickable && "cursor-pointer hover:bg-muted/50",
        !item.isRead && "bg-primary/5",
        isSelected && "bg-primary/10",
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
      {selectionMode ? (
        <div className="shrink-0 mt-0.5">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelected?.(item.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${item.title}`}
          />
        </div>
      ) : (
        <div className="shrink-0 mt-0.5">{iconForItem(item)}</div>
      )}

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

        {/* #539 — when an external email is linked to a job, surface
            "→ Senior Engineer at Acme" below the preview so the user
            sees WHICH job an email is bound to without clicking through.
            Hidden when the dto didn't carry a title (linkedJob deleted,
            or older row from before the join landed). */}
        {item.kind === "external_email" && item.linkedJobTitle && (
          <p className="text-xs text-emerald-700 mt-1 truncate">
            → {item.linkedJobTitle}
            {item.linkedJobCompany ? ` at ${item.linkedJobCompany}` : ""}
          </p>
        )}

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

      {canDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={handleDismiss}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleDismiss(e);
            }
          }}
          className="shrink-0 ml-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity rounded p-1 hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export interface InboxPanelProps {
  /** Hub providing the items + actions. The popover surface passes the
   *  shared unfiltered hub; the page-tab passes its filter-aware hub.
   *  Required so this component stays pure presentation — no implicit
   *  fetch lives in here. */
  hub: UseCommHubReturn;
  /** Called after a row action that should close the hosting surface
   *  (popover/sheet). Omit when rendering inline on a page. */
  onClose?: () => void;
  /** Height class — caller owns layout. Defaults to the overlay cap. */
  heightClassName?: string;
  /** Hide the header (title + mark-all-read) when the host already has one. */
  hideHeader?: boolean;
  /** Page-tab only — open the detail sheet on item click instead of the
   *  default mark-read behaviour. The detail sheet is rendered by the
   *  parent so this component stays composable. */
  onItemSelect?: (item: HubItem) => void;
  /** Page-tab only — when supplied, every dismissable row renders a
   *  leading checkbox and the row click toggles selection. */
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string) => void;
  /** Selected row id (for highlight when the detail sheet is open). */
  highlightedId?: string | null;
  /** Slot for caller-provided toolbar UI (filter chips, bulk action bar,
   *  sync button) — rendered above the scroll area so the list stays in
   *  one component. */
  toolbar?: React.ReactNode;
}

export function InboxPanel({
  hub,
  onClose,
  // Default is a content-driven cap suited to the header popover, where
  // the host (Radix Popover) has no enforced height — the panel grows
  // with content up to the cap, then scrolls inside. Page-tab callers
  // pass an explicit `h-[…]` height because their card has no height
  // ancestor for `h-full` to resolve against.
  heightClassName = "max-h-[70vh] md:max-h-[32rem]",
  hideHeader = false,
  onItemSelect,
  selectionMode = false,
  selectedIds,
  onToggleSelected,
  highlightedId,
  toolbar,
}: InboxPanelProps) {
  const {
    items,
    unreadCount,
    isLoading,
    hasMoreEmails,
    isLoadingMoreEmails,
    loadMoreEmails,
    markAllRead,
    openMessage,
    markNotificationRead,
    dismissNotification,
    acceptRequest,
    declineRequest,
    markExternalEmailRead,
    dismissExternalEmail,
  } = hub;

  return (
    // No `h-full` here — the wrappers above (CardContent on the page-tab,
    // Radix Popover on the header dropdown) don't fix a height for it to
    // resolve against, so it would silently collapse to `auto` and leave
    // the scroll area unable to constrain its children. Heights come
    // from `heightClassName` instead.
    <div className={cn("flex flex-col overflow-hidden", heightClassName)}>
      {/* #915 — Self-gating mailbox reconnect banner. Returns null when
          no accounts are in `error` state, so the popover + page-tab
          surfaces both mount it unconditionally per the DRY rule. */}
      <ReconnectMailboxBanner
        accounts={hub.accounts ?? []}
        redirect={typeof window !== "undefined" ? window.location.pathname + window.location.search : "/settings?tab=email"}
      />
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


      {toolbar}

      <ScrollArea className="flex-1 min-h-0">
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
                onSelect={onItemSelect}
                onDismissNotification={dismissNotification}
                onDismissExternalEmail={dismissExternalEmail}
                selectionMode={selectionMode}
                isSelected={
                  highlightedId === item.id ||
                  (selectedIds?.has(item.id) ?? false)
                }
                onToggleSelected={onToggleSelected}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <InboxPaginationFooter
        loadedCount={items.length}
        hasMore={hasMoreEmails}
        isLoading={isLoadingMoreEmails}
        onLoadMore={loadMoreEmails}
      />
    </div>
  );
}

/** Fixed footer mounted below the scroll area — always visible so the
 *  user never has to scroll to the bottom of a tall list to see (or
 *  reach) the pagination control. Shows the loaded-row count on the
 *  left and the cursor-paged "Older emails…" trigger on the right;
 *  the button is disabled when there are no more pages so the
 *  pagination state is always communicated either way. Returns null
 *  only when the list is genuinely empty (the empty-state inside the
 *  scroll area is already explanation enough). */
function InboxPaginationFooter({
  loadedCount,
  hasMore,
  isLoading,
  onLoadMore,
}: {
  loadedCount: number;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  if (loadedCount === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t bg-muted/20 shrink-0">
      <span className="text-[11px] text-muted-foreground">
        {hasMore
          ? `${loadedCount} loaded`
          : `${loadedCount} ${loadedCount === 1 ? "item" : "items"}`}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        disabled={!hasMore || isLoading}
        onClick={() => onLoadMore()}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            Loading…
          </>
        ) : hasMore ? (
          "Older emails →"
        ) : (
          "No more"
        )}
      </Button>
    </div>
  );
}

export default InboxPanel;
