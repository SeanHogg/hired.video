/**
 * ProUpsellCard — the ONE Pro offer, shown only after a successful post and
 * only to free users. Price via useProMonthlyPriceLabel (shared/pricing.ts).
 */
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProMonthlyPriceLabel } from "@/hooks/use-pro-price-label";

export default function ProUpsellCard({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const price = useProMonthlyPriceLabel();
  const perks = [t("studio.share.pro.noWatermark"), t("studio.share.pro.unlimited"), t("studio.share.pro.agent")];
  return (
    <section
      className="flex flex-col gap-3 rounded-[14px] bg-accent p-4 ring-1 ring-inset ring-primary/25"
      aria-labelledby="share-pro-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3
          id="share-pro-heading"
          className="font-display text-xl font-bold tracking-[-0.01em] text-accent-foreground"
        >
          {t("studio.share.pro.heading")}
        </h3>
        <span className="text-[15px] font-bold text-accent-foreground">
          {t("studio.share.pro.perMonth", { price })}
        </span>
      </div>
      <ul className="flex flex-col gap-2 text-sm text-foreground">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5">
            <Check className="h-[18px] w-[18px] shrink-0 text-brand-green-text" strokeWidth={2.6} aria-hidden="true" />
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/pricing"
        onClick={onNavigate}
        className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground hover:bg-primary/90"
      >
        {t("studio.share.pro.upgradeFor", { price })}
      </Link>
    </section>
  );
}
