/**
 * CommunicationHub — single global inbox surface mounted in the header.
 *
 * Replaces the dead NotificationCenter, the dashboard "Messages" widget,
 * and the per-page ChatPanel "Messaging" floating button. Renders one
 * chronologically-merged feed of three streams:
 *
 *   • Direct messages         (kind = "message")
 *   • System notifications    (kind = "notification")
 *   • Connection requests     (kind = "request")
 *
 * Each row carries a coloured kind label so users can scan the merged feed
 * and immediately tell which surface an item came from.
 *
 * Layout:
 *   - md and up → Popover anchored to the bell button
 *   - mobile    → full-height left Sheet (same a11y pattern as the Studio drawer)
 */

import { useState } from "react";
import {
  Bell,
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useCommHub, type HubItem, type HubItemKind } from "@/hooks/use-comm-hub";

// ─── Kind labels ────────────────────────────────────────────────────────────
//
// Each row carries one of these so the merged feed remains scannable.

const KIND_LABEL: Record<HubItemKind, string> = {
  message: "Message",
  notification: "Notification",
  request: "Request",
};

const KIND_BADGE_CLASS: Record<HubItemKind, string> = {
  message: "bg-blue-100 text-blue-700 border-blue-200",
  notification: "bg-amber-100 text-amber-700 border-amber-200",
  request: "bg-purple-100 text-purple-700 border-purple-200",
};

function iconForItem(item: HubItem) {
  if (item.kind === "message") return <MessageCircle className="h-4 w-4 text-blue-500" />;
  if (item.kind === "request") return <UserPlus className="h-4 w-4 text-purple-500" />;
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

// ─── Single row ─────────────────────────────────────────────────────────────

interface RowProps {
  item: HubItem;
  onClose: () => void;
  onOpenMessage: (conversationId: string) => void;
  onMarkNotificationRead: (id: string) => void;
  onAcceptRequest: (id: string) => void;
  onDeclineRequest: (id: string) => void;
}

function HubRow({
  item,
  onClose,
  onOpenMessage,
  onMarkNotificationRead,
  onAcceptRequest,
  onDeclineRequest,
}: RowProps) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const handleClick = () => {
    if (item.kind === "message" && item.conversationId) {
      onOpenMessage(item.conversationId);
      onClose();
    } else if (item.kind === "notification" && item.notificationId && !item.isRead) {
      onMarkNotificationRead(item.notificationId);
    }
    // Requests are handled by their own buttons; clicking the row is a no-op.
  };

  const isClickable = item.kind === "message" || item.kind === "notification";

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

function safeRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

// ─── Inner panel content (shared by Popover + Sheet) ────────────────────────

interface PanelProps {
  hub: ReturnType<typeof useCommHub>;
  onClose: () => void;
}

function HubPanel({ hub, onClose }: PanelProps) {
  const {
    items,
    unreadCount,
    isLoading,
    isConnected,
    markAllRead,
    openMessage,
    markNotificationRead,
    acceptRequest,
    declineRequest,
  } = hub;

  return (
    <div className="flex flex-col h-full max-h-[70vh] md:max-h-[32rem]">
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

      <div className="px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-green-500" : "bg-gray-400",
            )}
            aria-hidden="true"
          />
          <span className="text-[11px] text-muted-foreground">
            {isConnected ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">You're all caught up</p>
            <p className="text-xs text-muted-foreground mt-1">
              Messages, notifications and connection requests will appear here.
            </p>
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <HubRow
                key={item.id}
                item={item}
                onClose={onClose}
                onOpenMessage={openMessage}
                onMarkNotificationRead={markNotificationRead}
                onAcceptRequest={acceptRequest}
                onDeclineRequest={declineRequest}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── Top-level component ────────────────────────────────────────────────────

export default function CommunicationHub() {
  const { isAuthenticated } = useAuth();
  const hub = useCommHub();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!isAuthenticated) return null;

  const { unreadCount } = hub;

  const triggerButton = (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9"
      aria-label={
        unreadCount > 0 ? `Inbox (${unreadCount} unread)` : "Inbox"
      }
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 text-[10px] flex items-center justify-center"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Button>
  );

  return (
    <>
      {/* Desktop popover */}
      <div className="hidden md:block">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="end">
            <HubPanel hub={hub} onClose={() => setPopoverOpen(false)} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile sheet */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={unreadCount > 0 ? `Inbox (${unreadCount} unread)` : "Inbox"}
          className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 text-[10px] flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="left"
            className="p-0 w-[92vw] max-w-md flex flex-col"
            aria-describedby="comm-hub-description"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Inbox</SheetTitle>
              <SheetDescription id="comm-hub-description">
                Messages, notifications, and connection requests in one place.
              </SheetDescription>
            </SheetHeader>
            <HubPanel hub={hub} onClose={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
