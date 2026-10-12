// "Cash out your points" — one card per redemption kind from the public
// catalog. A card reads "Coming soon" (dashed, dimmed) when none of its SKUs
// are redeemable; the catalog's `available` flag is the SSoT. The Pro card is
// outlined in primary because Pro is the offer we promote.

import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import type { PointsRedemption } from "@/lib/services/points-service";

const KINDS: Array<{
  kind: PointsRedemption["kind"];
  titleKey: string;
  subtitleKey: string;
  featured?: boolean;
}> = [
  { kind: "ai_credits", titleKey: "labels.rewards.aiCreditsTitle", subtitleKey: "labels.rewards.aiCreditsSubtitle" },
  { kind: "premium_month", titleKey: "labels.rewards.proTimeTitle", subtitleKey: "rewards.cashout.proSubtitle", featured: true },
  { kind: "campaign_dollars", titleKey: "labels.rewards.campaignTitle", subtitleKey: "labels.rewards.campaignSubtitle" },
  { kind: "gift_card", titleKey: "labels.rewards.giftCardsTitle", subtitleKey: "labels.rewards.giftCardsSubtitle" },
];

interface Props {
  redemptions: PointsRedemption[] | undefined;
  loading: boolean;
}

export default function CashoutSection({ redemptions, loading }: Props) {
  const { t, i18n } = useTranslation();
  const fmt = (n: number) => n.toLocaleString(i18n.language);

  return (
    <MarketingBand labelledBy="rewards-cashout-heading" className="flex flex-col gap-7">
      <MarketingSectionIntro
        id="rewards-cashout-heading"
        title={t("headings.rewards.cashOutTitle")}
        subtitle={t("rewards.cashout.subtitle")}
      />

      {loading || !redemptions ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] items-start gap-4">
          {KINDS.map(({ kind, titleKey, subtitleKey, featured }) => {
            const items = redemptions.filter((r) => r.kind === kind);
            if (items.length === 0) return null;
            const comingSoon = items.every((sku) => sku.available === false);
            return (
              <div
                key={kind}
                className={cn(
                  "flex flex-col gap-3.5 rounded-[20px] p-[22px]",
                  comingSoon
                    ? "border border-dashed border-input bg-muted/50 text-muted-foreground"
                    : featured
                      ? "border-2 border-primary bg-card p-[21px]"
                      : "border border-border bg-card",
                )}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <strong className={cn("font-display text-xl", comingSoon ? "text-foreground/80" : "text-foreground")}>
                      {t(titleKey)}
                    </strong>
                    {comingSoon && (
                      <span className="rounded-[5px] bg-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-foreground/80">
                        {t("labels.rewards.comingSoon")}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">{t(subtitleKey)}</span>
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-2 text-sm">
                  {items.map((sku) => (
                    <div key={sku.id} className="contents">
                      <dt className={comingSoon ? undefined : "text-foreground"}>{sku.label}</dt>
                      <dd className="font-mono">{t("labels.rewards.ptsValue", { amount: fmt(sku.pointsCost) })}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[13px] text-muted-foreground">{t("rewards.taxLine")}</p>
    </MarketingBand>
  );
}
