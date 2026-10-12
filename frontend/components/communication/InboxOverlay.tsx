/**
 * InboxOverlay — the unified inbox as a controlled drawer.
 *
 * Owns only the Sheet chrome plus the "what does clicking a row do" routing;
 * the body is `CommHubTabs` so the same view also mounts inline on /outreach.
 * Controlled (open / onOpenChange) because the trigger now lives in the avatar
 * menu (<InboxMenuItem />), which unmounts when the menu closes — the overlay
 * therefore has to be mounted by the chrome, not by the trigger.
 *
 * Self-gating: anonymous visitors render nothing, so the shared hub's data
 * path is never touched without a token.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useSharedCommHub } from "@/providers/CommHubProvider";
import { CommHubTabs } from "@/components/communication/CommHubTabs";
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

export interface InboxOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InboxOverlay(props: InboxOverlayProps): JSX.Element | null {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  return <AuthenticatedInboxOverlay {...props} />;
}

function AuthenticatedInboxOverlay({ open, onOpenChange }: InboxOverlayProps): JSX.Element {
  const { t } = useTranslation();
  const hub = useSharedCommHub();
  const navigate = useNavigate();

  // Clicking a row must DO something: messages open the chat widget in place;
  // a notification that carries a `data.url` deep-link jumps straight to its
  // target (badge → gamification, certificate → /verify/:n, assignment →
  // /tools?tab=learning); everything else (synced emails, requests, link-less
  // notifications) deep-links into the full /outreach Inbox tab. The InboxRow's
  // own onSelect path still marks the clicked row read on the way.
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
      onOpenChange(false);
    },
    [hub, navigate, onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-screen max-w-none flex-col p-0 sm:max-w-md"
        aria-describedby="inbox-overlay-description"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t("inbox.tabInbox")}</SheetTitle>
          <SheetDescription id="inbox-overlay-description">
            {t("inbox.overlayDescription")}
          </SheetDescription>
        </SheetHeader>
        {/* Fill the full-height sheet so the list + pinned footer reach the
            bottom edge — without an explicit height the panel falls back to
            its `max-h-[70vh]` overlay cap and leaves dead whitespace below. */}
        <CommHubTabs
          hub={hub}
          heightClassName="h-full min-h-0"
          hasExternalCloseButton
          onClose={() => onOpenChange(false)}
          onItemSelect={handleItemSelect}
        />
      </SheetContent>
    </Sheet>
  );
}
