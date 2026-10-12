import type { TFunction } from "i18next";
import { ShoppingBag, Sparkles, User as UserIcon } from "lucide-react";
import type { OwnedTemplate } from "@/lib/studio/landing/types";

/** Label / icon / tone per owned-template provenance — shared by the owned
 *  card and the Templates table's "Source" column. */
export function provenanceBadge(t: TFunction): Record<
  OwnedTemplate["provenance"],
  {
    label: string;
    Icon: typeof UserIcon;
    iconClassName: string;
    pillClassName: string;
    fallbackBlurb: string;
  }
> {
  return {
    created: {
      label: t("labels.studioLanding.provenanceYours"),
      Icon: UserIcon,
      iconClassName: "bg-accent text-primary",
      pillClassName: "bg-primary/90 text-primary-foreground",
      fallbackBlurb: t("messages.studioLanding.provenanceYoursBlurb"),
    },
    purchased: {
      label: t("labels.studioLanding.provenancePurchased"),
      Icon: ShoppingBag,
      iconClassName: "bg-brand-green/15 text-brand-green-text",
      pillClassName: "bg-brand-green text-primary-foreground",
      fallbackBlurb: t("messages.studioLanding.provenancePurchasedBlurb"),
    },
    claimed: {
      label: t("labels.studioLanding.provenanceClaimed"),
      Icon: Sparkles,
      iconClassName: "bg-muted text-foreground",
      pillClassName: "bg-ink/90 text-ink-foreground",
      fallbackBlurb: t("messages.studioLanding.provenanceClaimedBlurb"),
    },
  };
}
