// "Badges you can win" — the public job-seeker badge catalog as simple
// tiles (icon in a ringed circle + name). Data comes from the page's
// showcase-badges query; this component only renders.

import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { badgeIconFor } from "@/components/badges/BadgeIcon";
import type { ShowcaseBadge } from "@/lib/services/points-service";

interface Props {
  badges: ShowcaseBadge[] | undefined;
  loading: boolean;
}

export default function RewardsBadgesSection({ badges, loading }: Props) {
  const { t } = useTranslation();

  return (
    <MarketingBand tone="card" labelledBy="rewards-badges-heading" className="flex flex-col gap-7">
      <MarketingSectionIntro
        id="rewards-badges-heading"
        title={t("headings.rewards.badgesYouCanWin")}
        subtitle={t("messages.rewards.badgesDesc")}
      />
      {loading || !badges ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))] gap-3.5">
          {badges.map((b) => {
            const Icon = badgeIconFor(b.iconKey);
            return (
              <li
                key={b.id}
                title={b.description}
                className="flex flex-col items-center gap-2.5 rounded-2xl bg-background px-2.5 py-[18px] text-center"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-primary shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.3)]">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <strong className="text-sm text-foreground">{b.name}</strong>
              </li>
            );
          })}
        </ul>
      )}
    </MarketingBand>
  );
}
