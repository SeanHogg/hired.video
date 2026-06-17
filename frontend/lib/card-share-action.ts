// card-share-action — the "Share" entry for the bottom action panel
// (fallbackActions[] style used by PeopleCard / CompanyCard). The dropdown
// menus on Resume / Job cards already share the `EntityShareGroup` cluster;
// this helper covers the parallel pattern for cards that emit
// `DynamicCardAction[]` instead of mounting a menu component directly.
//
// Self-gating is N/A here — Share is available to every viewer, including
// unauthenticated ones (that's the whole point of the unauth-card story).
// Pass `onActions` if the host supplies a legacy share modal callback,
// otherwise the helper falls back to copying the absolute URL with a toast.

import { Share } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { promptDialog } from "@/lib/dialogs";
import i18n from "@/lib/i18n/i18n";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface ShareActionOptions {
  /** Absolute or origin-relative path to the entity (e.g. "/people/jane").
   *  The helper prepends `window.location.origin` at click time so links
   *  always point at the current host (preview vs prod). */
  entityUrl: string;
  /** Optional host-supplied callback. When provided, the legacy share modal
   *  fires instead of the clipboard copy — kept for `card-factory` flows
   *  that route every action through their `interactions` bag. */
  onActions?: () => void;
  /** Toast title shown after a successful clipboard copy. */
  copySuccessTitle?: string;
  /** Toast body shown after a successful clipboard copy. */
  copySuccessDescription?: string;
  /** Button label — defaults to "Share". */
  label?: string;
}

export function buildShareAction({
  entityUrl,
  onActions,
  copySuccessTitle = "Link copied!",
  copySuccessDescription = "Link has been copied to your clipboard.",
  label = "Share",
}: ShareActionOptions): DynamicCardAction {
  return {
    id: "share",
    label,
    variant: "default",
    icon: Share,
    onClick: () => {
      if (onActions) {
        onActions();
        return;
      }
      const url = `${window.location.origin}${entityUrl.startsWith("/") ? "" : "/"}${entityUrl}`;
      navigator.clipboard
        .writeText(url)
        .then(() => {
          toast({
            title: copySuccessTitle,
            description: copySuccessDescription,
          });
        })
        .catch(async () => {
          await promptDialog({ title: i18n.t("dialogs.share.copyLinkTitle"), label: i18n.t("dialogs.share.copyLinkLabel"), defaultValue: url });
        });
    },
  };
}
