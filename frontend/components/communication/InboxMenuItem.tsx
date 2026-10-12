/**
 * InboxMenuItem — "Inbox" with its unread count as a plain menu item for
 * embedding INSIDE an existing DropdownMenuContent. Reads the shared hub, so
 * the row and the avatar's own unread badge (useInboxUnreadCount) always agree
 * without anything being prop-drilled.
 *
 * The overlay it opens is mounted by the chrome (<InboxOverlay />), because a
 * menu row unmounts the moment the menu closes.
 */
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { MenuItemCount } from "@/components/ui/menu-item-count";
import { useInboxUnreadCount } from "@/hooks/use-inbox-unread-count";

export function InboxMenuItem({ onSelect }: { onSelect: () => void }): JSX.Element {
  const { t } = useTranslation();
  const unreadCount = useInboxUnreadCount();

  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Send className="mr-2 h-4 w-4" aria-hidden="true" />
      {t("inbox.tabInbox")}
      <MenuItemCount count={unreadCount} />
    </DropdownMenuItem>
  );
}
