/**
 * CommunicationHub — header trigger + overlay for the unified inbox.
 *
 * Owns only the trigger button and the Popover/Sheet chrome; the inbox
 * body is delegated to `InboxPanel` so the same view can also be mounted
 * inline on the /outreach page.
 *
 * Layout:
 *   - md and up → Popover anchored to the trigger button
 *   - mobile    → full-height left Sheet (same a11y pattern as the Studio drawer)
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useSharedCommHub } from "@/providers/CommHubProvider";
import { InboxPanel } from "@/components/communication/InboxPanel";
import type { HubItem } from "@/hooks/use-comm-hub";

/**
 * Static notification-type → deep-link map. Used as the fallback target
 * when a notification row carries no per-row `data.url` (the primary,
 * payload-driven deep-link). Lets type-keyed system notifications jump to
 * a sensible destination without the emitter having to stamp a url on
 * every row. Reporter-facing rows (e.g. `moderation_report_resolved`) are
 * intentionally absent so they fall through to the /outreach inbox tab
 * where the reporter's follow-up thread lives.
 */
const NOTIFICATION_TYPE_DEEP_LINK: Record<string, string> = {
  // Admin/staff-facing moderation events route to the moderation queue
  // (the same surface the /admin/moderation nav icon points at).
  moderation_report_filed: "/admin/moderation",
  moderation_action_taken: "/admin/moderation",
};

export default function CommunicationHub({
  /** Bell button style — defaults to the borderless "ghost". The top nav
   *  passes "outline" so it matches the cart's bordered-box chrome. */
  variant = "ghost",
}: { variant?: ButtonProps["variant"] } = {}) {
  const { isAuthenticated } = useAuth();
  // Self-gate: anonymous visitors never mount the inner component, so the
  // shared hub's data path is never touched without a token. The provider
  // itself short-circuits via `useApiReady` regardless.
  if (!isAuthenticated) return null;
  return <AuthenticatedCommunicationHub variant={variant} />;
}

function AuthenticatedCommunicationHub({ variant = "ghost" }: { variant?: ButtonProps["variant"] }) {
  const hub = useSharedCommHub();
  const navigate = useNavigate();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { unreadCount } = hub;

  // Clicking a row in the header overlay must DO something — before this the
  // popover passed no `onItemSelect`, so the only effect of a click was a
  // silent mark-read (and only when already unread). Messages open the chat
  // widget in place; a notification that carries a `data.url` deep-link jumps
  // straight to its target (badge → gamification, certificate → /verify/:n,
  // assignment → /tools?tab=learning); everything else (synced emails,
  // requests, link-less notifications) deep-links into the full /outreach Inbox
  // tab. The InboxRow's own onSelect path still marks the clicked
  // notification/email read on the way.
  const handleItemSelect = useCallback(
    (item: HubItem) => {
      const deepLink =
        item.kind === "notification"
          ? typeof item.data?.url === "string"
            ? item.data.url
            : NOTIFICATION_TYPE_DEEP_LINK[item.iconType] ?? null
          : null;
      if (item.kind === "message" && item.conversationId) {
        hub.openMessage(item.conversationId);
      } else if (deepLink) {
        navigate(deepLink);
      } else {
        const params = new URLSearchParams({ tab: "inbox", item: item.id });
        navigate(`/outreach?${params.toString()}`);
      }
      setPopoverOpen(false);
      setSheetOpen(false);
    },
    [hub, navigate],
  );

  const triggerButton = (
    <Button
      variant={variant}
      size="icon"
      className="relative"
      aria-label={
        unreadCount > 0 ? `Inbox (${unreadCount} unread)` : "Inbox"
      }
    >
      <Send className="h-5 w-5" />
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
            <InboxPanel
              hub={hub}
              onClose={() => setPopoverOpen(false)}
              onItemSelect={handleItemSelect}
            />
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
          <Send className="h-5 w-5" />
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
            <InboxPanel
              hub={hub}
              onClose={() => setSheetOpen(false)}
              onItemSelect={handleItemSelect}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
