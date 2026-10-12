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
import { toast } from "@/hooks/use-toast";
import { promptDialog } from "@/lib/dialogs";
import i18n from "@/lib/i18n/i18n";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface ShareActionOptions {
  /** Absolute or origin-relative path to the entity (e.g. "/people/jane").
   *  The helper prepends `window.location.origin` at click time so links
   *  always point at the current host (preview vs prod). */
  entityUrl: string;
  /** Short title for the share intents (tweet text, email subject). */
  shareTitle?: string;
  /** Longer body for email / WhatsApp prefix. */
  shareText?: string;
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

/**
 * The "Share" card action. Carries a `share` payload so the rich renderer
 * (CardActions) surfaces the full social ShareMenu — LinkedIn / X / Facebook
 * / WhatsApp / Email / copy link / native — across every card. `onClick`
 * remains a copy-link fallback for renderers that don't special-case share.
 */
export function buildShareAction({
  entityUrl,
  shareTitle,
  shareText,
  onActions,
  copySuccessTitle = "Link copied!",
  copySuccessDescription = "Link has been copied to your clipboard.",
  label = "Share",
}: ShareActionOptions): DynamicCardAction {
  const absoluteUrl = `${window.location.origin}${entityUrl.startsWith("/") ? "" : "/"}${entityUrl}`;
  return {
    id: "share",
    label,
    variant: "default",
    icon: Share,
    // Rich social targets — consumed by CardActions. Omitted when a host
    // callback owns the share UX (`onActions`), so that legacy path is unchanged.
    share: onActions ? undefined : { url: absoluteUrl, title: shareTitle, text: shareText },
    onClick: () => {
      if (onActions) {
        onActions();
        return;
      }
      navigator.clipboard
        .writeText(absoluteUrl)
        .then(() => {
          toast({
            title: copySuccessTitle,
            description: copySuccessDescription,
          });
        })
        .catch(async () => {
          await promptDialog({ title: i18n.t("dialogs.share.copyLinkTitle"), label: i18n.t("dialogs.share.copyLinkLabel"), defaultValue: absoluteUrl });
        });
    },
  };
}
