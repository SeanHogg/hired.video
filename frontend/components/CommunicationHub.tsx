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

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function CommunicationHub() {
  const { isAuthenticated } = useAuth();
  // Self-gate: anonymous visitors never mount the inner component, so the
  // shared hub's data path is never touched without a token. The provider
  // itself short-circuits via `useApiReady` regardless.
  if (!isAuthenticated) return null;
  return <AuthenticatedCommunicationHub />;
}

function AuthenticatedCommunicationHub() {
  const hub = useSharedCommHub();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

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
            <InboxPanel hub={hub} onClose={() => setPopoverOpen(false)} />
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
            <InboxPanel hub={hub} onClose={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
