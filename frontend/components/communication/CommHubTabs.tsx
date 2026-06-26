/**
 * CommHubTabs — the tabbed body of the Communication Hub overlay.
 *
 * Splits the hub into two tabs so review/feedback engagements have a dedicated
 * home (the explicit "feedback shown in a tab on the global icon" requirement):
 *   • Inbox   — the unified messages / notifications / requests / email feed.
 *   • Reviews — feedback engagements (owned + assigned), via ReviewsInboxPanel.
 *
 * Rendered by both the desktop popover and the mobile sheet so the two surfaces
 * stay identical (DRY). Mounts lazily (only when the overlay is open), so the
 * reviews fetch is on-demand — no app-wide poll.
 */
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { InboxPanel } from "@/components/communication/InboxPanel";
import { ReviewsInboxPanel } from "@/components/communication/ReviewsInboxPanel";
import { useMyReviews } from "@/hooks/use-my-reviews";
import type { HubItem, UseCommHubReturn } from "@/hooks/use-comm-hub";

export interface CommHubTabsProps {
  hub: UseCommHubReturn;
  onClose?: () => void;
  onItemSelect?: (item: HubItem) => void;
  heightClassName?: string;
  hasExternalCloseButton?: boolean;
}

export function CommHubTabs({
  hub,
  onClose,
  onItemSelect,
  heightClassName = "max-h-[70vh] md:max-h-[32rem]",
  hasExternalCloseButton = false,
}: CommHubTabsProps) {
  const { t } = useTranslation();
  // Shared "my-reviews" cache key — the panel reads the same value, one fetch.
  const { actionableCount } = useMyReviews();

  return (
    <Tabs defaultValue="inbox" className="flex min-h-0 flex-1 flex-col">
      <TabsList
        className={cn(
          "m-2 grid shrink-0 grid-cols-2",
          hasExternalCloseButton && "mr-10",
        )}
      >
        <TabsTrigger value="inbox" className="gap-1.5">
          {t("inbox.tabInbox")}
          {hub.unreadCount > 0 && (
            <Badge variant="destructive" className="h-4 min-w-[16px] px-1 text-[10px]">
              {hub.unreadCount > 99 ? "99+" : hub.unreadCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="reviews" className="gap-1.5">
          {t("inbox.tabReviews")}
          {actionableCount > 0 && (
            <Badge variant="destructive" className="h-4 min-w-[16px] px-1 text-[10px]">
              {actionableCount > 99 ? "99+" : actionableCount}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="inbox" className="mt-0 flex min-h-0 flex-1 flex-col">
        <InboxPanel
          hub={hub}
          heightClassName={heightClassName}
          hideHeader
          onClose={onClose}
          onItemSelect={onItemSelect}
        />
      </TabsContent>

      <TabsContent value="reviews" className="mt-0 flex min-h-0 flex-1 flex-col">
        <ReviewsInboxPanel heightClassName={heightClassName} onClose={onClose} />
      </TabsContent>
    </Tabs>
  );
}

export default CommHubTabs;
